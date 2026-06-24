"""
Runtime manager for the Proxmox engine, SSH probe and Ollama link.

Everything here is lazy and fault-tolerant: the heavy modules
(proxmoxer / paramiko) are imported only when the user has actually
configured credentials, so the app boots cleanly on a fresh machine
with no settings and nothing crashes. Health checks let the UI show a
clear "can't reach X" message instead of a stack trace.
"""

import os
import requests

import config_store

# Module-level singletons, rebuilt whenever settings change.
_engine = None
_probe = None
_engine_error = None


def reload_from_config() -> None:
    """(Re)build the engine and probe from the saved config."""
    global _engine, _probe, _engine_error
    cfg = config_store.load_config()
    config_store.apply_to_env(cfg)
    _engine = None
    _probe = None
    _engine_error = None

    if not config_store.is_configured(cfg):
        return  # stay un-configured; UI will show the settings screen

    # Imported lazily so a fresh install without these wheels still boots.
    try:
        from proxmox_engine import ProxmoxEngine
        _engine = ProxmoxEngine(
            host=cfg["pve_host"],
            user=cfg["pve_user"],
            token_name=cfg["pve_token_name"],
            token_value=cfg["pve_token_value"],
            verify_ssl=bool(cfg.get("pve_verify_ssl")),
        )
    except Exception as e:
        _engine = None
        _engine_error = str(e)
        print(f"[manager] engine init failed: {e}")

    try:
        from service_probe import ServiceProbe
        _probe = ServiceProbe()  # reads creds from env we just applied
    except Exception as e:
        _probe = None
        print(f"[manager] probe init failed: {e}")


def get_engine():
    return _engine


def get_probe():
    return _probe


def check_proxmox() -> dict:
    """Lightweight reachability check for the Proxmox API."""
    cfg = config_store.load_config()
    if not config_store.is_configured(cfg):
        return {"ok": False, "configured": False,
                "detail": "Proxmox connection not configured yet."}
    if _engine is None:
        return {"ok": False, "configured": True,
                "detail": _engine_error or "Engine not initialised."}
    try:
        # A cheap call that exercises auth without pulling the whole cluster.
        _engine.pve.version.get()
        return {"ok": True, "configured": True, "detail": "Connected."}
    except Exception as e:
        return {"ok": False, "configured": True,
                "detail": f"Could not reach Proxmox: {e}"}


def check_ollama() -> dict:
    """Reachability check for the local Ollama server."""
    cfg = config_store.load_config()
    url = cfg.get("ollama_url") or "http://127.0.0.1:11434"
    model = cfg.get("ollama_model") or "llama3"
    try:
        r = requests.get(f"{url}/api/tags", timeout=4)
        r.raise_for_status()
        tags = [m.get("name", "") for m in r.json().get("models", [])]
        present = any(model in t for t in tags)
        return {
            "ok": True,
            "detail": "Connected." if present
                      else f"Reachable, but model '{model}' is not pulled.",
            "model_ready": present,
            "url": url,
        }
    except Exception as e:
        return {"ok": False,
                "detail": f"Could not reach Ollama at {url}: {e}",
                "model_ready": False, "url": url}


def test_proxmox(params: dict) -> dict:
    """Try a candidate Proxmox connection WITHOUT saving it (used by setup)."""
    required = ("pve_host", "pve_user", "pve_token_name", "pve_token_value")
    if not all(params.get(k) for k in required):
        return {"ok": False, "detail": "Fill in host, user, token name and token value first."}
    old_port = os.environ.get("PVE_PORT")
    if params.get("pve_port"):
        os.environ["PVE_PORT"] = str(params["pve_port"])
    try:
        from proxmox_engine import ProxmoxEngine
        eng = ProxmoxEngine(
            host=params["pve_host"],
            user=params["pve_user"],
            token_name=params["pve_token_name"],
            token_value=params["pve_token_value"],
            verify_ssl=bool(params.get("pve_verify_ssl")),
        )
        if not getattr(eng, "pve", None):
            return {"ok": False, "detail": "Couldn't reach that host. Check the IP/port and SSL setting."}
        version = eng.pve.version.get()
        ver = version.get("version", "") if isinstance(version, dict) else ""
        return {"ok": True, "detail": f"Connected to Proxmox VE {ver}".strip() + "."}
    except Exception as e:
        msg = str(e)
        if "CERTIFICATE_VERIFY_FAILED" in msg or "SSLError" in msg or "SSL" in msg:
            detail = (
                "SSL certificate verification failed. "
                "Your Proxmox host uses a self-signed certificate — "
                "uncheck 'Verify SSL certificate' to connect."
            )
        elif "Connection refused" in msg or "No route to host" in msg or "timed out" in msg.lower():
            detail = "Couldn't reach that host. Check the IP address, port, and that Proxmox is running."
        elif "401" in msg or "403" in msg or "Unauthorized" in msg:
            detail = "Authentication failed. Check your API user, token name, and token value."
        else:
            detail = f"Connection failed: {e}"
        return {"ok": False, "detail": detail}
    finally:
        if old_port is None:
            os.environ.pop("PVE_PORT", None)
        else:
            os.environ["PVE_PORT"] = old_port


def test_ollama(url: str | None, model: str | None) -> dict:
    """Check a candidate Ollama endpoint and whether the model is present."""
    url = (url or "http://127.0.0.1:11434").rstrip("/")
    try:
        r = requests.get(f"{url}/api/tags", timeout=5)
        r.raise_for_status()
        models = [m.get("name", "") for m in r.json().get("models", [])]
        ready = any((model or "") in m for m in models)
        detail = "Connected." if ready else f"Reachable, but '{model}' isn't pulled yet. Run: ollama pull {model}"
        return {"ok": True, "detail": detail, "models": models, "model_ready": ready}
    except Exception as e:
        return {"ok": False, "detail": f"Couldn't reach Ollama at {url}: {e}",
                "models": [], "model_ready": False}


# Build once at import so the first request has state ready.
reload_from_config()
