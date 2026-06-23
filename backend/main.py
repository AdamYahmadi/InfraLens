import os
from pathlib import Path
from typing import List, Dict, Any

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import requests

import config_store
import manager

APP_VERSION = os.getenv("INFRALENS_VERSION", "0.1.0")

app = FastAPI(title="InfraLens API", version=APP_VERSION)


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    prompt: str
    context: List[Dict[str, Any]]
    history: List[ChatMessage]


class ConfigUpdate(BaseModel):
    pve_host: str | None = None
    pve_port: str | None = None
    pve_user: str | None = None
    pve_token_name: str | None = None
    pve_token_value: str | None = None
    pve_verify_ssl: bool | None = None
    ssh_user: str | None = None
    ssh_password: str | None = None
    ollama_url: str | None = None
    ollama_model: str | None = None


@app.get("/api/v1/meta")
async def meta():
    return {"name": "InfraLens", "version": APP_VERSION}


@app.get("/api/v1/config")
async def get_config():
    return config_store.public_config()


@app.post("/api/v1/config")
def update_config(update: ConfigUpdate):
    incoming = update.model_dump(exclude_none=True)
    for secret in ("pve_token_value", "ssh_password"):
        if secret in incoming and incoming[secret] == "":
            incoming.pop(secret)
    config_store.save_config(incoming)
    manager.reload_from_config()
    return {"saved": True, "config": config_store.public_config()}


class ProxmoxTest(BaseModel):
    pve_host: str | None = None
    pve_port: str | None = None
    pve_user: str | None = None
    pve_token_name: str | None = None
    pve_token_value: str | None = None
    pve_verify_ssl: bool | None = False


class OllamaTest(BaseModel):
    ollama_url: str | None = None
    ollama_model: str | None = None


@app.post("/api/v1/test/proxmox")
def test_proxmox(p: ProxmoxTest):
    return manager.test_proxmox(p.model_dump())


@app.post("/api/v1/test/ollama")
def test_ollama(p: OllamaTest):
    return manager.test_ollama(p.ollama_url, p.ollama_model)

@app.post("/api/v1/config/reset")
def reset_config():
    config_store.reset_config()
    manager.reload_from_config()
    return {"reset": True}

@app.get("/api/v1/health")
def health():
    return {
        "version": APP_VERSION,
        "configured": config_store.is_configured(),
        "proxmox": manager.check_proxmox(),
        "ollama": manager.check_ollama(),
    }


@app.get("/api/v1/infrastructure")
def get_infrastructure():
    if not config_store.is_configured():
        return {"nodes": [], "edges": [],
                "error": "not_configured",
                "message": "Add your Proxmox connection in Settings to begin."}

    engine = manager.get_engine()
    if engine is None:
        status = manager.check_proxmox()
        return {"nodes": [], "edges": [],
                "error": "engine_unavailable", "message": status["detail"]}

    try:
        infra = engine.discover_infrastructure()
        nodes = infra.get("nodes", [])
        probe = manager.get_probe()

        for node in nodes:
            vmid = node.get("id")
            node_type = node.get("data", {}).get("os", "")
            node["data"]["sub_services"] = []

            if probe and "LXC" in str(node_type).upper():
                try:
                    services = probe.get_lxc_services(str(vmid))
                    if services:
                        node["data"]["sub_services"] = services
                        if (any("docker" in str(s).lower() for s in services)
                                and "docker" not in node["data"].get("tags", [])):
                            node["data"]["tags"].append("docker")
                except Exception as probe_error:
                    print(f"[API] probe failed on LXC {vmid} -> {probe_error}")
        return infra
    except Exception as e:
        print(f"[API] error in get_infrastructure: {e}")
        return {"nodes": [], "edges": [],
                "error": "discovery_failed",
                "message": f"Could not read the cluster: {e}"}


@app.post("/api/v1/chat")
def neural_link_chat(request: ChatRequest):
    cfg = config_store.load_config()

    lab_state_text = "<RAW_TELEMETRY>\n"
    for node in request.context:
        d = node.get("data", {})
        if d:
            services = ", ".join(d.get("sub_services", []))
            lab_state_text += (
                f"[{d.get('label')}] IP: {d.get('ip')} | Status: {d.get('status')} "
                f"| CPU: {d.get('cpu', 'N/A')} | RAM: {d.get('ram', 'N/A')} "
                f"| Disk: {d.get('disk', 'N/A')} | Uptime: {d.get('uptime', 'N/A')} "
                f"| Apps: {services}\n"
            )
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
        Use Markdown Headers (###) to separate distinct thoughts or data types.

        {lab_state_text}
        """

    url = cfg.get("ollama_url") or "http://127.0.0.1:11434"
    model = cfg.get("ollama_model") or "llama3"

    try:
        messages = [{"role": "system", "content": system_prompt}]
        for msg in request.history[-5:]:
            messages.append({"role": msg.role, "content": msg.content})
        messages.append({"role": "user", "content": request.prompt})

        response = requests.post(
            f"{url}/api/chat",
            json={"model": model, "messages": messages, "stream": False},
            timeout=60,
        )
        response.raise_for_status()
        reply = response.json().get("message", {}).get("content", "Neural Link timeout.")
        return {"reply": reply}
    except Exception as e:
        return {"reply": f"Neural Link failure: could not reach Ollama at {url} ({e})"}


def _mount_frontend():
    candidates = [
        Path(__file__).resolve().parent / "static",          
        Path(__file__).resolve().parent.parent / "frontend" / "dist", 
    ]
    for dist in candidates:
        if dist.is_dir():
            from fastapi.staticfiles import StaticFiles
            app.mount("/", StaticFiles(directory=str(dist), html=True), name="frontend")
            print(f"[main] serving frontend from {dist}")
            return
    print("[main] no built frontend found; running API-only (desktop mode)")


_mount_frontend()


if __name__ == "__main__":
    import uvicorn
    api_port = int(os.getenv("API_PORT", 8756))
    uvicorn.run(app, host="127.0.0.1", port=api_port)
