import React, { useState, useEffect } from "react";
import axios from "axios";
import { api } from "./api";
import { X, Loader2, Check, AlertTriangle, LogOut } from "lucide-react";


export default function Settings({ onClose, onSaved, onReset }) {
  const [form, setForm] = useState({
    pve_host: "", pve_port: "8006", pve_user: "", pve_token_name: "",
    pve_token_value: "", pve_verify_ssl: false,
    ssh_user: "root", ssh_password: "",
    ollama_url: "http://127.0.0.1:11434", ollama_model: "llama3",
  });
  const [tokenSet, setTokenSet] = useState(false);
  const [sshSet, setSshSet] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    axios.get(api("/api/v1/config")).then(({ data }) => {
      setForm((f) => ({
        ...f,
        pve_host: data.pve_host || "", pve_port: data.pve_port || "8006",
        pve_user: data.pve_user || "", pve_token_name: data.pve_token_name || "",
        pve_verify_ssl: !!data.pve_verify_ssl,
        ssh_user: data.ssh_user || "root",
        ollama_url: data.ollama_url || "http://127.0.0.1:11434",
        ollama_model: data.ollama_model || "llama3",
      }));
      setTokenSet(!!data.pve_token_value_set);
      setSshSet(!!data.ssh_password_set);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const set = (k) => (e) => {
    const v = e.target.type === "checkbox" ? e.target.checked : e.target.value;
    setForm((f) => ({ ...f, [k]: v }));
    setResult(null);
  };

  const save = async () => {
    setSaving(true); setResult(null);
    try {
      const payload = { ...form };
      if (tokenSet && !payload.pve_token_value) delete payload.pve_token_value;
      if (sshSet && !payload.ssh_password) delete payload.ssh_password;
      await axios.post(api("/api/v1/config"), payload);
      const { data } = await axios.get(api("/api/v1/health"));
      setResult({ ok: data.proxmox.ok, msg: data.proxmox.detail });
      onSaved?.();
    } catch {
      setResult({ ok: false, msg: "Save failed. Is the backend running?" });
    } finally { setSaving(false); }
  };

  const disconnect = async () => {
    setResetting(true);
    try {
      await axios.post(api("/api/v1/config/reset"));
      onReset?.();
    } catch {
      setResetting(false);
      setResult({ ok: false, msg: "Couldn’t disconnect. Is the backend running?" });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative w-full max-w-lg max-h-[85vh] bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-white/10 rounded-2xl shadow-2xl flex flex-col text-zinc-900 dark:text-zinc-100">

        <div className="px-6 py-4 border-b border-zinc-200 dark:border-white/5 flex items-center justify-between shrink-0">
          <h2 className="text-sm font-semibold tracking-tight">Settings</h2>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-zinc-100 dark:hover:bg-white/10 text-zinc-500"><X size={16} /></button>
        </div>

        {loading ? (
          <div className="h-48 flex items-center justify-center text-zinc-400"><Loader2 className="animate-spin" /></div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto custom-scrollbar px-6 py-5 space-y-7">
              <Section title="Proxmox API">
                <Row>
                  <Field grow label="Host / IP" value={form.pve_host} onChange={set("pve_host")} />
                  <Field label="Port" w="80px" value={form.pve_port} onChange={set("pve_port")} />
                </Row>
                <Row>
                  <Field label="API user" value={form.pve_user} onChange={set("pve_user")} />
                  <Field label="Token name" value={form.pve_token_name} onChange={set("pve_token_name")} />
                </Row>
                <Field label={`Token value${tokenSet ? " — saved, leave blank to keep" : ""}`} type="password"
                  placeholder={tokenSet ? "••••••••••••" : ""} value={form.pve_token_value} onChange={set("pve_token_value")} />
                <Toggle checked={form.pve_verify_ssl} onChange={set("pve_verify_ssl")}>Verify SSL certificate</Toggle>
              </Section>

              <Section title="SSH probe">
                <Row>
                  <Field label="SSH user" value={form.ssh_user} onChange={set("ssh_user")} />
                  <Field label={`SSH password${sshSet ? " — saved" : ""}`} type="password"
                    placeholder={sshSet ? "••••••••" : ""} value={form.ssh_password} onChange={set("ssh_password")} />
                </Row>
              </Section>

              <Section title="Ollama (AI)">
                <Row>
                  <Field grow label="Ollama URL" value={form.ollama_url} onChange={set("ollama_url")} />
                  <Field label="Model" value={form.ollama_model} onChange={set("ollama_model")} />
                </Row>
              </Section>

              {result && (
                <div className={`flex items-start gap-2 text-[13px] ${result.ok ? "text-emerald-500" : "text-rose-500"}`}>
                  {result.ok ? <Check size={14} /> : <AlertTriangle size={14} />}
                  <span className="text-zinc-600 dark:text-zinc-300">{result.msg}</span>
                </div>
              )}
            </div>

            {confirmReset ? (
              <div className="px-6 py-4 border-t border-zinc-200 dark:border-white/5 shrink-0 flex items-center gap-3">
                <AlertTriangle size={16} className="text-rose-500 shrink-0" />
                <span className="text-[13px] text-zinc-600 dark:text-zinc-300 flex-1">Disconnect and erase your saved settings?</span>
                <button onClick={() => setConfirmReset(false)} className={btnGhost}>Cancel</button>
                <button onClick={disconnect} disabled={resetting} className={btnDanger}>
                  {resetting ? <Loader2 size={14} className="animate-spin" /> : null} Disconnect
                </button>
              </div>
            ) : (
              <div className="px-6 py-4 border-t border-zinc-200 dark:border-white/5 shrink-0 flex items-center justify-between">
                <button onClick={() => setConfirmReset(true)}
                  className="inline-flex items-center gap-1.5 text-[13px] text-zinc-400 hover:text-rose-500 transition-colors">
                  <LogOut size={14} /> Disconnect
                </button>
                <div className="flex items-center gap-2">
                  <button onClick={onClose} className={btnGhost}>Cancel</button>
                  <button onClick={save} disabled={saving} className={btnPrimary}>
                    {saving ? <Loader2 size={14} className="animate-spin" /> : null}
                    {saving ? "Saving…" : "Save changes"}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="space-y-4">
      <h3 className="text-[10px] uppercase tracking-widest font-bold text-zinc-400">{title}</h3>
      {children}
    </div>
  );
}

function Row({ children }) { return <div className="flex gap-3">{children}</div>; }

function Field({ label, value, onChange, placeholder, type = "text", grow, w }) {
  return (
    <label className={`flex flex-col gap-1.5 ${grow ? "flex-1" : ""}`} style={w ? { flex: `0 0 ${w}` } : undefined}>
      <span className="text-[10px] uppercase tracking-widest font-bold text-zinc-400">{label}</span>
      <input type={type} value={value} onChange={onChange} placeholder={placeholder}
        className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 rounded-xl py-2.5 px-3.5 text-sm outline-none focus:border-zinc-400 dark:focus:border-zinc-500 transition-colors placeholder:text-zinc-400 dark:placeholder:text-zinc-600" />
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
  "inline-flex items-center gap-2 bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100 disabled:opacity-50 text-sm font-medium rounded-lg px-4 py-2 transition-colors";
const btnGhost =
  "inline-flex items-center text-sm font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 rounded-lg px-3 py-2 transition-colors";
const btnDanger =
  "inline-flex items-center gap-1.5 bg-rose-500 text-white hover:bg-rose-600 disabled:opacity-50 text-sm font-medium rounded-lg px-4 py-2 transition-colors";