import os
import requests
import urllib3
import time
import socket
from proxmoxer import ProxmoxAPI

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

class ProxmoxEngine:
    def __init__(self, host, user, token_name, token_value, verify_ssl=False):
        self.host = host.replace("https://", "").replace("http://", "").split(":")[0].strip()
        self.telemetry_cache = {} 
        
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
            print(f"✅ ProxmoxEngine connected to: {self.host}")
        except Exception as e:
            print(f"❌ Connection Error: {e}")

    def _format_uptime(self, seconds):
        if not seconds or seconds == 0: return "0m"
        days = seconds // 86400
        hours = (seconds % 86400) // 3600
        minutes = (seconds % 3600) // 60
        if days > 0: return f"{int(days)}d {int(hours)}h"
        if hours > 0: return f"{int(hours)}h {int(minutes)}m"
        return f"{int(minutes)}m"

    def _get_system_dns(self):
        try:
            if os.path.exists('/etc/resolv.conf'):
                with open('/etc/resolv.conf', 'r') as f:
                    for line in f:
                        if line.startswith('nameserver'):
                            return line.split()[1]
            return socket.gethostbyname(socket.gethostname())
        except: return None

    def _format_bytes(self, size_in_bytes, speed=False):
        if not size_in_bytes or size_in_bytes <= 0: return "0 B/s" if speed else "0 B"
        for unit in ['B', 'KB', 'MB', 'GB', 'TB']:
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
        else: speed = 0
        self.telemetry_cache[cache_key] = (current_val, now)
        return speed

    def _get_ip(self, node, vmid, is_lxc=True):
        try:
            if is_lxc:
                for iface in self.pve.nodes(node).lxc(vmid).interfaces.get():
                    if iface.get('name') != 'lo' and iface.get('inet'):
                        return iface['inet'].split('/')[0]
            else:
                agent = self.pve.nodes(node).qemu(vmid).agent.get("network-get-interfaces").get('result', [])
                for iface in agent:
                    for addr in iface.get('ip-addresses', []):
                        if addr.get('ip-address-type') == 'ipv4' and addr.get('ip-address') != '127.0.0.1':
                            return addr['ip-address']
        except: return None
        return None

    def discover_infrastructure(self):
        nodes, edges = [], []
        dns_node_id = None
        system_dns_ip = self._get_system_dns()
        
        try:
            p_nodes = self.pve.nodes.get()
            for p_node in p_nodes:
                host_name = p_node.get('node', 'unknown')
                
                host_status = self.pve.nodes(host_name).status.get()
                host_uptime = self._format_uptime(host_status.get('uptime', 0))

                nodes.append({
                    "id": host_name, "type": "service",
                    "data": {
                        "label": host_name.upper(), 
                        "status": p_node.get('status', 'unknown'),
                        "cpu": f"{(float(p_node.get('cpu', 0) or 0) * 100):.1f}%",
                        "ram": f"{self._format_bytes(p_node.get('mem', 0))} / {self._format_bytes(p_node.get('maxmem', 1))}",
                        "disk": f"{self._format_bytes(p_node.get('disk', 0))} / {self._format_bytes(p_node.get('maxdisk', 1))}",
                        "ip": self.host, 
                        "os": "Proxmox Host", 
                        "tags": ["host"],
                        "uptime": host_uptime, 
                        "rx_speed": "N/A", "tx_speed": "N/A"
                    }
                })

                lxcs = self.pve.nodes(host_name).lxc.get()
                vms = self.pve.nodes(host_name).qemu.get()
                guests = lxcs + vms

                for guest in guests:
                    vmid = str(guest.get('vmid'))
                    is_lxc = 'rootfs' in guest or guest.get('type') == 'lxc'
                    guest_ip = self._get_ip(host_name, vmid, is_lxc)
                    status = guest.get('status', 'stopped')
                    
                    if guest_ip and system_dns_ip and guest_ip == system_dns_ip:
                        dns_node_id = vmid

                    nodes.append({
                        "id": vmid, "type": "service",
                        "data": {
                            "label": guest.get('name', vmid), 
                            "status": status,
                            "uptime": self._format_uptime(guest.get('uptime', 0)), # 🚀 FIXED
                            "cpu": f"{(float(guest.get('cpu', 0) or 0) * 100):.1f}%",
                            "ram": f"{self._format_bytes(guest.get('mem', 0))} / {self._format_bytes(guest.get('maxmem', 1))}",
                            "disk": f"{self._format_bytes(guest.get('disk', 0))} / {self._format_bytes(guest.get('maxdisk', 1))}",
                            "rx_speed": self._format_bytes(self._calc_speed(vmid, 'rx', float(guest.get('netin', 0))), True),
                            "tx_speed": self._format_bytes(self._calc_speed(vmid, 'tx', float(guest.get('netout', 0))), True),
                            "ip": guest_ip or "Offline", 
                            "tags": guest.get('tags', '').split(','), 
                            "os": "LXC" if is_lxc else "VM"
                        }
                    })
                    edges.append({"id": f"e-{host_name}-{vmid}", "source": host_name, "target": vmid, "animated": status == 'running'})

            if dns_node_id:
                for node in nodes:
                    if node['data'].get('tags') != ["host"] and node['id'] != dns_node_id and node['data'].get('status') == 'running':
                        edges.append({
                            "id": f"dns-edge-{node['id']}", "source": node['id'], "target": dns_node_id,
                            "animated": True,
                            "style": { "stroke": "#10b981", "strokeWidth": 1, "opacity": 0.2, "strokeDasharray": "5 5" },
                            "label": "DNS"
                        })

            return {"nodes": nodes, "edges": edges}
        except Exception as e:
            return {"nodes": [], "edges": [], "error": str(e)}