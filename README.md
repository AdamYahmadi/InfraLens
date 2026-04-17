# 🛡️ InfraLens: AI-Powered Homelab Assistant

InfraLens is a visualizer and AI-driven management layer for Proxmox homelabs. It turns complex infrastructure into an interactive graph that you can "chat" with.

## 🚀 Features
- **Live Infrastructure Graph:** Visualizes Proxmox hosts and LXC/VM containers using React Flow.
- **AI Assistant:** Chat with your lab to query status, connections, and health.
- **Real-time Integration:** (In Progress) Connects directly to the Proxmox API.

## 🛠️ Tech Stack
- **Frontend:** React, Vite, React Flow, TailwindCSS
- **Backend:** Python (FastAPI), Proxmoxer
- **AI:** OpenAI API / Ollama

## 📦 Project Structure
- `/frontend`: React application for the visualizer and chat UI.
- `/backend`: Python API to bridge Proxmox data and the LLM.
- `/data`: Schema definitions and mock data for development.

## 🚦 Getting Started

### Frontend
1. `cd frontend`
2. `npm install`
3. `npm run dev`

### Backend
1. `cd backend`
2. `python -m venv venv`
3. `source venv/bin/activate`
4. `pip install -r requirements.txt` (Once created)
