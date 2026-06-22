import React, { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { api } from "./api";
import {
  Hexagon, Network, TerminalSquare, Cpu, ArrowRight, ArrowLeft,
  Check, Loader2, AlertTriangle, ShieldCheck, Server, Sparkles,
} from "lucide-react";

/*
 * First-run experience for InfraLens.
 *
 * A welcome screen followed by a three-stage guided setup — Proxmox link,
 * SSH probe, neural (Ollama) link — each verified live before the user
 * continues, styled as a console "power-up" sequence to match the app.
 *
 * Props: onDone()  -> called once setup is saved and the user launches in.
 */

const STAGES = [
  { key: "proxmox", code: "01", label: "Proxmox link", icon: Network },
  { key: "ssh", code: "02", label: "SSH probe", icon: TerminalSquare },
  { key: "ollama", code: "03", label: "Neural link", icon: Cpu },
];

export default function Onboarding({ onDone }) {
  // step: 0 welcome · 1 proxmox · 2 ssh · 3 ollama · 4 done
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    pve_host: "", pve_port: "8006", pve_user: "", pve_token_name: "",
    pve_token_value: "", pve_verify_ssl: false,
    ssh_user: "root", ssh_password: "",
    ollama_url: "http://127.0.0.1:11434", ollama_model: "llama3",
  });
  const [status, setStatus] = useState({ proxmox: "idle", ssh: "idle", ollama: "idle" });
  const [msg, setMsg] = useState({ proxmox: "", ssh: "", ollama: "" });
  const [models, setModels] = useState([]);
  const [busy, setBusy] = useState(false);
  const [finishing, setFinishing] = useState(false);

  useEffect(() => {
    // Prefill if the user is re-running setup.
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
    setStatus((s) => ({ ...s, [activeKey()]: "idle" }));
  };

  const activeKey = () => (step >= 1 && step <= 3 ? STAGES[step - 1].key : null);

  const testProxmox = useCallback(async () => {
    setBusy(true); setStatus((s) => ({ ...s, proxmox: "testing" }));
    try {
      const { data } = await axios.post(api("/api/v1/test/proxmox"), {
        pve_host: form.pve_host, pve_port: form.pve_port, pve_user: form.pve_user,
        pve_token_name: form.pve_token_name, pve_token_value: form.pve_token_value,
        pve_verify_ssl: form.pve_verify_ssl,
      });
      setStatus((s) => ({ ...s, proxmox: data.ok ? "ok" : "fail" }));
      setMsg((m) => ({ ...m, proxmox: data.detail }));
      if (data.ok) setStep(2);
    } catch {
      setStatus((s) => ({ ...s, proxmox: "fail" }));
      setMsg((m) => ({ ...m, proxmox: "The InfraLens backend isn't responding." }));
    } finally { setBusy(false); }
  }, [form]);

  const testOllama = useCallback(async () => {
    setBusy(true); setStatus((s) => ({ ...s, ollama: "testing" }));
    try {
      const { data } = await axios.post(api("/api/v1/test/ollama"), {
        ollama_url: form.ollama_url, ollama_model: form.ollama_model,
      });
      setModels(data.models || []);
      setStatus((s) => ({ ...s, ollama: data.ok ? (data.model_ready ? "ok" : "warn") : "fail" }));
      setMsg((m) => ({ ...m, ollama: data.detail }));
    } catch {
      setStatus((s) => ({ ...s, ollama: "fail" }));
      setMsg((m) => ({ ...m, ollama: "The InfraLens backend isn't responding." }));
    } finally { setBusy(false); }
  }, [form]);

  const finish = useCallback(async () => {
    setFinishing(true);
    try {
      await axios.post(api("/api/v1/config"), form);
      setStep(4);
    } catch {
      setMsg((m) => ({ ...m, ollama: "Couldn't save. Is the backend running?" }));
    } finally { setFinishing(false); }
  }, [form]);

  return (
    <div className="il-onb">
      <style>{CSS}</style>
      <div className="il-grid" aria-hidden />
      <div className="il-glow" aria-hidden />

      {step === 0 && <Welcome onBegin={() => setStep(1)} />}

      {step >= 1 && step <= 3 && (
        <div className="il-stage">
          <Rail step={step} status={status} />
          <div className="il-panel">
            {step === 1 && (
              <Stage
                title="Link your Proxmox cluster"
                blurb="InfraLens reads your nodes, VMs and containers through the Proxmox API. Create an API token in Datacenter → Permissions → API Tokens, then enter it here."
                status={status.proxmox} message={msg.proxmox}
              >
                <Row>
                  <Field className="grow" label="Host or IP" placeholder="192.168.1.50"
                    value={form.pve_host} onChange={set("pve_host")} />
                  <Field label="Port" width="90px" value={form.pve_port} onChange={set("pve_port")} />
                </Row>
                <Row>
                  <Field label="API user" placeholder="root@pam" value={form.pve_user} onChange={set("pve_user")} />
                  <Field label="Token name" placeholder="infralens" value={form.pve_token_name} onChange={set("pve_token_name")} />
                </Row>
                <Field label="Token value" type="password" placeholder="xxxx-xxxx-xxxx-xxxx"
                  value={form.pve_token_value} onChange={set("pve_token_value")} />
                <Check_ checked={form.pve_verify_ssl} onChange={set("pve_verify_ssl")}>
                  Verify SSL certificate
                </Check_>
                <Nav
                  onBack={() => setStep(0)}
                  primary={{ label: busy ? "Testing…" : "Test & continue", onClick: testProxmox, busy }}
                  secondary={status.proxmox === "fail"
                    ? { label: "Continue anyway", onClick: () => setStep(2) } : null}
                />
              </Stage>
            )}

            {step === 2 && (
              <Stage
                title="SSH probe (optional)"
                blurb="With SSH access to the Proxmox host, InfraLens can look inside LXC containers and detect the services running in them. Skip this if you'd rather not."
                status="idle" message=""
              >
                <Row>
                  <Field label="SSH user" value={form.ssh_user} onChange={set("ssh_user")} />
                  <Field label="SSH password" type="password" value={form.ssh_password} onChange={set("ssh_password")} />
                </Row>
                <Nav
                  onBack={() => setStep(1)}
                  primary={{ label: "Continue", onClick: () => setStep(3) }}
                  secondary={{ label: "Skip", onClick: () => setStep(3) }}
                />
              </Stage>
            )}

            {step === 3 && (
              <Stage
                title="Connect the neural link"
                blurb="InfraLens answers questions about your lab using a local Ollama model — nothing leaves your network. Point it at your Ollama server and pick a model."
                status={status.ollama} message={msg.ollama}
              >
                <Row>
                  <Field className="grow" label="Ollama URL" value={form.ollama_url} onChange={set("ollama_url")} />
                  <Field label="Model" value={form.ollama_model} onChange={set("ollama_model")} />
                </Row>
                {models.length > 0 && (
                  <div className="il-models">
                    <span className="il-mono il-dim">models found</span>
                    {models.map((m) => <span key={m} className="il-chip">{m}</span>)}
                  </div>
                )}
                <Nav
                  onBack={() => setStep(2)}
                  primary={status.ollama === "idle"
                    ? { label: busy ? "Testing…" : "Test connection", onClick: testOllama, busy }
                    : { label: finishing ? "Saving…" : "Finish setup", onClick: finish, busy: finishing }}
                  secondary={status.ollama === "fail"
                    ? { label: "Finish without AI", onClick: finish } : null}
                />
              </Stage>
            )}
          </div>
        </div>
      )}

      {step === 4 && <Done onLaunch={onDone} form={form} />}
    </div>
  );
}

/* ----------------------------------------------------------------- screens */

function Welcome({ onBegin }) {
  return (
    <div className="il-welcome">
      <div className="il-mark"><Hexagon strokeWidth={1.25} /><span className="il-mark-dot" /></div>
      <div className="il-word">INFRA<span>LENS</span></div>
      <p className="il-thesis">
        See your Proxmox lab as one living map — live telemetry, service discovery,
        and an on-prem AI that answers in plain language.
      </p>
      <ul className="il-prereq">
        <li><Server size={14} /> A Proxmox host with an API token</li>
        <li><Cpu size={14} /> Ollama running on your network</li>
        <li><ShieldCheck size={14} /> Everything stays local — nothing leaves your LAN</li>
      </ul>
      <button className="il-cta" onClick={onBegin}>
        Begin setup <ArrowRight size={18} />
      </button>
      <div className="il-version il-mono">InfraLens · first-run setup</div>
    </div>
  );
}

function Done({ onLaunch, form }) {
  return (
    <div className="il-welcome il-done">
      <div className="il-okring"><Check strokeWidth={2.5} /></div>
      <div className="il-word">System online</div>
      <p className="il-thesis">
        InfraLens is configured and connected to <b>{form.pve_host || "your cluster"}</b>.
        You can change any of this later from settings.
      </p>
      <button className="il-cta" onClick={onLaunch}>
        Launch InfraLens <Sparkles size={18} />
      </button>
    </div>
  );
}

/* ------------------------------------------------------------- left rail */

function Rail({ step, status }) {
  return (
    <aside className="il-rail">
      <div className="il-rail-head">
        <div className="il-mark sm"><Hexagon strokeWidth={1.5} /></div>
        <span className="il-mono">INFRALENS / setup</span>
      </div>
      <ol className="il-steps">
        {STAGES.map((s, i) => {
          const n = i + 1;
          const state = n < step ? "done" : n === step ? "active" : "pending";
          const st = status[s.key];
          return (
            <li key={s.key} className={`il-step ${state}`}>
              <Dot state={state} st={st} />
              <div className="il-step-text">
                <span className="il-mono il-code">{s.code}</span>
                <span className="il-step-label">{s.label}</span>
              </div>
            </li>
          );
        })}
      </ol>
      <div className="il-rail-foot il-mono il-dim">local · private · self-hosted</div>
    </aside>
  );
}

function Dot({ state, st }) {
  let cls = "il-dot";
  if (st === "ok") cls += " ok";
  else if (st === "warn") cls += " warn";
  else if (st === "fail") cls += " fail";
  else if (st === "testing") cls += " testing";
  else if (state === "active") cls += " active";
  else if (state === "done") cls += " ok";
  return <span className={cls} />;
}

/* ------------------------------------------------------------- stage shell */

function Stage({ title, blurb, status, message, children }) {
  return (
    <div className="il-stagebody">
      <h1 className="il-h1">{title}</h1>
      <p className="il-blurb">{blurb}</p>
      <div className="il-fields">{children}</div>
      {message && <StatusLine status={status} message={message} />}
    </div>
  );
}

function StatusLine({ status, message }) {
  const map = {
    testing: { icon: <Loader2 className="il-spin" size={15} />, cls: "info" },
    ok: { icon: <Check size={15} />, cls: "ok" },
    warn: { icon: <AlertTriangle size={15} />, cls: "warn" },
    fail: { icon: <AlertTriangle size={15} />, cls: "fail" },
  };
  const m = map[status] || map.info || { icon: null, cls: "info" };
  return <div className={`il-status ${m.cls}`}>{m.icon}<span>{message}</span></div>;
}

/* --------------------------------------------------------------- controls */

function Row({ children }) { return <div className="il-row">{children}</div>; }

function Field({ label, value, onChange, placeholder, type = "text", width, className = "" }) {
  return (
    <label className={`il-field ${className}`} style={width ? { flex: `0 0 ${width}` } : undefined}>
      <span className="il-label il-mono">{label}</span>
      <input className="il-input" type={type} value={value} onChange={onChange} placeholder={placeholder} />
    </label>
  );
}

function Check_({ checked, onChange, children }) {
  return (
    <label className="il-check">
      <input type="checkbox" checked={checked} onChange={onChange} />
      <span>{children}</span>
    </label>
  );
}

function Nav({ onBack, primary, secondary }) {
  return (
    <div className="il-nav">
      {onBack && <button className="il-ghost" onClick={onBack}><ArrowLeft size={16} /> Back</button>}
      <div className="il-nav-right">
        {secondary && <button className="il-link" onClick={secondary.onClick}>{secondary.label}</button>}
        <button className="il-cta sm" onClick={primary.onClick} disabled={primary.busy}>
          {primary.busy ? <Loader2 className="il-spin" size={16} /> : null}
          {primary.label}{!primary.busy && <ArrowRight size={16} />}
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------- style */

const CSS = `
.il-onb{position:fixed;inset:0;overflow:auto;background:#0b1120;color:#e2e8f0;
  font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
  display:flex;align-items:center;justify-content:center;padding:32px;}
.il-mono{font-family:ui-monospace,"SF Mono","JetBrains Mono",Menlo,monospace;
  letter-spacing:.08em;text-transform:uppercase;font-size:11px;}
.il-dim{color:#64748b;}
.il-grid{position:absolute;inset:0;pointer-events:none;
  background-image:linear-gradient(#1e293b66 1px,transparent 1px),linear-gradient(90deg,#1e293b66 1px,transparent 1px);
  background-size:48px 48px;mask-image:radial-gradient(ellipse 80% 70% at 50% 40%,#000 30%,transparent 75%);opacity:.5;}
.il-glow{position:absolute;inset:0;pointer-events:none;
  background:radial-gradient(60% 50% at 50% 30%,#10b98122,transparent 70%);}

/* welcome */
.il-welcome{position:relative;z-index:1;max-width:560px;text-align:center;
  display:flex;flex-direction:column;align-items:center;gap:18px;
  animation:il-rise .6s cubic-bezier(.2,.7,.2,1) both;}
.il-mark{position:relative;color:#10b981;width:64px;height:64px;display:grid;place-items:center;
  border:1px solid #1e293b;border-radius:18px;background:#0f172a;box-shadow:0 0 40px #10b98133;}
.il-mark svg{width:34px;height:34px;}
.il-mark.sm{width:30px;height:30px;border-radius:9px;}.il-mark.sm svg{width:17px;height:17px;}
.il-mark-dot{position:absolute;width:8px;height:8px;border-radius:50%;background:#10b981;
  box-shadow:0 0 12px #10b981;animation:il-pulse 2s infinite;}
.il-word{font-size:34px;font-weight:700;letter-spacing:.14em;}
.il-word span{color:#10b981;}
.il-thesis{color:#94a3b8;font-size:15px;line-height:1.6;max-width:460px;margin:0;}
.il-prereq{list-style:none;padding:0;margin:6px 0 4px;display:flex;flex-direction:column;gap:9px;
  text-align:left;font-size:13.5px;color:#cbd5e1;}
.il-prereq li{display:flex;align-items:center;gap:9px;}
.il-prereq svg{color:#10b981;flex:0 0 auto;}
.il-version{margin-top:10px;}

/* cta */
.il-cta{display:inline-flex;align-items:center;gap:9px;background:#10b981;color:#04140d;
  font-weight:600;font-size:15px;border:none;border-radius:12px;padding:13px 22px;cursor:pointer;
  transition:transform .12s ease,box-shadow .2s ease,background .2s ease;box-shadow:0 8px 30px #10b98133;}
.il-cta:hover{background:#34d399;transform:translateY(-1px);box-shadow:0 10px 36px #10b98144;}
.il-cta:disabled{opacity:.6;cursor:default;transform:none;}
.il-cta.sm{font-size:14px;padding:10px 16px;border-radius:10px;}

/* stage layout */
.il-stage{position:relative;z-index:1;display:flex;width:100%;max-width:880px;min-height:520px;
  background:#0d1526cc;border:1px solid #1e293b;border-radius:20px;overflow:hidden;
  backdrop-filter:blur(8px);box-shadow:0 30px 80px #00000066;animation:il-rise .5s ease both;}
.il-rail{flex:0 0 248px;background:linear-gradient(180deg,#0c1322,#0a1020);
  border-right:1px solid #1e293b;padding:22px 20px;display:flex;flex-direction:column;}
.il-rail-head{display:flex;align-items:center;gap:10px;color:#94a3b8;padding-bottom:22px;border-bottom:1px solid #16223a;}
.il-steps{list-style:none;margin:22px 0 0;padding:0;display:flex;flex-direction:column;gap:4px;}
.il-step{display:flex;align-items:center;gap:13px;padding:11px 10px;border-radius:10px;color:#64748b;
  transition:background .2s,color .2s;}
.il-step.active{background:#10b9810f;color:#e2e8f0;}
.il-step.done{color:#94a3b8;}
.il-step-text{display:flex;flex-direction:column;line-height:1.3;}
.il-code{color:#475569;}
.il-step.active .il-code{color:#10b981;}
.il-step-label{font-size:13.5px;}
.il-dot{width:11px;height:11px;border-radius:50%;flex:0 0 auto;background:#1e293b;border:1px solid #334155;transition:all .25s;}
.il-dot.active{border-color:#10b981;box-shadow:0 0 0 3px #10b98122;}
.il-dot.ok{background:#10b981;border-color:#10b981;box-shadow:0 0 10px #10b98188;}
.il-dot.warn{background:#f59e0b;border-color:#f59e0b;}
.il-dot.fail{background:#f43f5e;border-color:#f43f5e;}
.il-dot.testing{background:#22d3ee;border-color:#22d3ee;animation:il-pulse 1s infinite;}
.il-rail-foot{margin-top:auto;padding-top:18px;}

/* panel */
.il-panel{flex:1;display:flex;flex-direction:column;}
.il-stagebody{padding:34px 36px;display:flex;flex-direction:column;height:100%;}
.il-h1{font-size:23px;font-weight:650;margin:0 0 8px;letter-spacing:-.01em;}
.il-blurb{color:#94a3b8;font-size:14px;line-height:1.6;margin:0 0 24px;max-width:440px;}
.il-fields{display:flex;flex-direction:column;gap:16px;}
.il-row{display:flex;gap:14px;}
.il-field{display:flex;flex-direction:column;gap:7px;flex:1;}
.il-field.grow{flex:1;}
.il-label{color:#7c8aa3;}
.il-input{background:#0a1120;border:1px solid #243149;border-radius:9px;padding:10px 12px;color:#e6edf7;
  font-size:14px;outline:none;transition:border .15s,box-shadow .15s;width:100%;}
.il-input::placeholder{color:#3e4d66;}
.il-input:focus{border-color:#10b981;box-shadow:0 0 0 3px #10b9811f;}
.il-check{display:flex;align-items:center;gap:9px;color:#cbd5e1;font-size:13.5px;cursor:pointer;}
.il-check input{accent-color:#10b981;width:15px;height:15px;}
.il-models{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:4px;}
.il-chip{background:#10b9811a;border:1px solid #10b98144;color:#6ee7b7;border-radius:999px;
  padding:3px 10px;font-size:12px;}

/* status line */
.il-status{display:flex;align-items:center;gap:9px;margin-top:18px;font-size:13.5px;
  padding:10px 12px;border-radius:9px;border:1px solid transparent;}
.il-status.info{color:#7dd3fc;background:#0ea5e90f;border-color:#0ea5e933;}
.il-status.ok{color:#6ee7b7;background:#10b9810f;border-color:#10b98133;}
.il-status.warn{color:#fcd34d;background:#f59e0b0f;border-color:#f59e0b33;}
.il-status.fail{color:#fda4af;background:#f43f5e0f;border-color:#f43f5e33;}

/* nav */
.il-nav{margin-top:auto;padding-top:26px;display:flex;align-items:center;justify-content:space-between;}
.il-nav-right{display:flex;align-items:center;gap:16px;margin-left:auto;}
.il-ghost{display:inline-flex;align-items:center;gap:6px;background:transparent;border:1px solid #243149;
  color:#94a3b8;border-radius:9px;padding:9px 14px;font-size:13.5px;cursor:pointer;transition:all .15s;}
.il-ghost:hover{border-color:#334a6a;color:#cbd5e1;}
.il-link{background:none;border:none;color:#64748b;font-size:13px;cursor:pointer;text-decoration:underline;}
.il-link:hover{color:#94a3b8;}

/* done */
.il-okring{width:72px;height:72px;border-radius:50%;display:grid;place-items:center;color:#04140d;
  background:#10b981;box-shadow:0 0 50px #10b98166;animation:il-pop .5s cubic-bezier(.2,1.4,.4,1) both;}
.il-okring svg{width:36px;height:36px;}

.il-spin{animation:il-rot 1s linear infinite;}
@keyframes il-rot{to{transform:rotate(360deg);}}
@keyframes il-pulse{0%,100%{opacity:1;}50%{opacity:.35;}}
@keyframes il-rise{from{opacity:0;transform:translateY(14px);}to{opacity:1;transform:none;}}
@keyframes il-pop{from{opacity:0;transform:scale(.7);}to{opacity:1;transform:none;}}

@media (max-width:760px){
  .il-stage{flex-direction:column;min-height:0;}
  .il-rail{flex:none;border-right:none;border-bottom:1px solid #1e293b;}
  .il-steps{flex-direction:row;gap:8px;}.il-rail-foot,.il-step-label{display:none;}
  .il-row{flex-direction:column;}
}
@media (prefers-reduced-motion:reduce){
  .il-onb *{animation:none!important;transition:none!important;}
}
`;
