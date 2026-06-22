import paramiko
import os
import re
import json
from dotenv import load_dotenv

load_dotenv()

class ServiceProbe:
    def __init__(self):
        self.host = os.getenv("PVE_HOST")
        self.user = os.getenv("PVE_SSH_USER", "root")
        self.password = os.getenv("PVE_SSH_PASSWORD")
        
        self.ignore_list = set()
        self.service_map = {}
        self._load_config()

    def _load_config(self):
        """Loads filtering rules from an external JSON file."""
        config_path = os.path.join(os.path.dirname(__file__), 'probe_config.json')
        try:
            if os.path.exists(config_path):
                with open(config_path, 'r') as f:
                    config = json.load(f)
                    self.ignore_list = set(config.get("ignore_list", []))
                    self.service_map = config.get("service_map", {})
        except Exception as e:
            print(f"[Probe Warning] Could not load probe_config.json: {e}")

    def _execute_ssh(self, command: str) -> str:
        if not self.host or not self.password:
            print("[Probe] Missing credentials in .env")
            return ""
            
        client = paramiko.SSHClient()
        try:
            client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
            client.connect(
                self.host, 
                username=self.user, 
                password=self.password, 
                timeout=5,
                banner_timeout=200,
                look_for_keys=False
            )
            
            stdin, stdout, stderr = client.exec_command(command)
            return stdout.read().decode('utf-8').strip()
        except Exception as e:
            print(f"[Probe Error] SSH connection failed: {e}")
            return ""
        finally:
            client.close()

    def get_lxc_services(self, vmid: str) -> list:
        discovered_services = set()
        
        # 1. Probe Docker
        docker_cmd = f"pct exec {vmid} -- sh -c 'command -v docker >/dev/null && docker ps --format \"{{{{.Names}}}}\"'"
        docker_out = self._execute_ssh(docker_cmd)
        
        if docker_out and "not found" not in docker_out.lower():
            for line in docker_out.split('\n'):
                if line.strip():
                    discovered_services.add(line.strip())

        # 2. Probe Native Sockets
        ss_cmd = f"pct exec {vmid} -- ss -tulnp"
        ss_out = self._execute_ssh(ss_cmd)
        
        if ss_out:
            matches = re.findall(r'users:\(\("([^"]+)"', ss_out)
            
            for name in matches:
                clean_name = name.lower()
                
                # Check against the dynamic JSON config
                if clean_name not in self.ignore_list:
                    for trigger, mapped_name in self.service_map.items():
                        if trigger in clean_name:
                            clean_name = mapped_name
                            break 
                    
                    discovered_services.add(clean_name)
                    
        return sorted(list(discovered_services))

probe_engine = ServiceProbe()