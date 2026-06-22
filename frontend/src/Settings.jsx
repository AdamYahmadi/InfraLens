import React, { useState, useEffect } from "react";
import axios from "axios";
import { api } from "./api";
import { Loader2, ServerCog, CheckCircle2, XCircle, Save, X } from "lucide-react";

/**
 * Settings / first-run screen.
 *
 * Props:
 *   onSaved()    - called after a successful save
 *   onClose()    - optional; if provided, shows a close button (settings reopened
 *                  from inside the app rather than first-run)
 */
export default function Settings({ onSaved, onClose }) {
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
  const [health, setHealth] = useState(null);
  const [error, setError] = useState(null);

  // Load any existing config so re-opening Settings is pre-filled.
  useEffect(() => {
    axios.get(api("/api/v1/config"))
      .then(({ data }) => {
        setForm((f) => ({
          ...f,
          pve_host: data.pve_host || "",
          pve_port: data.pve_port || "8006",
          pve_user: data.pve_user || "",
          pve_token_name: data.pve_token_name || "",
          pve_verify_ssl: !!data.pve_verify_ssl,
          ssh_user: data.ssh_user || "root",
          ollama_url: data.ollama_url || "http://127.0.0.1:11434",
          ollama_model: data.ollama_model || "llama3",
        }));
        setTokenSet(!!data.pve_token_value_set);
        setSshSet(!!data.ssh_password_set);
      })
      .catch(() => setError("Could not reach the InfraLens backend. Is it running?"))
      .finally(() => setLoading(false));
  }, []);

  const set = (k) => (e) => {
    const v = e.target.type === "checkbox" ? e.target.checked : e.target.value;
    setForm((f) => ({ ...f, [k]: v }));
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    setHealth(null);
    try {
      // Blank secret fields are omitted server-side, preserving stored secrets.
      const payload = { ...form };
      if (tokenSet && !payload.pve_token_value) delete payload.pve_token_value;
      if (sshSet && !payload.ssh_password) delete payload.ssh_password;

      await axios.post(api("/api/v1/config"), payload);
      const { data } = await axios.get(api("/api/v1/health"));
      setHealth(data);
      if (data.configured && data.proxmox.ok) {
        onSaved?.();
      }
    } catch (e) {
      setError("Save failed. Check that the backend is running and try again.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-300">
        <Loader2 className="animate-spin mr-2" /> Loading settings…
      </div>
    );
  }

  const field = "w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/60";
  const label = "block text-xs font-medium text-slate-400 mb-1";

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-start justify-center py-10 px-4 overflow-auto">
      <div className="w-full max-w-xl">
        <div className="flex items-center gap-3 mb-1">
          <ServerCog className="text-emerald-400" />
          <h1 className="text-xl font-semibold">InfraLens setup</h1>
          {onClose && (
            <button onClick={onClose}
              className="ml-auto text-slate-400 hover:text-slate-200 p-1 rounded-lg hover:bg-slate-800">
              <X size={18} />
            </button>
          )}
        </div>
        <p className="text-sm text-slate-400 mb-6">
          Connect InfraLens to your Proxmox cluster and local Ollama. These
          details are stored only on this machine.
        </p>

        <section className="space-y-4 bg-slate-900/40 border border-slate-800 rounded-2xl p-5 mb-5">
          <h2 className="text-sm font-semibold text-emerald-400">Proxmox API</h2>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className={label}>Host / IP</label>
              <input className={field} placeholder="192.168.1.50" value={form.pve_host} onChange={set("pve_host")} />
            </div>
            <div>
              <label className={label}>Port</label>
              <input className={field} value={form.pve_port} onChange={set("pve_port")} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>API user</label>
              <input className={field} placeholder="root@pam" value={form.pve_user} onChange={set("pve_user")} />
            </div>
            <div>
              <label className={label}>Token name</label>
              <input className={field} placeholder="infralens" value={form.pve_token_name} onChange={set("pve_token_name")} />
            </div>
          </div>
          <div>
            <label className={label}>
              Token value {tokenSet && <span className="text-slate-500">(saved — leave blank to keep)</span>}
            </label>
            <input type="password" className={field}
              placeholder={tokenSet ? "••••••••••••" : "xxxx-xxxx-xxxx-xxxx"}
              value={form.pve_token_value} onChange={set("pve_token_value")} />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input type="checkbox" checked={form.pve_verify_ssl} onChange={set("pve_verify_ssl")} />
            Verify SSL certificate
          </label>
        </section>

        <section className="space-y-4 bg-slate-900/40 border border-slate-800 rounded-2xl p-5 mb-5">
          <h2 className="text-sm font-semibold text-emerald-400">SSH probe (optional)</h2>
          <p className="text-xs text-slate-500 -mt-2">Used to detect services running inside LXC containers.</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>SSH user</label>
              <input className={field} value={form.ssh_user} onChange={set("ssh_user")} />
            </div>
            <div>
              <label className={label}>
                SSH password {sshSet && <span className="text-slate-500">(saved)</span>}
              </label>
              <input type="password" className={field}
                placeholder={sshSet ? "••••••••" : ""}
                value={form.ssh_password} onChange={set("ssh_password")} />
            </div>
          </div>
        </section>

        <section className="space-y-4 bg-slate-900/40 border border-slate-800 rounded-2xl p-5 mb-5">
          <h2 className="text-sm font-semibold text-emerald-400">Ollama (AI diagnostics)</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>Ollama URL</label>
              <input className={field} value={form.ollama_url} onChange={set("ollama_url")} />
            </div>
            <div>
              <label className={label}>Model</label>
              <input className={field} value={form.ollama_model} onChange={set("ollama_model")} />
            </div>
          </div>
        </section>

        {error && (
          <div className="flex items-center gap-2 text-sm text-rose-400 mb-4">
            <XCircle size={16} /> {error}
          </div>
        )}

        {health && (
          <div className="space-y-2 mb-4 text-sm">
            <HealthRow label="Proxmox" ok={health.proxmox.ok} detail={health.proxmox.detail} />
            <HealthRow label="Ollama" ok={health.ollama.ok} detail={health.ollama.detail} />
          </div>
        )}

        <button onClick={save} disabled={saving}
          className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white font-medium rounded-xl py-3 transition">
          {saving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
          {saving ? "Testing connection…" : "Save & connect"}
        </button>
      </div>
    </div>
  );
}

function HealthRow({ label, ok, detail }) {
  return (
    <div className="flex items-start gap-2">
      {ok ? <CheckCircle2 className="text-emerald-400 mt-0.5" size={16} />
          : <XCircle className="text-rose-400 mt-0.5" size={16} />}
      <span className="text-slate-300"><b>{label}:</b> {detail}</span>
    </div>
  );
}
