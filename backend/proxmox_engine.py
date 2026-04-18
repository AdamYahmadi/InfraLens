import os
import requests
import urllib3
from proxmoxer import ProxmoxAPI

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

class ProxmoxEngine:
    def __init__(self, host, user, token_name, token_value, verify_ssl=False):
        self.host = host.replace("https://", "").replace("http://", "").split(":")[0].strip()
        try:
            self.pve = ProxmoxAPI(
                self.host,
                user=user,
                token_name=token_name,
                token_value=token_value,
                verify_ssl=verify_ssl,
                port=8006,
                timeout=10
            )
            print(f"✅ ProxmoxEngine connected to: {self.host} (Full Payload Mode)")
        except Exception as e:
            print(f"❌ Connection Error: {e}")

    def _format_uptime(self, seconds):
        if not seconds:
            return "Offline"
        days = seconds // 86400
        hours = (seconds % 86400) // 3600
        minutes = (seconds % 3600) // 60
        if days > 0:
            return f"{days}d {hours}h"
        if hours > 0:
            return f"{hours}h {minutes}m"
        return f"{minutes}m"

    # Helper to make Disk and Network bytes readable (GB, MB, KB)
    def _format_bytes(self, size_in_bytes):
        if not size_in_bytes:
            return "0 B"
        for unit in ['B', 'KB', 'MB', 'GB', 'TB']:
            if size_in_bytes < 1024.0:
                return f"{size_in_bytes:.1f} {unit}"
            size_in_bytes /= 1024.0
        return f"{size_in_bytes:.1f} PB"

    def _get_ip(self, node, vmid, is_lxc=True):
        try:
            if is_lxc:
                interfaces = self.pve.nodes(node).lxc(vmid).interfaces.get()
                for iface in interfaces:
                    if iface.get('name') == 'lo':
                        continue
                    ip = iface.get('inet', '').split('/')[0]
                    if ip and ip != '127.0.0.1':
                        return ip
            else:
                agent_net = self.pve.nodes(node).qemu(vmid).agent.get("network-get-interfaces")
                for iface in agent_net.get('result', []):
                    for addr in iface.get('ip-addresses', []):
                        if addr.get('ip-address-type') == 'ipv4' and addr.get('ip-address') != '127.0.0.1':
                            return addr['ip-address']
        except:
            return "No Agent" if not is_lxc else "N/A"
        return "N/A"

    def discover_infrastructure(self):
        nodes = []
        edges = []
        try:
            pve_nodes = self.pve.nodes.get()
            for n_idx, p_node in enumerate(pve_nodes):
                name = p_node.get('node', 'unknown')
                status = p_node.get('status', 'unknown')
                
                # --- HOST METRICS ---
                cpu = float(p_node.get('cpu', 0) or 0) * 100
                mem = float(p_node.get('mem', 0) or 0)
                maxmem = float(p_node.get('maxmem', 1) or 1)
                disk = float(p_node.get('rootfs_used', 0) or 0) 
                maxdisk = float(p_node.get('rootfs_total', 1) or 1)
                
                nodes.append({
                    "id": name,
                    "type": "service",
                    "data": {
                        "label": name.upper(),
                        "status": status,
                        "cpu": f"{cpu:.1f}%",
                        "ram": f"{self._format_bytes(mem)} / {self._format_bytes(maxmem)}",
                        "disk": f"{self._format_bytes(disk)} / {self._format_bytes(maxdisk)}",
                        "ip": self.host, 
                        "os": "Proxmox VE (Host)",
                        "uptime": self._format_uptime(int(p_node.get('uptime', 0) or 0)),
                        "net_in": "N/A", # Host network requires deeper API calls, keep simple for now
                        "net_out": "N/A"
                    },
                    "position": {"x": 500 * n_idx, "y": 0}
                })

                # --- LXC METRICS ---
                for i, lxc in enumerate(self.pve.nodes(name).lxc.get()):
                    vmid = str(lxc.get('vmid', ''))
                    l_status = lxc.get('status', 'stopped')
                    
                    nodes.append({
                        "id": vmid,
                        "type": "service",
                        "data": {
                            "label": lxc.get('name', f"LXC-{vmid}"),
                            "status": l_status,
                            "cpu": f"{(float(lxc.get('cpu', 0) or 0) * 100):.1f}%",
                            "ram": f"{self._format_bytes(lxc.get('mem', 0))} / {self._format_bytes(lxc.get('maxmem', 1))}",
                            "disk": f"{self._format_bytes(lxc.get('disk', 0))} / {self._format_bytes(lxc.get('maxdisk', 1))}",
                            "ip": self._get_ip(name, vmid, is_lxc=True) if l_status == 'running' else "Offline",
                            "os": "LXC Container",
                            "uptime": self._format_uptime(int(lxc.get('uptime', 0) or 0)),
                            "net_in": self._format_bytes(lxc.get('netin', 0)),
                            "net_out": self._format_bytes(lxc.get('netout', 0)),
                            "vmid": vmid
                        },
                        "position": {"x": (500 * n_idx) - 250 + (i * 250), "y": 200}
                    })
                    edges.append({"id": f"e-{name}-{vmid}", "source": name, "target": vmid, "animated": l_status == 'running'})

                # --- VM METRICS ---
                for i, vm in enumerate(self.pve.nodes(name).qemu.get()):
                    vmid = str(vm.get('vmid', ''))
                    v_status = vm.get('status', 'stopped')
                    v_cpus = vm.get('cpus', 1)
                    
                    nodes.append({
                        "id": vmid,
                        "type": "service",
                        "data": {
                            "label": vm.get('name', f"VM-{vmid}"),
                            "status": v_status,
                            "cpu": f"{(float(vm.get('cpu', 0) or 0) * 100):.1f}%",
                            "ram": f"{self._format_bytes(vm.get('mem', 0))} / {self._format_bytes(vm.get('maxmem', 1))}",
                            "disk": f"{self._format_bytes(vm.get('disk', 0))} / {self._format_bytes(vm.get('maxdisk', 1))}",
                            "ip": self._get_ip(name, vmid, is_lxc=False) if v_status == 'running' else "Offline",
                            "os": f"VM ({v_cpus} vCPU)",
                            "uptime": self._format_uptime(int(vm.get('uptime', 0) or 0)),
                            "net_in": self._format_bytes(vm.get('netin', 0)),
                            "net_out": self._format_bytes(vm.get('netout', 0)),
                            "vmid": vmid
                        },
                        "position": {"x": (500 * n_idx) - 250 + (i * 250), "y": 400} 
                    })
                    edges.append({"id": f"e-{name}-{vmid}", "source": name, "target": vmid, "animated": v_status == 'running'})

            return {"nodes": nodes, "edges": edges}
        except Exception as e:
            return {"nodes": [], "edges": [], "error": str(e)}