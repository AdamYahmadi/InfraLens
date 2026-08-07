import React, { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { api } from "./api";
import {
  Server, Cpu, ShieldCheck, Terminal,
  ArrowRight, ArrowLeft, Check, Loader2, AlertTriangle, ChevronDown,
} from "lucide-react";
import Logo from "./components/Logo";

const STAGES = [
  { key: "proxmox", label: "Proxmox", desc: "Connect your cluster", icon: Server },
  { key: "ssh", label: "SSH probe", desc: "Detect services", icon: Terminal },
  { key: "ai", label: "Neural link", desc: "Local AI", icon: Cpu },
];

export default function Onboarding({ onDone }) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    pve_host: "", pve_port: "8006", pve_user: "", pve_token_name: "",
    pve_token_value: "", pve_verify_ssl: false,
    ssh_user: "root", ssh_password: "",
    ollama_url: "http://127.0.0.1:11434", ollama_model: "",
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
      setPveState("fail"); setPveMsg("The InfraLens backend isn't responding.");
    } finally { setBusy(false); }
  }, [form]);

  const testOllama = useCallback(async () => {
    setBusy(true); setOllState("testing");
    try {
      const { data } = await axios.post(api("/api/v1/test/ollama"), form);
      const found = data.models || [];
      setModels(found);
      if (found.length && !found.includes(form.ollama_model)) {
        setForm((f) => ({ ...f, ollama_model: found[0] }));
      }
      setOllState(data.ok ? (found.length ? "ok" : "warn") : "fail");
      setOllMsg(data.ok
        ? (found.length ? `Found ${found.length} model${found.length > 1 ? "s" : ""}.` : "Reachable, but no models are pulled. Run: ollama pull llama3")
        : data.detail);
    } catch {
      setOllState("fail"); setOllMsg("The InfraLens backend isn't responding.");
    } finally { setBusy(false); }
  }, [form]);

  const finish = useCallback(async () => {
    setBusy(true);
    try {
      await axios.post(api("/api/v1/config"), form);
      setStep(4);
    } catch {
      setOllState("fail"); setOllMsg("Couldn't save. Is the backend running?");
    } finally { setBusy(false); }
  }, [form]);

  if (step === 0) {
    return (
      <Shell>
        <Welcome onBegin={() => setStep(1)} />
      </Shell>
    );
  }
  if (step === 4) {
    return (
      <Shell>
        <Done onLaunch={onDone} />
      </Shell>
    );
  }

  const activeStage = step - 1; // 0,1,2
  const hasModels = models.length > 0;

  return (
    <div className="fixed inset-0 z-50 bg-zinc-50 dark:bg-[#09090b] text-zinc-900 dark:text-zinc-100 flex">
      {/* LEFT RAIL */}
      <aside className="hidden md:flex w-[300px] shrink-0 flex-col justify-between border-r border-zinc-200 dark:border-zinc-800/80 bg-white dark:bg-[#0d0d0f] p-8">
        <div>
          <div className="flex items-center gap-2.5 mb-12">
            <div className="w-8 h-8 rounded-md bg-zinc-900 dark:bg-zinc-100 flex items-center justify-center">
              <Logo size={17} className="text-white dark:text-zinc-900" />
            </div>
            <span className="font-semibold tracking-tight text-[15px]">InfraLens</span>
          </div>

          <div className="space-y-1">
            {STAGES.map((s, i) => {
              const done = i < activeStage;
              const current = i === activeStage;
              const Icon = s.icon;
              return (
                <div key={s.key}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors ${
                    current ? "bg-zinc-100 dark:bg-zinc-800/60" : ""}`}>
                  <div className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 border ${
                    done ? "bg-emerald-500 border-emerald-500 text-white"
                    : current ? "bg-zinc-900 dark:bg-zinc-100 border-zinc-900 dark:border-zinc-100 text-white dark:text-zinc-900"
                    : "bg-transparent border-zinc-200 dark:border-zinc-700 text-zinc-400 dark:text-zinc-600"}`}>
                    {done ? <Check size={14} /> : <Icon size={14} />}
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className={`text-[13px] font-medium leading-tight ${
                      current ? "text-zinc-900 dark:text-zinc-100"
                      : done ? "text-zinc-500 dark:text-zinc-400"
                      : "text-zinc-400 dark:text-zinc-600"}`}>{s.label}</span>
                    <span className="text-[11px] text-zinc-400 dark:text-zinc-600 leading-tight">{s.desc}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <p className="text-[11px] text-zinc-400 dark:text-zinc-600 leading-relaxed">
          Everything stays on your network. Credentials are stored locally on this machine.
        </p>
      </aside>

      {/* RIGHT FORM PANEL */}
      <main className="flex-1 overflow-auto flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-md">
          {step === 1 && (
            <Stage label="Step 1 of 3" title="Connect your cluster"
              onSubmit={testProxmox}
              blurb="InfraLens reads your nodes and containers through the Proxmox API. Create a token under Datacenter → Permissions → API Tokens.">
              <Row>
                <Field grow label="Host / IP" placeholder="192.168.1.50" value={form.pve_host} onChange={set("pve_host")} autoFocus />
                <Field label="Port" w="88px" value={form.pve_port} onChange={set("pve_port")} />
              </Row>
              <Row>
                <Field grow label="API user" placeholder="root@pam" value={form.pve_user} onChange={set("pve_user")} />
                <Field grow label="Token name" placeholder="infralens" value={form.pve_token_name} onChange={set("pve_token_name")} />
              </Row>
              <Field label="Token value" type="password" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" value={form.pve_token_value} onChange={set("pve_token_value")} />
              <Toggle checked={form.pve_verify_ssl} onChange={set("pve_verify_ssl")}>Verify SSL certificate</Toggle>
              <Status state={pveState} msg={pveMsg} />
              <Nav onBack={() => setStep(0)}
                primary={{ label: "Test & continue", onClick: testProxmox, busy, submit: true }}
                secondary={null} />
            </Stage>
          )}

          {step === 2 && (
            <Stage label="Step 2 of 3" title="Detect services"
              onSubmit={() => setStep(3)}
              blurb="With SSH access to the Proxmox host, InfraLens can look inside LXC containers and detect what's running. This step is optional.">
              <Row>
                <Field grow label="SSH user" value={form.ssh_user} onChange={set("ssh_user")} autoFocus />
                <Field grow label="SSH password" type="password" value={form.ssh_password} onChange={set("ssh_password")} />
              </Row>
              <Nav onBack={() => setStep(1)}
                primary={{ label: "Continue", onClick: () => setStep(3), submit: true }}
                secondary={{ label: "Skip", onClick: () => setStep(3) }} />
            </Stage>
          )}

          {step === 3 && (
            <Stage label="Step 3 of 3" title="Connect local AI"
              onSubmit={() => { hasModels ? finish() : testOllama(); }}
              blurb="InfraLens answers questions about your lab using a local Ollama model — nothing leaves your network. Detect your installed models to choose one.">

              {!hasModels ? (
                <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/40 px-4 py-6 text-center">
                  <Cpu size={20} className="mx-auto text-zinc-400 mb-2.5" />
                  <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mb-4 max-w-[280px] mx-auto leading-relaxed">
                    Detect the models installed on your Ollama server, then pick one.
                  </p>
                  <button type="button" onClick={testOllama} disabled={busy} className={btnPrimary + " mx-auto"}>
                    {busy ? <Loader2 size={15} className="animate-spin" /> : null}
                    {busy ? "Detecting…" : "Detect models"}
                  </button>
                </div>
              ) : (
                <label className="flex flex-col gap-1.5">
                  <span className="text-[10px] uppercase tracking-widest font-bold text-zinc-400">Model</span>
                  <div className="relative">
                    <select value={form.ollama_model} onChange={set("ollama_model")}
                      className="w-full appearance-none bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 rounded-lg py-2.5 pl-3.5 pr-9 text-sm outline-none focus:border-zinc-400 dark:focus:border-zinc-500 focus:ring-1 focus:ring-zinc-400/20 transition-all cursor-pointer">
                      {models.map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                    <ChevronDown size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
                  </div>
                  <button type="button" onClick={testOllama} disabled={busy}
                    className="text-[11px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors self-start mt-0.5">
                    {busy ? "Refreshing…" : "Refresh list"}
                  </button>
                </label>
              )}

              <AdvancedUrl value={form.ollama_url} onChange={set("ollama_url")} />
              <Status state={ollState} msg={ollMsg} />

              <Nav onBack={() => setStep(2)}
                primary={hasModels
                  ? { label: "Finish setup", onClick: finish, busy, submit: true }
                  : { label: "Detect models", onClick: testOllama, busy, submit: true }}
                secondary={ollState === "fail" ? { label: "Finish without AI", onClick: finish } : null} />
            </Stage>
          )}
        </div>
      </main>
    </div>
  );
}

function Shell({ children }) {
  return (
    <div className="fixed inset-0 z-50 overflow-auto bg-zinc-50 dark:bg-[#09090b] text-zinc-900 dark:text-zinc-100 flex items-center justify-center p-6">
      {children}
    </div>
  );
}

function Welcome({ onBegin }) {
  return (
    <div className="w-full max-w-md text-center flex flex-col items-center">
      <div className="w-16 h-16 rounded-2xl bg-zinc-900 dark:bg-zinc-100 flex items-center justify-center mb-8">
        <Logo size={34} className="text-white dark:text-zinc-900" />
      </div>
      <h1 className="text-3xl font-semibold tracking-tight mb-3">Welcome to InfraLens</h1>
      <p className="text-[15px] text-zinc-500 dark:text-zinc-400 leading-relaxed mb-9 max-w-sm">
        Your Proxmox cluster, visualised in real time. Monitor every node and
        container, and query your infrastructure in plain language — all on your LAN.
      </p>
      <div className="w-full text-left space-y-3 mb-9">
        <Prereq icon={Server}>A Proxmox host with an API token</Prereq>
        <Prereq icon={Cpu}>Ollama running on your network (optional)</Prereq>
        <Prereq icon={ShieldCheck}>Everything stays on your LAN</Prereq>
      </div>
      <button onClick={onBegin} className={btnPrimary + " w-full justify-center py-3 text-[15px]"}>
        Get started <ArrowRight size={17} />
      </button>
    </div>
  );
}

function Done({ onLaunch }) {
  return (
    <div className="w-full max-w-md text-center flex flex-col items-center">
      <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-8">
        <Check size={32} className="text-emerald-500" />
      </div>
      <h1 className="text-3xl font-semibold tracking-tight mb-3">You're all set</h1>
      <p className="text-[15px] text-zinc-500 dark:text-zinc-400 leading-relaxed mb-9 max-w-sm">
        Your cluster is connected and InfraLens is ready to go. You can update any
        setting later from the gear icon in the sidebar.
      </p>
      <button onClick={onLaunch} className={btnPrimary + " w-full justify-center py-3 text-[15px]"}>
        Launch InfraLens <ArrowRight size={17} />
      </button>
    </div>
  );
}

function Stage({ label, title, blurb, children, onSubmit }) {
  const inner = (
    <>
      <span className="text-[10px] uppercase tracking-widest font-bold text-zinc-400 mb-2">{label}</span>
      <h2 className="text-2xl font-semibold tracking-tight mb-2">{title}</h2>
      <p className="text-[13px] text-zinc-500 dark:text-zinc-400 leading-relaxed mb-8">{blurb}</p>
      <div className="space-y-4">{children}</div>
    </>
  );
  if (onSubmit) {
    return (
      <form className="flex flex-col" onSubmit={(e) => { e.preventDefault(); onSubmit(); }}>
        {inner}
      </form>
    );
  }
  return <div className="flex flex-col">{inner}</div>;
}

function AdvancedUrl({ value, onChange }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" onClick={() => setOpen((o) => !o)}
        className="text-[11px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors">
        {open ? "− Hide advanced" : "+ Advanced (Ollama URL)"}
      </button>
      {open && (
        <div className="mt-2">
          <Field label="Ollama URL" value={value} onChange={onChange} />
        </div>
      )}
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
  return (
    <div className={`flex items-start gap-2 text-[13px] rounded-lg px-3 py-2.5 border ${
      state === "ok" ? "border-emerald-500/20 bg-emerald-500/5"
      : state === "warn" ? "border-amber-500/20 bg-amber-500/5"
      : state === "fail" ? "border-rose-500/20 bg-rose-500/5"
      : "border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/40"}`}>
      <span className={`mt-0.5 shrink-0 ${cls}`}>{icon}</span>
      <span className="text-zinc-600 dark:text-zinc-300 leading-relaxed">{msg}</span>
    </div>
  );
}

function Nav({ onBack, primary, secondary }) {
  return (
    <div className="flex items-center justify-between pt-3">
      {onBack
        ? <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 text-[13px] text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"><ArrowLeft size={15} /> Back</button>
        : <span />}
      <div className="flex items-center gap-4">
        {secondary && <button type="button" onClick={secondary.onClick} className="text-[13px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors">{secondary.label}</button>}
        <button type={primary.submit ? "submit" : "button"} onClick={primary.submit ? undefined : primary.onClick} disabled={primary.busy} className={btnPrimary}>
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
      <div className="w-8 h-8 rounded-lg bg-zinc-100 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700/60 flex items-center justify-center shrink-0">
        <Icon size={15} className="text-zinc-500 dark:text-zinc-400" />
      </div>
      {children}
    </div>
  );
}

function Row({ children }) { return <div className="flex gap-3">{children}</div>; }

function Field({ label, value, onChange, placeholder, type = "text", grow, w, autoFocus }) {
  return (
    <label className={`flex flex-col gap-1.5 ${grow ? "flex-1" : ""}`} style={w ? { flex: `0 0 ${w}` } : undefined}>
      <span className="text-[10px] uppercase tracking-widest font-bold text-zinc-400">{label}</span>
      <input type={type} value={value} onChange={onChange} placeholder={placeholder} autoFocus={autoFocus}
        className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 rounded-lg py-2.5 px-3.5 text-sm outline-none focus:border-zinc-400 dark:focus:border-zinc-500 focus:ring-1 focus:ring-zinc-400/20 transition-all placeholder:text-zinc-400 dark:placeholder:text-zinc-600" />
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
  "inline-flex items-center gap-2 bg-zinc-900 text-white hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200 disabled:opacity-50 disabled:pointer-events-none font-medium text-sm rounded-lg px-4 py-2.5 transition-colors";