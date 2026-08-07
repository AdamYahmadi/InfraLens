import React, { useState, useEffect, useCallback, useRef } from "react";
import axios from "axios";
import { api } from "./api";
import Settings from "./Settings";
import Onboarding from "./Onboarding";
import App from "./App.jsx";
import { Loader2, RefreshCw } from "lucide-react";
import Logo from "./components/Logo";

export default function AppShell() {
  const [phase, setPhase] = useState("loading");
  const [showSettings, setShowSettings] = useState(false);
  const [health, setHealth] = useState(null);
  const failures = useRef(0);

  const probe = useCallback(async () => {
    try {
      const { data } = await axios.get(api("/api/v1/health"), { timeout: 12000 });
      failures.current = 0;
      setHealth(data);
      setPhase(data.configured ? "ready" : "setup");
      return true;
    } catch {
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
        <div className="flex flex-col items-center gap-3 opacity-40">
          <Logo size={28} className="text-zinc-900 dark:text-white" />
          <span className="text-xs font-medium tracking-widest uppercase text-zinc-500">InfraLens</span>
        </div>
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

  const proxmoxDown = health && health.proxmox && !health.proxmox.ok;

  return (
    <div className="relative">
      {proxmoxDown && !showSettings ? (
        <ConnectionLost onSettings={() => setShowSettings(true)} />
      ) : !proxmoxDown ? (
        <App onOpenSettings={() => setShowSettings(true)} />
      ) : null}
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

function Centered({ children }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-[#09090b] text-zinc-500 dark:text-zinc-400">
      {children}
    </div>
  );
}

function ConnectionLost({ onSettings }) {
  return (
    <div className="fixed inset-0 z-[90] flex flex-col items-center justify-center gap-5 bg-zinc-50/95 dark:bg-[#0a0a0b]/95 backdrop-blur-sm">
      <div className="w-14 h-14 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 flex items-center justify-center shadow-sm">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-400">
          <path d="M1 1l22 22" />
          <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
          <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
          <path d="M10.71 5.05A16 16 0 0 1 22.58 9" />
          <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
          <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
          <line x1="12" y1="20" x2="12.01" y2="20" />
        </svg>
      </div>
      <div className="text-center">
        <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100 mb-1">Connection lost</h3>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-[240px]">
          Can't reach your Proxmox host. Reconnecting automatically…
        </p>
      </div>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 text-[11px] text-zinc-400 dark:text-zinc-500">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-60 animate-ping" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-400" />
          </span>
          Retrying
        </div>
        <button onClick={onSettings}
          className="inline-flex items-center gap-1.5 text-[11px] font-medium text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 rounded-md px-2.5 py-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
          Open Settings
        </button>
      </div>
    </div>
  );
}