from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import os
import requests
from pydantic import BaseModel
from typing import List, Dict, Any
from proxmox_engine import ProxmoxEngine
from security_check import verify_security_env

# 1. Run Security Verification before starting
verify_security_env()

app = FastAPI(title="InfraLens API")

# 2. Configure CORS - Restricting to your local dev ports for security
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
    history: List[ChatMessage]  # Receives the memory from React

@app.get("/api/v1/infrastructure")
async def get_infrastructure():
    """
    Dynamically discovers the lab setup.
    """
    return engine.discover_infrastructure()

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
    # Binding to 127.0.0.1 for local security
    uvicorn.run(app, host="127.0.0.1", port=8000)