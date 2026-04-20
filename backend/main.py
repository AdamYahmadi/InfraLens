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

# 2. Configure CORS - Restricting to local dev ports for security
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 3. Initialize Engine with Environment Variables
engine = ProxmoxEngine(
    host=os.getenv("PVE_HOST"),
    user=os.getenv("PVE_USER"),
    token_name=os.getenv("PVE_TOKEN_NAME"),
    token_value=os.getenv("PVE_TOKEN_VALUE"),
    verify_ssl=os.getenv("PVE_VERIFY_SSL", "False").lower() == "true"
)

# Data Models for the Neural Link Chat Memory
class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    prompt: str
    context: List[Dict[str, Any]]
    history: List[ChatMessage] 

@app.get("/api/v1/infrastructure")
async def get_infrastructure():
    """
    Dynamically discovers the lab setup and probes for sub-services.
    """
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

@app.get("/api/v1/status")
async def get_status():
    return {
        "status": "online", 
        "host": os.getenv("PVE_HOST", "Unknown"), 
        "message": "Connected to Proxmox Live API"
    }

# Local AI Link Endpoint
@app.post("/api/v1/chat")
async def neural_link_chat(request: ChatRequest):
    # 1. Dynamically format ALL live Proxmox data
    lab_state_text = "CURRENT HOMELAB TELEMETRY:\n"
    for node in request.context:
        d = node.get('data', {})
        if d:
            metrics = ", ".join([f"{str(k).upper()}: {str(v)}" for k, v in d.items() if v])
            
            # Include sub-services in the AI context if they exist
            sub_services = d.get('sub_services', [])
            if sub_services:
                metrics += f", RUNNING SERVICES: {', '.join(sub_services)}"
                
            lab_state_text += f"- Node UID [{node.get('id')}]: {metrics}\n"
    
    # 2. Refined System Prompt
    system_prompt = (
        "You are InfraLens, an advanced, tactical AI assistant monitoring a Proxmox homelab. "
        "Your responses should be concise, highly analytical, and conversational. "
        "Do NOT copy-paste raw telemetry logs to the user. Instead, read the telemetry, extract the exact answer, "
        "and present it naturally. Keep answers brief unless asked for a detailed analysis.\n\n"
        f"{lab_state_text}"
    )

    try:
        # 3. Build the conversational message array for Ollama
        messages = [{"role": "system", "content": system_prompt}]
        
        # Append previous chat history so the AI remembers context
        for msg in request.history:
            messages.append({"role": msg.role, "content": msg.content})
            
        # Append the new user question
        messages.append({"role": "user", "content": request.prompt})

        # 4. Use the /api/chat endpoint
        ollama_payload = {
            "model": "llama3", 
            "messages": messages,
            "stream": False
        }
        
        response = requests.post("http://127.0.0.1:11434/api/chat", json=ollama_payload, timeout=30)
        response.raise_for_status()
        
        # Extract the reply from the new JSON structure
        reply = response.json().get("message", {}).get("content", "Error: No response generated.")
        return {"reply": reply}
        
    except requests.exceptions.ConnectionError:
        return {"reply": "[ERR] Cannot reach Ollama at 127.0.0.1:11434. Is the Ollama service running and accessible?"}
    except Exception as e:
        return {"reply": f"[ERR] Neural Link failure: {str(e)}"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)