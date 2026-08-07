import os
import socket
import time

import urllib3
from proxmoxer import ProxmoxAPI

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


class ProxmoxEngine:
    def __init__(self, host, user, token_name, token_value, verify_ssl=False):
        self.host = (
            host.replace("https://", "").replace("http://", "").split(":")[0].strip()
        )
        self.telemetry_cache = {}

        pve_port = int(os.getenv("PVE_PORT", 8006))

        try:
            self.pve = ProxmoxAPI(
                self.host,
                user=user,
                token_name=token_name,
                token_value=token_value,
                verify_ssl=verify_ssl,
                port=pve_port,
                timeout=10,
            )
            print(f"ProxmoxEngine connected to: {self.host} on port {pve_port}")
        except Exception as e:
            print(f"Connection Error: {e}")

    def _format_uptime(self, seconds):
        if not seconds or seconds == 0:
            return "0m"
        days = seconds // 86400
        hours = (seconds % 86400) // 3600
        minutes = (seconds % 3600) // 60
        if days > 0:
            return f"{int(days)}d {int(hours)}h"
        if hours > 0:
            return f"{int(hours)}h {int(minutes)}m"
        return f"{int(minutes)}m"

    def _get_system_dns(self):
        try:
            if os.path.exists("/etc/resolv.conf"):
                with open("/etc/resolv.conf", "r") as f:
                    for line in f:
                        if line.startswith("nameserver"):
                            return line.split()[1]
            return socket.gethostbyname(socket.gethostname())
        except:
            return None

    def _format_bytes(self, size_in_bytes, speed=False):
        if not size_in_bytes or size_in_bytes <= 0:
            return "0 B/s" if speed else "0 B"
        for unit in ["B", "KB", "MB", "GB", "TB"]:
            if size_in_bytes < 1024.0:
                suffix = f"{unit}/s" if speed else unit
                return f"{size_in_bytes:.1f} {suffix}"
            size_in_bytes /= 1024.0
        return f"{size_in_bytes:.1f} PB"

    def _calc_speed(self, vmid, metric_name, current_val):
        now = time.time()
        cache_key = f"{vmid}_{metric_name}"
        if cache_key in self.telemetry_cache:
            last_val, last_time = self.telemetry_cache[cache_key]
            time_diff = now - last_time
            speed = (current_val - last_val) / time_diff if time_diff > 0 else 0
        else:
            speed = 0
        self.telemetry_cache[cache_key] = (current_val, now)
        return speed

    def _get_ip(self, node, vmid, is_lxc=True):
        try:
            if is_lxc:
                for iface in self.pve.nodes(node).lxc(vmid).interfaces.get():
                    if iface.get("name") != "lo" and iface.get("inet"):
                        return iface["inet"].split("/")[0]
            else:
                agent = (
                    self.pve.nodes(node)
                    .qemu(vmid)
                    .agent.get("network-get-interfaces")
                    .get("result", [])
                )
                for iface in agent:
                    for addr in iface.get("ip-addresses", []):
                        if (
                            addr.get("ip-address-type") == "ipv4"
                            and addr.get("ip-address") != "127.0.0.1"
                        ):
                            return addr["ip-address"]
        except:
            return None
        return None

    def resolve_target(self, node_id):
        node_id = str(node_id)
        try:
            p_nodes = self.pve.nodes.get()
        except Exception as e:
            print(f"[engine] resolve_target: cannot list nodes: {e}")
            return None

        host_names = [n.get("node") for n in p_nodes]

        if node_id in host_names:
            return {"kind": "host", "node": node_id}

        for host_name in host_names:
            try:
                for lxc in self.pve.nodes(host_name).lxc.get():
                    if str(lxc.get("vmid")) == node_id:
                        return {"kind": "lxc", "node": host_name, "vmid": int(node_id)}
            except Exception:
                pass
            try:
                for vm in self.pve.nodes(host_name).qemu.get():
                    if str(vm.get("vmid")) == node_id:
                        return {"kind": "qemu", "node": host_name, "vmid": int(node_id)}
            except Exception:
                pass
        return None

    def get_rrd(self, node_id, timeframe="hour"):
        if timeframe not in ("hour", "day", "week", "month", "year"):
            timeframe = "hour"

        target = self.resolve_target(node_id)
        if not target:
            return {"error": "not_found", "series": {}}

        try:
            if target["kind"] == "host":
                raw = self.pve.nodes(target["node"]).rrddata.get(timeframe=timeframe)
            elif target["kind"] == "lxc":
                raw = (
                    self.pve.nodes(target["node"])
                    .lxc(target["vmid"])
                    .rrddata.get(timeframe=timeframe)
                )
            else:
                raw = (
                    self.pve.nodes(target["node"])
                    .qemu(target["vmid"])
                    .rrddata.get(timeframe=timeframe)
                )
        except Exception as e:
            return {"error": str(e), "series": {}}

        cpu, mem, netin, netout, times = [], [], [], [], []
        for row in raw:
            if "time" not in row:
                continue
            times.append(row.get("time"))
            c = row.get("cpu")
            cpu.append(round(c * 100, 2) if c is not None else None)
            mem_used = row.get("mem", row.get("memused"))
            mem_max = row.get("maxmem", row.get("memtotal"))
            if mem_used is not None and mem_max:
                mem.append(round((mem_used / mem_max) * 100, 2))
            else:
                mem.append(None)
            netin.append(row.get("netin"))
            netout.append(row.get("netout"))

        return {
            "timeframe": timeframe,
            "kind": target["kind"],
            "series": {
                "time": times,
                "cpu": cpu,
                "mem": mem,
                "netin": netin,
                "netout": netout,
            },
        }

    def guest_action(self, node_id, action):
        action = str(action).lower().strip()
        if action not in ("start", "stop", "reboot", "shutdown"):
            return {"ok": False, "detail": f"Unsupported action '{action}'."}

        target = self.resolve_target(node_id)
        if not target:
            return {
                "ok": False,
                "detail": "Target not found. It may have been removed.",
            }
        if target["kind"] == "host":
            return {
                "ok": False,
                "detail": "Power actions apply to VMs and containers, not the host.",
            }

        try:
            node = target["node"]
            vmid = target["vmid"]
            if target["kind"] == "lxc":
                status_ep = self.pve.nodes(node).lxc(vmid).status
            else:
                status_ep = self.pve.nodes(node).qemu(vmid).status

            if action == "start":
                status_ep.start.post()
            elif action == "stop":
                status_ep.stop.post()
            elif action == "shutdown":
                status_ep.shutdown.post()
            elif action == "reboot":
                status_ep.reboot.post()

            verb = {
                "start": "Starting",
                "stop": "Stopping",
                "reboot": "Rebooting",
                "shutdown": "Shutting down",
            }[action]
            return {
                "ok": True,
                "detail": f"{verb} {target['kind'].upper()} {vmid}.",
                "action": action,
            }
        except Exception as e:
            return {"ok": False, "detail": f"Action failed: {e}"}

    def get_tasks(self, limit=15):
        TYPE_LABELS = {
            "qmstart": "Started VM",
            "qmstop": "Stopped VM",
            "qmreboot": "Rebooted VM",
            "qmshutdown": "Shut down VM",
            "qmreset": "Reset VM",
            "qmsuspend": "Suspended VM",
            "qmresume": "Resumed VM",
            "qmigrate": "Migrated VM",
            "qmrestore": "Restored VM",
            "qmclone": "Cloned VM",
            "qmcreate": "Created VM",
            "qmdestroy": "Deleted VM",
            "vzstart": "Started CT",
            "vzstop": "Stopped CT",
            "vzreboot": "Rebooted CT",
            "vzshutdown": "Shut down CT",
            "vzsuspend": "Suspended CT",
            "vzresume": "Resumed CT",
            "vzcreate": "Created CT",
            "vzdestroy": "Deleted CT",
            "vzrestore": "Restored CT",
            "vzmigrate": "Migrated CT",
            "vzdump": "Backup",
            "vzsnapshot": "Snapshot",
            "qmsnapshot": "Snapshot",
            "imgcopy": "Disk copy",
            "download": "Download",
            "aptupdate": "Package update",
            "startall": "Started all",
            "stopall": "Stopped all",
            "spiceproxy": "Console",
            "vncproxy": "Console",
            "srvreload": "Service reload",
        }

        NOISE = {
            "vncproxy",
            "vncshell",
            "spiceproxy",
            "spiceshell",
            "pull_file",
            "termproxy",
            "push_file",
        }

        try:
            p_nodes = self.pve.nodes.get()
        except Exception as e:
            return {"error": str(e), "tasks": []}

        collected = []
        for n in p_nodes:
            host = n.get("node")
            if not host:
                continue
            try:
                rows = self.pve.nodes(host).tasks.get(limit=limit, errors=1)
            except Exception:
                continue
            for t in rows:
                ttype = t.get("type", "")
                if ttype in NOISE:
                    continue
                status = t.get("status")
                if status is None:
                    ok, state = None, "running"
                elif status == "OK":
                    ok, state = True, "ok"
                else:
                    ok, state = False, "error"
                collected.append(
                    {
                        "id": t.get("upid", ""),
                        "type": ttype,
                        "label": TYPE_LABELS.get(ttype, ttype or "Task"),
                        "node": host,
                        "guest": str(t.get("id")) if t.get("id") is not None else None,
                        "user": t.get("user", ""),
                        "starttime": t.get("starttime", 0),
                        "endtime": t.get("endtime", 0),
                        "state": state,
                        "ok": ok,
                    }
                )

        collected.sort(key=lambda x: x.get("starttime", 0), reverse=True)
        return {"tasks": collected[:limit]}

    def discover_infrastructure(self):
        nodes, edges = [], []
        dns_node_id = None
        system_dns_ip = self._get_system_dns()

        try:
            p_nodes = self.pve.nodes.get()
            for p_node in p_nodes:
                host_name = p_node.get("node", "unknown")

                host_status = self.pve.nodes(host_name).status.get()
                host_uptime = self._format_uptime(host_status.get("uptime", 0))

                nodes.append(
                    {
                        "id": host_name,
                        "type": "service",
                        "data": {
                            "label": host_name.upper(),
                            "status": p_node.get("status", "unknown"),
                            "cpu": f"{(float(p_node.get('cpu', 0) or 0) * 100):.1f}%",
                            "ram": f"{self._format_bytes(p_node.get('mem', 0))} / {self._format_bytes(p_node.get('maxmem', 1))}",
                            "disk": f"{self._format_bytes(p_node.get('disk', 0))} / {self._format_bytes(p_node.get('maxdisk', 1))}",
                            "ip": self.host,
                            "os": "Proxmox Host",
                            "tags": ["host"],
                            "uptime": host_uptime,
                            "rx_speed": "N/A",
                            "tx_speed": "N/A",
                        },
                    }
                )

                lxcs = self.pve.nodes(host_name).lxc.get()
                vms = self.pve.nodes(host_name).qemu.get()
                guests = lxcs + vms

                for guest in guests:
                    vmid = str(guest.get("vmid"))
                    is_lxc = "rootfs" in guest or guest.get("type") == "lxc"
                    guest_ip = self._get_ip(host_name, vmid, is_lxc)
                    status = guest.get("status", "stopped")

                    if guest_ip and system_dns_ip and guest_ip == system_dns_ip:
                        dns_node_id = vmid

                    nodes.append(
                        {
                            "id": vmid,
                            "type": "service",
                            "data": {
                                "label": guest.get("name", vmid),
                                "status": status,
                                "uptime": self._format_uptime(guest.get("uptime", 0)),
                                "cpu": f"{(float(guest.get('cpu', 0) or 0) * 100):.1f}%",
                                "ram": f"{self._format_bytes(guest.get('mem', 0))} / {self._format_bytes(guest.get('maxmem', 1))}",
                                "disk": f"{self._format_bytes(guest.get('disk', 0))} / {self._format_bytes(guest.get('maxdisk', 1))}",
                                "rx_speed": self._format_bytes(
                                    self._calc_speed(
                                        vmid, "rx", float(guest.get("netin", 0))
                                    ),
                                    True,
                                ),
                                "tx_speed": self._format_bytes(
                                    self._calc_speed(
                                        vmid, "tx", float(guest.get("netout", 0))
                                    ),
                                    True,
                                ),
                                "ip": guest_ip or "Offline",
                                "tags": guest.get("tags", "").split(","),
                                "os": "LXC" if is_lxc else "VM",
                            },
                        }
                    )
                    edges.append(
                        {
                            "id": f"e-{host_name}-{vmid}",
                            "source": host_name,
                            "target": vmid,
                            "animated": status == "running",
                        }
                    )

            if dns_node_id:
                for node in nodes:
                    if (
                        node["data"].get("tags") != ["host"]
                        and node["id"] != dns_node_id
                        and node["data"].get("status") == "running"
                    ):
                        edges.append(
                            {
                                "id": f"dns-edge-{node['id']}",
                                "source": node["id"],
                                "target": dns_node_id,
                                "animated": True,
                                "style": {
                                    "stroke": "#10b981",
                                    "strokeWidth": 1,
                                    "opacity": 0.2,
                                    "strokeDasharray": "5 5",
                                },
                                "label": "DNS",
                            }
                        )

            return {"nodes": nodes, "edges": edges}
        except Exception as e:
            return {"nodes": [], "edges": [], "error": str(e)}
