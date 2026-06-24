import React, { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { api } from "./api";
import {
  Activity, Server, Cpu, ShieldCheck,
  ArrowRight, ArrowLeft, Check, Loader2, AlertTriangle,
} from "lucide-react";

const STAGES = ["Proxmox", "SSH probe", "Neural link"];

export default function Onboarding({ onDone }) {
  const [step, setStep] = useState(0); // 0 welcome 1 proxmox 2 ssh 3 ollama 4 done
  const [form, setForm] = useState({
    pve_host: "", pve_port: "8006", pve_user: "", pve_token_name: "",
    pve_token_value: "", pve_verify_ssl: false,
    ssh_user: "root", ssh_password: "",
    ollama_url: "http://127.0.0.1:11434", ollama_model: "llama3",
  });
  const [pveState, setPveState] = useState("idle");
  const [pveMsg, setPveMsg] = useState("");
  const [ollState, setOllState] = useState("idle");
  const [ollMsg, setOllMsg] = useState("");
  const [models, setModels] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    axios.get(api("/api/v1/config")).then(({ data }) => {
      setForm((f) => ({
        ...f,
        pve_host: data.pve_host || f.pve_host,
        pve_port: data.pve_port || f.pve_port,
        pve_user: data.pve_user || f.pve_user,
        pve_token_name: data.pve_token_name || f.pve_token_name,
        pve_verify_ssl: !!data.pve_verify_ssl,
        ssh_user: data.ssh_user || f.ssh_user,
        ollama_url: data.ollama_url || f.ollama_url,
        ollama_model: data.ollama_model || f.ollama_model,
      }));
    }).catch(() => {});
  }, []);

  const set = (k) => (e) => {
    const v = e.target.type === "checkbox" ? e.target.checked : e.target.value;
    setForm((f) => ({ ...f, [k]: v }));
    if (step === 1) setPveState("idle");
    if (step === 3) setOllState("idle");
  };

  const testProxmox = useCallback(async () => {
    setBusy(true); setPveState("testing");
    try {
      const { data } = await axios.post(api("/api/v1/test/proxmox"), form);
      setPveState(data.ok ? "ok" : "fail"); setPveMsg(data.detail);
      if (data.ok) setTimeout(() => setStep(2), 400);
    } catch {
      setPveState("fail"); setPveMsg("The InfraLens backend isn’t responding.");
    } finally { setBusy(false); }
  }, [form]);

  const testOllama = useCallback(async () => {
    setBusy(true); setOllState("testing");
    try {
      const { data } = await axios.post(api("/api/v1/test/ollama"), form);
      setModels(data.models || []);
      setOllState(data.ok ? (data.model_ready ? "ok" : "warn") : "fail");
      setOllMsg(data.detail);
    } catch {
      setOllState("fail"); setOllMsg("The InfraLens backend isn’t responding.");
    } finally { setBusy(false); }
  }, [form]);

  const finish = useCallback(async () => {
    setBusy(true);
    try {
      await axios.post(api("/api/v1/config"), form);
      setStep(4);
    } catch {
      setOllState("fail"); setOllMsg("Couldn’t save. Is the backend running?");
    } finally { setBusy(false); }
  }, [form]);

  return (
    <div className="fixed inset-0 z-50 overflow-auto bg-zinc-50 dark:bg-[#09090b] text-zinc-900 dark:text-zinc-100 flex items-center justify-center p-6">
      {step === 0 && <Welcome onBegin={() => setStep(1)} />}

      {step >= 1 && step <= 3 && (
        <div className="w-full max-w-lg">
          <Stepper active={step} />
          <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-white/10 rounded-2xl shadow-2xl p-7">
            {step === 1 && (
              <Stage label="Step 1 — Proxmox" title="Connect your cluster"
                blurb="InfraLens reads your nodes and containers through the Proxmox API. Create a token under Datacenter → Permissions → API Tokens.">
                <Row>
                  <Field grow label="Host / IP" placeholder="192.168.1.50" value={form.pve_host} onChange={set("pve_host")} />
                  <Field label="Port" w="84px" value={form.pve_port} onChange={set("pve_port")} />
                </Row>
                <Row>
                  <Field label="API user" placeholder="root@pam" value={form.pve_user} onChange={set("pve_user")} />
                  <Field label="Token name" placeholder="infralens" value={form.pve_token_name} onChange={set("pve_token_name")} />
                </Row>
                <Field label="Token value" type="password" placeholder="xxxx-xxxx-xxxx-xxxx" value={form.pve_token_value} onChange={set("pve_token_value")} />
                <Toggle checked={form.pve_verify_ssl} onChange={set("pve_verify_ssl")}>Verify SSL certificate</Toggle>
                <Status state={pveState} msg={pveMsg} />
                <Nav onBack={() => setStep(0)}
                  primary={{ label: "Test & continue", onClick: testProxmox, busy }}
                  secondary={pveState === "fail" ? { label: "Continue anyway", onClick: () => setStep(2) } : null} />
              </Stage>
            )}

            {step === 2 && (
              <Stage label="Step 2 — SSH probe" title="Detect services (optional)"
                blurb="With SSH to the Proxmox host, InfraLens can look inside LXC containers and detect what’s running. Skip if you’d rather not.">
                <Row>
                  <Field label="SSH user" value={form.ssh_user} onChange={set("ssh_user")} />
                  <Field label="SSH password" type="password" value={form.ssh_password} onChange={set("ssh_password")} />
                </Row>
                <Nav onBack={() => setStep(1)}
                  primary={{ label: "Continue", onClick: () => setStep(3) }}
                  secondary={{ label: "Skip", onClick: () => setStep(3) }} />
              </Stage>
            )}

            {step === 3 && (
              <Stage label="Step 3 — Neural link" title="Connect local AI"
                blurb="InfraLens answers questions about your lab using a local Ollama model — nothing leaves your network.">
                <Row>
                  <Field grow label="Ollama URL" value={form.ollama_url} onChange={set("ollama_url")} />
                  <Field label="Model" value={form.ollama_model} onChange={set("ollama_model")} />
                </Row>
                {models.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2 mt-1">
                    <span className="text-[10px] uppercase tracking-widest font-bold text-zinc-400">Models</span>
                    {models.map((m) => (
                      <span key={m} className="font-mono text-[11px] bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-white/5 rounded-md px-2 py-0.5 text-zinc-600 dark:text-zinc-300">{m}</span>
                    ))}
                  </div>
                )}
                <Status state={ollState} msg={ollMsg} />
                <Nav onBack={() => setStep(2)}
                  primary={ollState === "idle"
                    ? { label: "Test connection", onClick: testOllama, busy }
                    : { label: "Finish setup", onClick: finish, busy }}
                  secondary={ollState === "fail" ? { label: "Finish without AI", onClick: finish } : null} />
              </Stage>
            )}
          </div>
        </div>
      )}

      {step === 4 && <Done onLaunch={onDone} host={form.pve_host} />}
    </div>
  );
}

function Welcome({ onBegin }) {
  return (
    <div className="w-full max-w-md text-center flex flex-col items-center">
      <div className="w-12 h-12 rounded-xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 flex items-center justify-center mb-6">
        <Activity size={22} className="text-zinc-900 dark:text-white" />
      </div>
      <h1 className="text-2xl font-semibold tracking-tight mb-3">Welcome to InfraLens</h1>
      <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed mb-8 max-w-sm">
        A live map of your Proxmox lab — real-time telemetry, service discovery,
        and an on-prem AI that answers in plain language.
      </p>
      <div className="w-full text-left space-y-3 mb-8">
        <Prereq icon={Server}>A Proxmox host with an API token</Prereq>
        <Prereq icon={Cpu}>Ollama running on your network</Prereq>
        <Prereq icon={ShieldCheck}>Everything stays on your LAN</Prereq>
      </div>
      <button onClick={onBegin} className={btnPrimary + " w-full justify-center"}>
        Get started <ArrowRight size={16} />
      </button>
    </div>
  );
}

function Done({ onLaunch, host }) {
  return (
    <div className="w-full max-w-md text-center flex flex-col items-center">
      <div className="w-14 h-14 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-6">
        <Check size={26} className="text-emerald-500" />
      </div>
      <h1 className="text-2xl font-semibold tracking-tight mb-3">You’re all set</h1>
      <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed mb-8 max-w-sm">
        InfraLens is configured{host ? <> and connected to <span className="font-mono text-zinc-700 dark:text-zinc-300">{host}</span></> : ""}.
        You can change anything later from settings.
      </p>
      <button onClick={onLaunch} className={btnPrimary + " w-full justify-center"}>
        Launch InfraLens <ArrowRight size={16} />
      </button>
    </div>
  );
}

function Stepper({ active }) {
  return (
    <div className="flex items-center gap-3 mb-5 px-1">
      {STAGES.map((s, i) => {
        const n = i + 1;
        const done = n < active, current = n === active;
        return (
          <div key={s} className="flex items-center gap-3 flex-1">
            <div className="flex items-center gap-2 min-w-0">
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                done ? "bg-emerald-500 text-white"
                : current ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                : "bg-zinc-200 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500"}`}>
                {done ? <Check size={11} /> : n}
              </span>
              <span className={`text-[11px] truncate ${current ? "text-zinc-900 dark:text-zinc-100 font-medium" : "text-zinc-400"}`}>{s}</span>
            </div>
            {i < STAGES.length - 1 && <div className={`h-px flex-1 ${done ? "bg-emerald-500/40" : "bg-zinc-200 dark:bg-white/10"}`} />}
          </div>
        );
      })}
    </div>
  );
}

function Stage({ label, title, blurb, children }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase tracking-widest font-bold text-zinc-400 mb-2">{label}</span>
      <h2 className="text-lg font-semibold tracking-tight mb-1.5">{title}</h2>
      <p className="text-[13px] text-zinc-500 dark:text-zinc-400 leading-relaxed mb-6">{blurb}</p>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function Status({ state, msg }) {
  if (state === "idle" || !msg) return null;
  const map = {
    testing: ["text-zinc-500 dark:text-zinc-400", <Loader2 key="i" size={14} className="animate-spin" />],
    ok: ["text-emerald-500", <Check key="i" size={14} />],
    warn: ["text-amber-500", <AlertTriangle key="i" size={14} />],
    fail: ["text-rose-500", <AlertTriangle key="i" size={14} />],
  };
  const [cls, icon] = map[state] || map.testing;
  return <div className={`flex items-start gap-2 text-[13px] mt-1 ${cls}`}>{icon}<span className="text-zinc-600 dark:text-zinc-300">{msg}</span></div>;
}

function Nav({ onBack, primary, secondary }) {
  return (
    <div className="flex items-center justify-between pt-3">
      {onBack
        ? <button onClick={onBack} className="inline-flex items-center gap-1.5 text-[13px] text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"><ArrowLeft size={15} /> Back</button>
        : <span />}
      <div className="flex items-center gap-4">
        {secondary && <button onClick={secondary.onClick} className="text-[13px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors">{secondary.label}</button>}
        <button onClick={primary.onClick} disabled={primary.busy} className={btnPrimary}>
          {primary.busy ? <Loader2 size={15} className="animate-spin" /> : null}
          {primary.label}{!primary.busy && <ArrowRight size={15} />}
        </button>
      </div>
    </div>
  );
}

function Prereq({ icon: Icon, children }) {
  return (
    <div className="flex items-center gap-3 text-[13px] text-zinc-600 dark:text-zinc-300">
      <Icon size={15} className="text-zinc-400 shrink-0" /> {children}
    </div>
  );
}

function Row({ children }) { return <div className="flex gap-3">{children}</div>; }

function Field({ label, value, onChange, placeholder, type = "text", grow, w }) {
  return (
    <label className={`flex flex-col gap-1.5 ${grow ? "flex-1" : ""}`} style={w ? { flex: `0 0 ${w}` } : undefined}>
      <span className="text-[10px] uppercase tracking-widest font-bold text-zinc-400">{label}</span>
      <input
        type={type} value={value} onChange={onChange} placeholder={placeholder}
        className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 rounded-xl py-2.5 px-3.5 text-sm outline-none focus:border-zinc-400 dark:focus:border-zinc-500 transition-colors placeholder:text-zinc-400 dark:placeholder:text-zinc-600"
      />
    </label>
  );
}

function Toggle({ checked, onChange, children }) {
  return (
    <label className="flex items-center gap-2.5 text-[13px] text-zinc-600 dark:text-zinc-300 cursor-pointer select-none">
      <input type="checkbox" checked={checked} onChange={onChange} className="w-4 h-4 accent-zinc-900 dark:accent-white" />
      {children}
    </label>
  );
}

const btnPrimary =
  "inline-flex items-center gap-2 bg-zinc-900 text-white hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200 disabled:opacity-50 disabled:pointer-events-none font-medium text-sm rounded-xl px-4 py-2.5 transition-colors";