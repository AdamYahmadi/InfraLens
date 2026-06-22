import React, { useState, useEffect, useCallback, useRef } from "react";
import axios from "axios";
import { api } from "./api";
import Settings from "./Settings";
import Onboarding from "./Onboarding";
import App from "./App.jsx";
import { Loader2, Settings as SettingsIcon, AlertTriangle, RefreshCw } from "lucide-react";

export default function AppShell() {
  const [phase, setPhase] = useState("loading"); // loading | offline | setup | ready
  const [showSettings, setShowSettings] = useState(false);
  const [health, setHealth] = useState(null);
  const failures = useRef(0);
  const startupTries = useRef(0);

  const probe = useCallback(async () => {
    try {
      const { data } = await axios.get(api("/api/v1/health"), { timeout: 12000 });
      failures.current = 0;
      setHealth(data);
      setPhase(data.configured ? "ready" : "setup");
    } catch {
      failures.current += 1;
      setPhase((prev) => {
        if (prev === "ready" && failures.current < 4) return "ready";
        return "offline";
      });
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const tryStart = async () => {
      await probe();
      if (cancelled) return;
      startupTries.current += 1;
    };
    tryStart();
    const id = setInterval(() => {
      if (failures.current > 0 && startupTries.current < 8) tryStart();
      else clearInterval(id);
    }, 2000);
    return () => { cancelled = true; clearInterval(id); };
  }, [probe]);

  useEffect(() => {
    if (phase !== "ready") return;
    const id = setInterval(probe, 20000);
    return () => clearInterval(id);
  }, [phase, probe]);

  const retry = useCallback(() => {
    failures.current = 0;
    startupTries.current = 0;
    setPhase("loading");
    probe();
  }, [probe]);

  if (phase === "loading") {
    return (
      <Centered>
        <Loader2 className="animate-spin mr-2" /> Starting InfraLens…
      </Centered>
    );
  }

  if (phase === "offline") {
    return (
      <Centered>
        <div className="text-center max-w-sm">
          <AlertTriangle className="mx-auto text-amber-400 mb-3" size={32} />
          <h2 className="text-lg font-semibold mb-1">Backend not responding</h2>
          <p className="text-sm text-slate-400 mb-4">
            The InfraLens engine isn’t answering yet. It may still be starting up.
          </p>
          <button onClick={retry}
            className="inline-flex items-center gap-2 bg-slate-800 hover:bg-slate-700 px-4 py-2 rounded-lg text-sm">
            <RefreshCw size={16} /> Retry
          </button>
        </div>
      </Centered>
    );
  }

  if (phase === "setup") {
    return <Onboarding onDone={probe} />;
  }

  return (
    <div className="relative">
      <StatusBanner health={health} onFix={() => setShowSettings(true)} />
      <App />
      <button
        title="Settings"
        onClick={() => setShowSettings(true)}
        className="fixed bottom-5 right-5 z-40 bg-slate-800/90 hover:bg-slate-700 text-slate-200 p-3 rounded-full shadow-lg border border-slate-700">
        <SettingsIcon size={18} />
      </button>

      {showSettings && (
        <div className="fixed inset-0 z-50 bg-black/60 overflow-auto">
          <Settings
            onClose={() => setShowSettings(false)}
            onSaved={() => { setShowSettings(false); probe(); }}
          />
        </div>
      )}
    </div>
  );
}

function StatusBanner({ health, onFix }) {
  if (!health) return null;
  const problems = [];
  if (!health.proxmox?.ok) problems.push(health.proxmox?.detail || "Proxmox unreachable");
  if (!health.ollama?.ok) problems.push(health.ollama?.detail || "Ollama unreachable");
  if (problems.length === 0) return null;

  return (
    <div className="sticky top-0 z-40 bg-amber-500/15 border-b border-amber-500/30 text-amber-200 text-sm px-4 py-2 flex items-center gap-3">
      <AlertTriangle size={16} className="shrink-0" />
      <span className="truncate">{problems.join("  •  ")}</span>
      <button onClick={onFix} className="ml-auto shrink-0 underline hover:no-underline">Fix in settings</button>
    </div>
  );
}

function Centered({ children }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-300">
      {children}
    </div>
  );
}