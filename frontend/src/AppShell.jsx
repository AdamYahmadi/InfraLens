import React, { useState, useEffect, useCallback, useRef } from "react";
import axios from "axios";
import { api } from "./api";
import Settings from "./Settings";
import Onboarding from "./Onboarding";
import App from "./App.jsx";
import { Loader2, RefreshCw } from "lucide-react";

export default function AppShell() {
  const [phase, setPhase] = useState("loading"); 
  const [showSettings, setShowSettings] = useState(false);
  const [health, setHealth] = useState(null);
  const failures = useRef(0);

  const probe = useCallback(async () => {
    try {
      const { data } = await axios.get(api("/api/v1/health"), { timeout: 12000 });
      console.log("PROBE OK", data.configured, data);
      failures.current = 0;
      setHealth(data);
      setPhase(data.configured ? "ready" : "setup");
      return true;
    } catch (e) {
      console.log("PROBE FAIL", e.message, e);
      failures.current += 1;
      setPhase((prev) => (prev === "ready" ? "ready" : "offline"));
      return false;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer = null;

    const tick = async () => {
      if (cancelled) return;
      const ok = await probe();
      if (cancelled || ok) return;        
      timer = setTimeout(tick, 2000);     
    };

    tick();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [probe]);

  useEffect(() => {
    if (phase !== "ready") return;
    const id = setInterval(probe, 20000);
    return () => clearInterval(id);
  }, [phase, probe]);

  const retry = useCallback(() => {
    failures.current = 0;
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
        <div className="text-center max-w-sm text-zinc-900 dark:text-zinc-100">
          <Loader2 className="mx-auto text-zinc-400 mb-3 animate-spin" size={28} />
          <h2 className="text-base font-semibold mb-1">Starting the engine…</h2>
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mb-5">
            InfraLens is warming up. This can take a few seconds on first launch.
          </p>
          <button onClick={retry}
            className="inline-flex items-center gap-2 text-[13px] text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors">
            <RefreshCw size={15} /> Retry now
          </button>
        </div>
      </Centered>
    );
  }

  if (phase === "setup") {
    return <Onboarding onDone={probe} />;
  }

  // ready
  return (
    <div className="relative">
      <StatusBanner health={health} onFix={() => setShowSettings(true)} />
      <App onOpenSettings={() => setShowSettings(true)} />

      {showSettings && (
        <Settings
          onClose={() => setShowSettings(false)}
          onSaved={() => probe()}
          onReset={() => { setShowSettings(false); setPhase("setup"); }}
        />
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
    <div className="sticky top-0 z-40 bg-white dark:bg-zinc-950 border-b border-zinc-200 dark:border-white/5 text-zinc-600 dark:text-zinc-300 text-[13px] px-4 py-2 flex items-center gap-3">
      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0 animate-pulse" />
      <span className="truncate">{problems.join("  •  ")}</span>
      <button onClick={onFix}
        className="ml-auto shrink-0 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 underline-offset-2 hover:underline">Settings</button>
    </div>
  );
}

function Centered({ children }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-[#09090b] text-zinc-500 dark:text-zinc-400">
      {children}
    </div>
  );
}