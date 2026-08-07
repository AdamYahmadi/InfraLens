import React, { useState, useEffect } from "react";
import axios from "axios";
import { api } from "./api";
import {
  X,
  Loader2,
  Check,
  AlertTriangle,
  LogOut,
  ChevronDown,
  RefreshCw,
  Server,
  Terminal,
  Cpu,
} from "lucide-react";

export default function Settings({ onClose, onSaved, onReset }) {
  const [form, setForm] = useState({
    pve_host: "",
    pve_port: "8006",
    pve_user: "",
    pve_token_name: "",
    pve_token_value: "",
    pve_verify_ssl: false,
    ssh_user: "root",
    ssh_password: "",
    ollama_url: "http://127.0.0.1:11434",
    ollama_model: "",
  });
  const [tokenSet, setTokenSet] = useState(false);
  const [sshSet, setSshSet] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetting, setResetting] = useState(false);

  const [models, setModels] = useState([]);
  const [detecting, setDetecting] = useState(false);
  const [ollErr, setOllErr] = useState("");
  const [showUrl, setShowUrl] = useState(false);

  useEffect(() => {
    axios
      .get(api("/api/v1/config"))
      .then(({ data }) => {
        const savedModel = data.ollama_model || "";
        const savedUrl = data.ollama_url || "http://127.0.0.1:11434";
        setForm((f) => ({
          ...f,
          pve_host: data.pve_host || "",
          pve_port: data.pve_port || "8006",
          pve_user: data.pve_user || "",
          pve_token_name: data.pve_token_name || "",
          pve_verify_ssl: !!data.pve_verify_ssl,
          ssh_user: data.ssh_user || "root",
          ollama_url: savedUrl,
          ollama_model: savedModel,
        }));
        setTokenSet(!!data.pve_token_value_set);
        setSshSet(!!data.ssh_password_set);
        detectModels(savedUrl, savedModel);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const detectModels = async (url, keepModel) => {
    setDetecting(true);
    setOllErr("");
    try {
      const { data } = await axios.post(api("/api/v1/test/ollama"), {
        ollama_url: url || form.ollama_url,
        ollama_model: keepModel ?? form.ollama_model,
      });
      const found = data.models || [];
      setModels(found);
      if (!data.ok) setOllErr(data.detail || "Couldn't reach Ollama.");
      setForm((f) => {
        const want = keepModel ?? f.ollama_model;
        if (found.length && !found.includes(want))
          return { ...f, ollama_model: found[0] };
        return f;
      });
    } catch {
      setModels([]);
      setOllErr("The InfraLens backend isn't responding.");
    } finally {
      setDetecting(false);
    }
  };

  const set = (k) => (e) => {
    const v = e.target.type === "checkbox" ? e.target.checked : e.target.value;
    setForm((f) => ({ ...f, [k]: v }));
    setResult(null);
  };

  const save = async () => {
    setSaving(true);
    setResult(null);
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
    } finally {
      setSaving(false);
    }
  };

  const disconnect = async () => {
    setResetting(true);
    try {
      await axios.post(api("/api/v1/config/reset"));
      onReset?.();
    } catch {
      setResetting(false);
      setResult({
        ok: false,
        msg: "Couldn’t disconnect. Is the backend running?",
      });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div className="relative w-full max-w-lg max-h-[86vh] bg-white dark:bg-[#0d0d0f] border border-zinc-200 dark:border-white/10 rounded-2xl shadow-2xl flex flex-col text-zinc-900 dark:text-zinc-100">
        <div className="px-6 h-14 border-b border-zinc-200 dark:border-white/5 flex items-center justify-between shrink-0">
          <h2 className="text-[15px] font-semibold tracking-tight">Settings</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-zinc-100 dark:hover:bg-white/10 text-zinc-500 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {loading ? (
          <div className="h-48 flex items-center justify-center text-zinc-400">
            <Loader2 className="animate-spin" />
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto custom-scrollbar px-6 py-6 space-y-6">
              <Section
                icon={Server}
                title="Proxmox API"
                desc="Connection to your cluster"
              >
                <Row>
                  <Field
                    grow
                    label="Host / IP"
                    value={form.pve_host}
                    onChange={set("pve_host")}
                  />
                  <Field
                    label="Port"
                    w="84px"
                    value={form.pve_port}
                    onChange={set("pve_port")}
                  />
                </Row>
                <Row>
                  <Field
                    grow
                    label="API user"
                    value={form.pve_user}
                    onChange={set("pve_user")}
                  />
                  <Field
                    grow
                    label="Token name"
                    value={form.pve_token_name}
                    onChange={set("pve_token_name")}
                  />
                </Row>
                <Field
                  label={`Token value${tokenSet ? " · saved, leave blank to keep" : ""}`}
                  type="password"
                  placeholder={
                    tokenSet
                      ? "••••••••••••"
                      : "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  }
                  value={form.pve_token_value}
                  onChange={set("pve_token_value")}
                />
                <Toggle
                  checked={form.pve_verify_ssl}
                  onChange={set("pve_verify_ssl")}
                >
                  Verify SSL certificate
                </Toggle>
              </Section>

              <Divider />

              <Section
                icon={Terminal}
                title="SSH probe"
                desc="Optional — detects services inside containers"
              >
                <Row>
                  <Field
                    grow
                    label="SSH user"
                    value={form.ssh_user}
                    onChange={set("ssh_user")}
                  />
                  <Field
                    grow
                    label={`SSH password${sshSet ? " · saved" : ""}`}
                    type="password"
                    placeholder={sshSet ? "••••••••" : ""}
                    value={form.ssh_password}
                    onChange={set("ssh_password")}
                  />
                </Row>
              </Section>

              <Divider />

              <Section
                icon={Cpu}
                title="Local AI"
                desc="Ollama model used for chat"
              >
                <label className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase tracking-widest font-bold text-zinc-400">
                      Model
                    </span>
                    <button
                      type="button"
                      onClick={() => detectModels()}
                      disabled={detecting}
                      className="inline-flex items-center gap-1 text-[11px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
                    >
                      <RefreshCw
                        size={11}
                        className={detecting ? "animate-spin" : ""}
                      />{" "}
                      {detecting ? "Detecting…" : "Refresh"}
                    </button>
                  </div>
                  {models.length > 0 ? (
                    <div className="relative">
                      <select
                        value={form.ollama_model}
                        onChange={set("ollama_model")}
                        className="w-full appearance-none bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 rounded-lg py-2.5 pl-3.5 pr-9 text-sm outline-none focus:border-zinc-400 dark:focus:border-zinc-500 focus:ring-1 focus:ring-zinc-400/20 transition-all cursor-pointer"
                      >
                        {form.ollama_model &&
                          !models.includes(form.ollama_model) && (
                            <option value={form.ollama_model}>
                              {form.ollama_model} (not installed)
                            </option>
                          )}
                        {models.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                      <ChevronDown
                        size={15}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none"
                      />
                    </div>
                  ) : (
                    <div className="text-[12px] text-zinc-400 dark:text-zinc-500 rounded-lg border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-zinc-900/40 px-3.5 py-2.5">
                      {detecting
                        ? "Detecting installed models…"
                        : ollErr || "No models detected. Click Refresh."}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowUrl((v) => !v)}
                    className="text-[11px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors self-start mt-0.5"
                  >
                    {showUrl ? "− Hide advanced" : "+ Advanced (Ollama URL)"}
                  </button>
                  {showUrl && (
                    <div className="mt-1">
                      <Field
                        label="Ollama URL"
                        value={form.ollama_url}
                        onChange={set("ollama_url")}
                      />
                    </div>
                  )}
                </label>
              </Section>

              {result && (
                <div
                  className={`flex items-start gap-2 text-[13px] rounded-lg px-3 py-2.5 border ${
                    result.ok
                      ? "border-emerald-500/20 bg-emerald-500/5"
                      : "border-rose-500/20 bg-rose-500/5"
                  }`}
                >
                  <span
                    className={`mt-0.5 shrink-0 ${result.ok ? "text-emerald-500" : "text-rose-500"}`}
                  >
                    {result.ok ? (
                      <Check size={14} />
                    ) : (
                      <AlertTriangle size={14} />
                    )}
                  </span>
                  <span className="text-zinc-600 dark:text-zinc-300 leading-relaxed">
                    {result.msg}
                  </span>
                </div>
              )}
            </div>

            {confirmReset ? (
              <div className="px-6 py-4 border-t border-zinc-200 dark:border-white/5 shrink-0 flex items-center gap-3">
                <AlertTriangle size={16} className="text-rose-500 shrink-0" />
                <span className="text-[13px] text-zinc-600 dark:text-zinc-300 flex-1">
                  Disconnect and erase your saved settings?
                </span>
                <button
                  onClick={() => setConfirmReset(false)}
                  className={btnGhost}
                >
                  Cancel
                </button>
                <button
                  onClick={disconnect}
                  disabled={resetting}
                  className={btnDanger}
                >
                  {resetting ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : null}{" "}
                  Disconnect
                </button>
              </div>
            ) : (
              <div className="px-6 py-4 border-t border-zinc-200 dark:border-white/5 shrink-0 flex items-center justify-between">
                <button
                  onClick={() => setConfirmReset(true)}
                  className="inline-flex items-center gap-1.5 text-[13px] text-zinc-400 hover:text-rose-500 transition-colors"
                >
                  <LogOut size={14} /> Disconnect
                </button>
                <div className="flex items-center gap-2">
                  <button onClick={onClose} className={btnGhost}>
                    Cancel
                  </button>
                  <button
                    onClick={save}
                    disabled={saving}
                    className={btnPrimary}
                  >
                    {saving ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : null}
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

function Section({ icon: Icon, title, desc, children }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2.5">
        <div className="w-7 h-7 rounded-md bg-zinc-100 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700/60 flex items-center justify-center shrink-0">
          <Icon size={14} className="text-zinc-500 dark:text-zinc-400" />
        </div>
        <div className="flex flex-col">
          <h3 className="text-[13px] font-semibold leading-tight text-zinc-800 dark:text-zinc-100">
            {title}
          </h3>
          {desc && (
            <span className="text-[11px] text-zinc-400 dark:text-zinc-500 leading-tight">
              {desc}
            </span>
          )}
        </div>
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function Divider() {
  return <div className="h-px bg-zinc-100 dark:bg-white/5" />;
}

function Row({ children }) {
  return <div className="flex gap-3">{children}</div>;
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  grow,
  w,
}) {
  return (
    <label
      className={`flex flex-col gap-1.5 ${grow ? "flex-1" : ""}`}
      style={w ? { flex: `0 0 ${w}` } : undefined}
    >
      <span className="text-[10px] uppercase tracking-widest font-bold text-zinc-400">
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 rounded-lg py-2.5 px-3.5 text-sm outline-none focus:border-zinc-400 dark:focus:border-zinc-500 focus:ring-1 focus:ring-zinc-400/20 transition-all placeholder:text-zinc-400 dark:placeholder:text-zinc-600"
      />
    </label>
  );
}

function Toggle({ checked, onChange, children }) {
  return (
    <label className="flex items-center gap-2.5 text-[13px] text-zinc-600 dark:text-zinc-300 cursor-pointer select-none">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="w-4 h-4 accent-zinc-900 dark:accent-white"
      />
      {children}
    </label>
  );
}

const btnPrimary =
  "inline-flex items-center gap-2 bg-zinc-900 text-white hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200 disabled:opacity-50 text-sm font-medium rounded-lg px-4 py-2 transition-colors";
const btnGhost =
  "inline-flex items-center text-sm font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 rounded-lg px-3 py-2 transition-colors";
const btnDanger =
  "inline-flex items-center gap-1.5 bg-rose-500 text-white hover:bg-rose-600 disabled:opacity-50 text-sm font-medium rounded-lg px-4 py-2 transition-colors";
