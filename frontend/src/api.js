// Single source of truth for where the backend lives.
//
// - Desktop build: the Tauri shell launches the Python backend as a sidecar on
//   a fixed localhost port, so we default to that.
// - Dev / server mode: set VITE_API_URL in a .env file to override.
export const API_BASE =
  import.meta.env.VITE_API_URL?.replace(/\/$/, "") || "http://127.0.0.1:8756";

export const api = (path) => `${API_BASE}${path}`;
