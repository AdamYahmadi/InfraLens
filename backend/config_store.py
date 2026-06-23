import os
import sys
import json
from pathlib import Path

APP_NAME = "InfraLens"
SECRET_KEYS = {"pve_token_value", "ssh_password"}

DEFAULTS = {
    "pve_host": "",
    "pve_port": "8006",
    "pve_user": "",
    "pve_token_name": "",
    "pve_token_value": "",
    "pve_verify_ssl": False,
    "ssh_user": "root",
    "ssh_password": "",
    "ollama_url": "http://127.0.0.1:11434",
    "ollama_model": "llama3",
}

ENV_MAP = {
    "pve_host": "PVE_HOST",
    "pve_port": "PVE_PORT",
    "pve_user": "PVE_USER",
    "pve_token_name": "PVE_TOKEN_NAME",
    "pve_token_value": "PVE_TOKEN_VALUE",
    "ssh_user": "PVE_SSH_USER",
    "ssh_password": "PVE_SSH_PASSWORD",
    "ollama_url": "OLLAMA_URL",
}


def config_dir() -> Path:
    """Return (and create) the per-user config directory."""
    if sys.platform == "darwin":
        base = Path.home() / "Library" / "Application Support"
    else:  # linux / other unix
        base = Path(os.getenv("XDG_CONFIG_HOME", str(Path.home() / ".config")))
    d = base / APP_NAME
    d.mkdir(parents=True, exist_ok=True)
    return d


def config_path() -> Path:
    return config_dir() / "config.json"


def load_config() -> dict:
    """Load saved settings, layered over defaults. Never raises."""
    cfg = dict(DEFAULTS)
    path = config_path()
    if path.exists():
        try:
            with open(path, "r", encoding="utf-8") as f:
                saved = json.load(f)
            if isinstance(saved, dict):
                cfg.update({k: saved.get(k, cfg[k]) for k in DEFAULTS})
        except Exception as e:  
            print(f"[config] could not read config.json: {e}")

    for key, env_name in ENV_MAP.items():
        env_val = os.getenv(env_name)
        if env_val and not cfg.get(key):
            cfg[key] = env_val
    if os.getenv("PVE_VERIFY_SSL") and not cfg.get("pve_verify_ssl"):
        cfg["pve_verify_ssl"] = os.getenv("PVE_VERIFY_SSL", "").lower() == "true"

    return cfg


def save_config(new_values: dict) -> dict:
    """Merge new_values into the stored config and persist it."""
    cfg = load_config()
    for key in DEFAULTS:
        if key in new_values and new_values[key] is not None:
            cfg[key] = new_values[key]
    path = config_path()
    tmp = path.with_suffix(".json.tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(cfg, f, indent=2)
    os.replace(tmp, path)  
    try:
        os.chmod(path, 0o600) 
    except Exception:
        pass
    return cfg

def reset_config() -> None:
    """Delete all saved settings (hard disconnect / start over)."""
    path = config_path()
    try:
        if path.exists():
            os.remove(path)
    except Exception as e:
        print(f"[config] could not delete config.json: {e}")
    for env_name in list(ENV_MAP.values()) + ["PVE_VERIFY_SSL"]:
        os.environ.pop(env_name, None)


def is_configured(cfg: dict | None = None) -> bool:
    """True once the minimum Proxmox connection fields are present."""
    cfg = cfg or load_config()
    return bool(cfg.get("pve_host") and cfg.get("pve_user")
                and cfg.get("pve_token_name") and cfg.get("pve_token_value"))


def public_config(cfg: dict | None = None) -> dict:
    """Config for the UI: secrets replaced by a boolean 'is set' flag."""
    cfg = cfg or load_config()
    out = {}
    for key, val in cfg.items():
        if key in SECRET_KEYS:
            out[key + "_set"] = bool(val)
        else:
            out[key] = val
    out["configured"] = is_configured(cfg)
    return out


def apply_to_env(cfg: dict | None = None) -> None:
    """Push config into os.environ so the legacy engine/probe modules see it."""
    cfg = cfg or load_config()
    for key, env_name in ENV_MAP.items():
        if cfg.get(key) not in (None, ""):
            os.environ[env_name] = str(cfg[key])
    os.environ["PVE_VERIFY_SSL"] = "true" if cfg.get("pve_verify_ssl") else "false"
