<div align="center">

# InfraLens

Real-time topology, monitoring, and LLM-assisted diagnostics for Proxmox homelabs.

<p>
  <img src="https://img.shields.io/badge/Python-3.10+-blue.svg" alt="Python" />
  <img src="https://img.shields.io/badge/Node.js-18.x-green.svg" alt="Node.js" />
  <img src="https://img.shields.io/badge/Rust-1.70+-orange.svg" alt="Rust" />
  <img src="https://img.shields.io/badge/Proxmox-VE_8.x-E57000.svg" alt="Proxmox" />
  <img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License" />
</p>

<a href="#overview">Overview</a> •
<a href="#features">Features</a> •
<a href="#desktop-app">Desktop App</a> •
<a href="#screenshots">Screenshots</a> •
<a href="#installation">Installation</a> •
<a href="#license">License</a>

</div>

---

## Overview

InfraLens connects to the Proxmox API, discovers every node, VM, and LXC container in your cluster, and renders them as a live topology graph with streaming resource telemetry. A local LLM (via Ollama) is given structured, real-time context from the cluster so you can ask about the state of your infrastructure in plain language — no digging through logs or separate dashboards.

Everything runs on your own hardware. No cluster data leaves your network.

---

## Features

- **Automatic discovery** — enumerates Proxmox hosts, VMs, and LXC containers through the API and lays them out as an interactive topology graph.
- **Live telemetry** — per-node CPU, RAM, disk, and uptime, updated in real time.
- **Service detection** — probes containers over SSH to identify running services such as Docker, databases, and web servers.
- **LLM diagnostics** — streams live cluster state into a local Ollama model so you can query your infrastructure conversationally.
- **Local only** — telemetry and chat both stay on your network; nothing is sent to a third party.

---

## Desktop App

InfraLens ships as a native desktop app for **macOS** and **Linux**, built with [Tauri 2](https://tauri.app).

### Download

Grab the latest release from the [Releases](https://github.com/AdamYahmadi/InfraLens/releases) page:

| Platform | File |
|---|---|
| macOS (Apple Silicon / Intel) | `InfraLens_x.x.x_aarch64.dmg` / `InfraLens_x.x.x_x64.dmg` |
| Linux (AppImage) | `InfraLens_x.x.x_amd64.AppImage` |
| Linux (Debian/Ubuntu) | `InfraLens_x.x.x_amd64.deb` |

### macOS — first launch

The app is ad-hoc signed (no Apple notarization yet). After installing, run this once in Terminal:

```bash
sudo codesign --force --deep --sign - /Applications/InfraLens.app
```

Then open the app, go to **System Settings → Privacy & Security → Local Network** and enable InfraLens. This grants it access to your Proxmox host on the local network.

You only need to do this once per install. On subsequent launches InfraLens opens directly to your topology.

### First-run setup

On first launch a setup wizard walks you through:

1. **Proxmox** — host/IP, API token user, token name and value
2. **SSH probe** (optional) — SSH credentials to detect services inside LXC containers
3. **Ollama** — local model URL and model name for AI diagnostics

Your credentials are saved to `~/Library/Application Support/InfraLens/config.json` (macOS) or `~/.config/InfraLens/config.json` (Linux) and never leave your machine.

To fully uninstall and wipe all saved data:

```bash
sudo rm -rf /Applications/InfraLens.app
rm -rf ~/Library/Application\ Support/InfraLens
tccutil reset LocalNetwork
```

---

## Screenshots

**Topology view**

Live graph of your Proxmox cluster — nodes, VMs, and containers with real-time telemetry in the sidebar.

![InfraLens dashboard](./docs/hero-banner.png)

**LLM diagnostics**

![Chat interface](./docs/chat-interface.png)

Query service status and trace bottlenecks in plain language using a local Ollama model.

**Node telemetry**

<img src="./docs/node-details.png" alt="Node details" width="400" />

Live resource usage and active services for an individual VM or container.

---

## Installation (development)

If you want to run from source or contribute:

### Prerequisites

- Node.js 18+
- Python 3.10+
- Rust (for Tauri — install via [rustup](https://rustup.rs))
- A Proxmox VE server with an API token
- [Ollama](https://ollama.com/) installed and running locally

### 1. Clone

```bash
git clone https://github.com/AdamYahmadi/InfraLens.git
cd InfraLens
```

### 2. Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate       # Windows: venv\Scripts\activate
pip install -r requirements.txt
python main.py
```

The API starts on `http://127.0.0.1:8756`.

### 3. Frontend (dev server)

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`. The dev server proxies `/api` requests to the backend automatically — no `.env` file needed.

### 4. Desktop app (full build)

```bash
npm install
npm run tauri build
```

The installer is written to `src-tauri/target/release/bundle/`.

---

## Architecture

```
InfraLens/
├── backend/          # FastAPI — Proxmox discovery, SSH probe, Ollama chat
├── frontend/         # React + Vite — topology UI, telemetry panels, chat
└── src-tauri/        # Tauri 2 shell — bundles backend, manages window
```

---

## License

Released under the MIT License.