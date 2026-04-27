from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import os
import requests
from pydantic import BaseModel
from typing import List, Dict, Any
from proxmox_engine import ProxmoxEngine
from security_check import verify_security_env
from service_probe import probe_engine

# 1. Run Security Verification before starting
verify_security_env()

app = FastAPI(title="InfraLens API")

# 2. Configure CORS - Wildcard allows ANY port
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  
    allow_credentials=False,  
    allow_methods=["*"],
    allow_headers=["*"],
)

# 3. Initialize Engine
engine = ProxmoxEngine(
    host=os.getenv("PVE_HOST"),
    user=os.getenv("PVE_USER"),
    token_name=os.getenv("PVE_TOKEN_NAME"),
    token_value=os.getenv("PVE_TOKEN_VALUE"),
    verify_ssl=os.getenv("PVE_VERIFY_SSL", "False").lower() == "true"
)

class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    prompt: str
    context: List[Dict[str, Any]]
    history: List[ChatMessage] 

@app.get("/api/v1/infrastructure")
async def get_infrastructure():
    print("\n[API] /api/v1/infrastructure called")
    try:
        infra = engine.discover_infrastructure()
        nodes = infra.get("nodes", [])
        
        print(f"[API] Engine successfully discovered {len(nodes)} nodes.")
        
        for node in nodes:
            vmid = node.get("id")
            node_type = node.get("data", {}).get("os", "")
            node["data"]["sub_services"] = []
            
            if "LXC" in str(node_type).upper():
                try:
                    services = probe_engine.get_lxc_services(str(vmid))
                    if services:
                        node["data"]["sub_services"] = services
                        if any("docker" in str(s).lower() for s in services) and "docker" not in node["data"].get("tags", []):
                            node["data"]["tags"].append("docker")
                except Exception as probe_error:
                    print(f"[API] WARNING: SSH Probe failed on LXC {vmid} -> {probe_error}")
                    
        return infra
    except Exception as e:
        print(f"[API] FATAL ERROR in get_infrastructure: {str(e)}")
        return {"nodes": [], "edges": [], "error": str(e)}

@app.post("/api/v1/chat")
async def neural_link_chat(request: ChatRequest):
    lab_state_text = "<RAW_TELEMETRY>\n"
    for node in request.context:
        d = node.get('data', {})
        if d:
            services = ", ".join(d.get('sub_services', []))
            cpu = d.get('cpu', 'N/A')
            ram = d.get('ram', 'N/A')
            disk = d.get('disk', 'N/A')
            uptime = d.get('uptime', 'N/A')
            
            lab_state_text += f"[{d.get('label')}] IP: {d.get('ip')} | Status: {d.get('status')} | CPU: {cpu} | RAM: {ram} | Disk: {disk} | Uptime: {uptime} | Apps: {services}\n"
    lab_state_text += "</RAW_TELEMETRY>"
        
    system_prompt = f"""You are InfraLens, a sharp systems engineer, monitoring this Proxmox lab.
        You are conversational, tactical, and highly analytical.

        BEHAVIORAL RULES:
        1. Greet the user naturally if they say Hi.
        2. State facts directly. Do not say 'According to the telemetry'.
        3. Refer to nodes by their Labels, not their ID numbers.
        4. Keep answers short, BUT use highly structured formatting for readability.

        CRITICAL FORMATTING RULES - DO NOT IGNORE:
        You MUST translate <RAW_TELEMETRY> into professional Markdown.
        You have a wide screen now. Use Markdown Headers (###) to separate distinct thoughts or data types.

        WHEN LISTING CONTAINERS, USE THIS EXACT FORMAT:
        ### Active Infrastructure
        - **[Node Name]** (IP: [IP])
          - Status: [Status]
          - Running: [Services]
          - Hardware: 
            - CPU: [CPU]
            - RAM: [RAM]
            - Disk: [Disk]

        WHEN CREATING A TABLE, USE THIS EXACT FORMAT. DO NOT SKIP COLUMNS:
        ### Infrastructure Summary
        | Node | Status | IP | CPU | RAM | Services |
        |---|---|---|---|---|---|
        | Name | Status | IP | CPU | RAM | Apps |

        {lab_state_text}
        """

    try:
        messages = [{"role": "system", "content": system_prompt}]
        
        for msg in request.history[-5:]:
            messages.append({"role": msg.role, "content": msg.content})
            
        messages.append({"role": "user", "content": request.prompt})

        ollama_payload = {
            "model": "llama3", 
            "messages": messages,
            "stream": False
        }
        
        # Dynamically pull Ollama URL, defaulting to localhost
        ollama_url = os.getenv("OLLAMA_URL", "http://127.0.0.1:11434")
        
        response = requests.post(f"{ollama_url}/api/chat", json=ollama_payload, timeout=30)
        response.raise_for_status()
        
        reply = response.json().get("message", {}).get("content", "Neural Link timeout.")
        return {"reply": reply}
        
    except Exception as e:
        return {"reply": f"Neural Link failure: {str(e)}"}

if __name__ == "__main__":
    import uvicorn
    # Allow the port to be defined by environment variables (default 8000)
    api_port = int(os.getenv("API_PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=api_port)