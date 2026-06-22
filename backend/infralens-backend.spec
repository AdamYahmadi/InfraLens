# PyInstaller spec: freezes the InfraLens FastAPI backend into one standalone
# executable so end users don't need Python installed. The output is named
# `infralens-backend` and gets picked up by the Tauri sidecar wiring.
#
# Build with:  pyinstaller infralens-backend.spec
from PyInstaller.utils.hooks import collect_submodules

# Lazy imports in manager.py (proxmox_engine / service_probe) and uvicorn's
# dynamically-loaded workers must be declared so PyInstaller bundles them.
hiddenimports = (
    collect_submodules("uvicorn")
    + collect_submodules("proxmoxer")
    + [
        "proxmox_engine",
        "service_probe",
        "security_check",
        "config_store",
        "manager",
        "paramiko",
        "requests",
        "dotenv",
        "anyio",
        "h11",
    ]
)

datas = [("probe_config.json", ".")]

a = Analysis(
    ["main.py"],
    pathex=["."],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name="infralens-backend",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
