from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import os
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

if __name__ == "__main__":
    import uvicorn
    # Binding to 127.0.0.1 for local security
    uvicorn.run(app, host="127.0.0.1", port=8000)