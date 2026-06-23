export const API_BASE = import.meta.env.DEV
  ? ""
  : (import.meta.env.VITE_API_URL?.replace(/\/$/, "") || "http://127.0.0.1:8756");

export const api = (path) => `${API_BASE}${path}`;