# Building InfraLens as a desktop app (macOS & Linux)

This turns InfraLens into installable desktop software:

- A **first-run settings screen** to enter your Proxmox token and Ollama URL (no editing `.env`).
- **Graceful status handling** — a banner tells you when Proxmox or Ollama can't be reached instead of crashing.
- **Auto-updates** — installed apps check a GitHub release and update themselves.
- **Version numbering** — one number drives everything.

The stack: a **Tauri 2** shell wraps the existing React UI and launches the Python backend as a bundled **sidecar** (frozen with **PyInstaller**, so users don't need Python). **GitHub Actions** builds the macOS `.dmg` and Linux `.AppImage` / `.deb` for free.

```
InfraLens/
├─ backend/                 FastAPI API + config_store.py, manager.py, infralens-backend.spec
├─ frontend/                React UI + Settings.jsx, AppShell.jsx, api.js
├─ src-tauri/               Tauri shell (Rust), config, capabilities
├─ .github/workflows/       build-release.yml  (CI that produces installers)
├─ appicon.png              source icon (replace with your 1024×1024 logo)
└─ package.json             Tauri CLI scripts
```

---

## What you need installed (for local builds)

| Tool | Why | Notes |
|---|---|---|
| Node.js 20+ | frontend + Tauri CLI | |
| Rust (stable) | Tauri shell | https://rustup.rs |
| Python 3.10+ | freeze the backend | |
| System libs (Linux only) | Tauri webview | `libwebkit2gtk-4.1-dev libgtk-3-dev librsvg2-dev libayatana-appindicator3-dev patchelf libxdo-dev` |

> You can skip all of this and let **GitHub Actions** build everything — see "Releasing" below. The local steps are only for testing on your own machine.

---

## One-time setup

**1. Generate the updater signing key** (enables auto-updates). From the repo root:

```bash
npm install
npx tauri signer generate -w ~/.infralens-updater.key
```

This prints a **public key**. Put it in `src-tauri/tauri.conf.json` under `plugins.updater.pubkey`, and set the updater `endpoints` URL to your repo:

```json
"endpoints": ["https://github.com/<YOUR_USER>/<YOUR_REPO>/releases/latest/download/latest.json"]
```

Keep the **private key file** and its password secret — they go into GitHub later.

**2. Generate the app icons** from your logo:

```bash
npx tauri icon ./appicon.png
```

(Replace `appicon.png` with a real 1024×1024 PNG first. A placeholder is included so builds don't fail.)

---

## Run it locally (dev)

Two terminals:

```bash
# terminal 1 — backend
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
python main.py                 # serves on http://127.0.0.1:8756

# terminal 2 — desktop shell with hot reload
npm run dev
```

The app opens, shows the settings screen on first launch, and you fill in your Proxmox + Ollama details.

> In `dev`, the shell expects the backend on port **8756**. In a packaged build the shell starts the backend itself.

---

## Build installers locally

```bash
# 1. Freeze the backend
cd backend
pip install -r requirements.txt pyinstaller
pyinstaller --clean --noconfirm infralens-backend.spec

# 2. Place it where Tauri expects the sidecar (append your platform's target triple)
#    Find your triple with: rustc -vV | grep host
mkdir -p ../src-tauri/binaries
cp dist/infralens-backend "../src-tauri/binaries/infralens-backend-$(rustc -vV | sed -n 's/host: //p')"
cd ..

# 3. Build the app
npm run build
```

Output lands in `src-tauri/target/release/bundle/` — `.dmg` on macOS, `.AppImage` and `.deb` on Linux.

---

## Releasing (recommended: free CI for both OSes)

You can't build a macOS app on Linux, so CI does it. The workflow `.github/workflows/build-release.yml` builds on macOS **and** Linux runners, signs the artifacts, publishes a GitHub Release, and generates the `latest.json` the auto-updater reads.

**Add two repository secrets** (Settings → Secrets and variables → Actions):

| Secret | Value |
|---|---|
| `TAURI_SIGNING_PRIVATE_KEY` | contents of the private key file from setup step 1 |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | the password you set for it |

Then cut a release:

```bash
# bump the version in src-tauri/tauri.conf.json and src-tauri/Cargo.toml first
git tag v0.1.0
git push origin v0.1.0
```

The Actions run produces the `.dmg`, `.AppImage`, and `.deb` and attaches them to the release. Installed apps will detect the next tagged release and update themselves.

---

## How versioning works

The version lives in **`src-tauri/tauri.conf.json`** (`"version"`) and **`src-tauri/Cargo.toml`**. Keep them in sync, tag the repo `vX.Y.Z`, and the updater compares the installed version against the release.

---

## Notes & limits worth knowing

- **Ollama isn't bundled** (it's a multi-GB separate service). The app still expects Ollama installed and running; the settings screen points to it.
- **Network reach:** the machine running the app must be able to reach your Proxmox cluster (same LAN, or via Tailscale). Packaging changes how it launches, not where it needs to sit.
- **macOS Gatekeeper:** unsigned apps show a warning on first open (right-click → Open to bypass). Removing the warning entirely needs an Apple Developer account ($99/yr) for notarization — optional, and only for macOS.
- **Auto-update on Linux** works for the **AppImage** build, not `.deb` (deb users update via their package manager / by reinstalling).
- **Secrets storage:** settings (including the Proxmox token) are saved to a `config.json` in your user config dir with `600` permissions. For stronger protection you could later move secrets into the OS keychain.
- **Port:** the backend listens on `127.0.0.1:8756`. If that clashes with something, change it in `backend/main.py` and `frontend/src/api.js` together.
