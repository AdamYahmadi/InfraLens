import os

import requests

import config_store

_engine = None
_probe = None
_engine_error = None


def _host_label(source: dict | None) -> str | None:
    host = ((source or {}).get("pve_host") or "").strip()
    if not host:
        return None
    port = str((source or {}).get("pve_port") or "").strip()
    return f"{host}:{port}" if port else host


def _friendly_error(e: Exception, host: str | None = None) -> str:
    msg = str(e)
    low = msg.lower()
    print(f"[manager] proxmox error: {msg}")

    where = f" at {host}" if host else ""

    if "certificate_verify_failed" in low or "sslerror" in low or "ssl" in low:
        return (
            "SSL certificate verification failed. "
            "Your Proxmox host uses a self-signed certificate — "
            "disable 'Verify SSL certificate' in Settings."
        )
    if "401" in msg or "403" in msg or "unauthorized" in low:
        return (
            "Authentication failed. Check your API user, token name, and token value."
        )
    if (
        "name or service not known" in low
        or "nodename nor servname" in low
        or "getaddrinfo" in low
        or "failed to resolve" in low
    ):
        return f"Couldn't find the host{where}. Check the address in Settings."
    if "network is unreachable" in low or "errno 51" in low:
        return (
            f"No network route to Proxmox{where}. Check that this machine is on "
            "the same network and that InfraLens has Local Network permission."
        )
    if (
        "no route to host" in low
        or "host is down" in low
        or "errno 65" in low
        or "errno 64" in low
    ):
        return (
            f"Proxmox{where} didn't answer. Check that the host is powered on "
            "and reachable from this machine."
        )
    if "connection refused" in low or "errno 61" in low:
        return (
            f"Connection refused by Proxmox{where}. Check the port and that the "
            "Proxmox web interface is running."
        )
    if "timed out" in low or "timeout" in low:
        return (
            f"Proxmox{where} didn't respond in time. Check the IP address, port, "
            "and Local Network permission."
        )
    return (
        f"Couldn't reach Proxmox{where}. Check the IP address, port, and Local "
        "Network permission."
    )


def _friendly_ollama_error(e: Exception, url: str) -> str:
    msg = str(e)
    if (
        "Connection refused" in msg
        or "Failed to establish a new connection" in msg
        or "Max retries" in msg
    ):
        return f"Ollama isn't running or isn't reachable at {url}. Start Ollama and try again."
    if "timed out" in msg.lower() or "timeout" in msg.lower():
        return f"Ollama didn't respond at {url}. Check that it's running and reachable."
    if (
        "Name or service not known" in msg
        or "nodename nor servname" in msg
        or "getaddrinfo" in msg
    ):
        return f"Couldn't find the Ollama host at {url}. Check the URL."
    return f"Couldn't reach Ollama at {url}. Make sure it's running."


def reload_from_config() -> None:
    global _engine, _probe, _engine_error
    cfg = config_store.load_config()
    config_store.apply_to_env(cfg)
    _engine = None
    _probe = None
    _engine_error = None

    if not config_store.is_configured(cfg):
        os.environ.pop("PVE_VERIFY_SSL", None)
        return

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
        _engine_error = _friendly_error(e, _host_label(cfg))
        print(f"[manager] engine init failed: {e}")

    try:
        from service_probe import ServiceProbe

        _probe = ServiceProbe()
    except Exception as e:
        _probe = None
        print(f"[manager] probe init failed: {e}")


def get_engine():
    return _engine


def get_probe():
    return _probe


def check_proxmox() -> dict:
    cfg = config_store.load_config()
    if not config_store.is_configured(cfg):
        return {
            "ok": False,
            "configured": False,
            "detail": "Proxmox connection not configured yet.",
        }
    if _engine is None:
        return {
            "ok": False,
            "configured": True,
            "detail": _engine_error or "Engine not initialised.",
        }
    try:
        _engine.pve.version.get()
        return {"ok": True, "configured": True, "detail": "Connected."}
    except Exception as e:
        return {
            "ok": False,
            "configured": True,
            "detail": _friendly_error(e, _host_label(cfg)),
        }


def check_ollama() -> dict:
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
            "detail": (
                "Connected."
                if present
                else f"Reachable, but model '{model}' is not pulled."
            ),
            "model_ready": present,
            "url": url,
        }
    except Exception as e:
        return {
            "ok": False,
            "detail": _friendly_ollama_error(e, url),
            "model_ready": False,
            "url": url,
        }


def test_proxmox(params: dict) -> dict:
    required = ("pve_host", "pve_user", "pve_token_name", "pve_token_value")
    if not all(params.get(k) for k in required):
        return {
            "ok": False,
            "detail": "Fill in host, user, token name and token value first.",
        }
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
            return {
                "ok": False,
                "detail": "Couldn't reach that host. Check the IP/port and SSL setting.",
            }
        version = eng.pve.version.get()
        ver = version.get("version", "") if isinstance(version, dict) else ""
        return {"ok": True, "detail": f"Connected to Proxmox VE {ver}".strip() + "."}
    except Exception as e:
        return {"ok": False, "detail": _friendly_error(e, _host_label(params))}
    finally:
        if old_port is None:
            os.environ.pop("PVE_PORT", None)
        else:
            os.environ["PVE_PORT"] = old_port


def test_ollama(url: str | None, model: str | None) -> dict:
    url = (url or "http://127.0.0.1:11434").rstrip("/")
    try:
        r = requests.get(f"{url}/api/tags", timeout=5)
        r.raise_for_status()
        models = [m.get("name", "") for m in r.json().get("models", [])]
        ready = any((model or "") in m for m in models)
        detail = (
            "Connected."
            if ready
            else f"Reachable, but '{model}' isn't pulled yet. Run: ollama pull {model}"
        )
        return {"ok": True, "detail": detail, "models": models, "model_ready": ready}
    except Exception as e:
        return {
            "ok": False,
            "detail": _friendly_ollama_error(e, url),
            "models": [],
            "model_ready": False,
        }


reload_from_config()
