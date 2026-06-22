<div align="center">

# InfraLens

Real-time topology visualization, monitoring, and LLM-assisted diagnostics for Proxmox homelabs.

<p>
  <img src="https://img.shields.io/badge/Python-3.10+-blue.svg" alt="Python" />
  <img src="https://img.shields.io/badge/Node.js-18.x-green.svg" alt="Node.js" />
  <img src="https://img.shields.io/badge/Proxmox-VE_8.x-E57000.svg" alt="Proxmox" />
  <img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License" />
</p>

<a href="#overview">Overview</a> •
<a href="#features">Features</a> •
<a href="#screenshots">Screenshots</a> •
<a href="#installation">Installation</a> •
<a href="#license">License</a>

</div>

![InfraLens dashboard](./docs/hero-banner.png)

## Overview

InfraLens connects to the Proxmox API, discovers the nodes, VMs, and LXC containers in your cluster, and renders them as a live topology graph with streaming resource telemetry. A local LLM (through Ollama) is given structured, real-time context from the cluster, so you can ask about the state of your infrastructure in plain language instead of digging through logs and separate dashboards.

It's built for self-hosted setups. Everything runs on your own hardware, and no cluster data leaves your network.

## Features

- **Automatic discovery** — enumerates Proxmox hosts, VMs, and LXC containers through the API and lays them out as a connected graph.
- **Live telemetry** — per-node CPU, RAM, disk, and network RX/TX, updated in real time.
- **Service detection** — probes containers over SSH to identify running services such as Docker, databases, and web servers.
- **LLM diagnostics** — streams live cluster state into a local Ollama model, so infrastructure questions can be answered conversationally.
- **Local only** — telemetry and chat both stay on your network; nothing is sent to a third party.

## Screenshots

**LLM diagnostics**

![Chat interface](./docs/chat-interface.png)

Query service status and trace bottlenecks in natural language.

**Node telemetry**

<img src="./docs/node-details.png" alt="Node details" width="400" />

Live resource usage and active services for an individual VM or container.

## Installation

### Prerequisites

- Node.js 18 or newer
- Python 3.10 or newer
- A Proxmox VE server with an API token
- [Ollama](https://ollama.com/) installed and running locally

### 1. Clone the repository

```bash
git clone https://github.com/AdamYahmadi/InfraLens.git
cd InfraLens
```

### 2. Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

Copy `.env.example` to `.env` and fill in your Proxmox API and SSH credentials, then start the API:

```bash
python main.py
```

### 3. Frontend

```bash
cd frontend
npm install
```

Create a `.env` file pointing to the backend:

```ini
VITE_API_URL="http://127.0.0.1:8000"
```

Then start the dev server:

```bash
npm run dev
```

## License

Released under the MIT License.
