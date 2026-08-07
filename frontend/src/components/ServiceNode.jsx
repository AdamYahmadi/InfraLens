import React from "react";
import { Handle, Position } from "@xyflow/react";
import {
  Server,
  ShieldCheck,
  HardDrive,
  Globe,
  Activity,
  LayoutTemplate,
  Database,
} from "lucide-react";

const iconMap = {
  dns: ShieldCheck,
  security: ShieldCheck,
  storage: HardDrive,
  network: Globe,
  dashboard: Activity,
  docker: LayoutTemplate,
  database: Database,
  host: Server,
};

const SERVICE_COLORS = {
  dns: "#10b981",
  security: "#10b981",
  storage: "#0ea5e9",
  network: "#8b5cf6",
  dashboard: "#f43f5e",
  docker: "#06b6d4",
  database: "#f59e0b",
  host: "#71717a",
};

const serviceKey = (tags, label) => {
  const t = (tags || []).map((x) => (x || "").toLowerCase());
  for (const tag of t) if (SERVICE_COLORS[tag]) return tag;
  const l = (label || "").toLowerCase();
  if (l.includes("pihole") || l.includes("adguard") || l.includes("dns"))
    return "dns";
  if (
    l.includes("cloud") ||
    l.includes("nas") ||
    l.includes("storage") ||
    l.includes("smb")
  )
    return "storage";
  if (
    l.includes("vpn") ||
    l.includes("tailscale") ||
    l.includes("wireguard") ||
    l.includes("proxy")
  )
    return "network";
  if (l.includes("dash") || l.includes("home") || l.includes("monitor"))
    return "dashboard";
  if (
    l.includes("db") ||
    l.includes("sql") ||
    l.includes("redis") ||
    l.includes("mongo")
  )
    return "database";
  if (l.includes("docker") || l.includes("container")) return "docker";
  return "host";
};

const getIconComp = (tags, label) => {
  if (tags && tags.length > 0) {
    for (let tag of tags) {
      const t = tag.toLowerCase();
      if (iconMap[t]) return iconMap[t];
    }
  }
  const l = (label || "").toLowerCase();
  if (l.includes("pihole") || l.includes("adguard") || l.includes("dns"))
    return iconMap.dns;
  if (
    l.includes("cloud") ||
    l.includes("nas") ||
    l.includes("storage") ||
    l.includes("smb")
  )
    return iconMap.storage;
  if (
    l.includes("vpn") ||
    l.includes("tailscale") ||
    l.includes("wireguard") ||
    l.includes("proxy")
  )
    return iconMap.network;
  if (l.includes("dash") || l.includes("home") || l.includes("monitor"))
    return iconMap.dashboard;
  if (
    l.includes("db") ||
    l.includes("sql") ||
    l.includes("redis") ||
    l.includes("mongo")
  )
    return iconMap.database;
  if (
    l.includes("pve") ||
    l.includes("proxmox") ||
    l.includes("node") ||
    l.includes("host")
  )
    return iconMap.host;
  return Server;
};

const getKind = (data) => {
  const os = (data?.os || "").toUpperCase();
  const tags = (data?.tags || []).map((t) => (t || "").toLowerCase());
  if (os.includes("PROXMOX") || os.includes("HOST") || tags.includes("host"))
    return "HOST";
  if (
    os.includes("LXC") ||
    tags.includes("lxc") ||
    tags.includes("container") ||
    tags.includes("docker")
  )
    return "CT";
  return "VM";
};

export default function ServiceNode({ data, selected }) {
  const isOnline =
    data.status?.toLowerCase() === "running" ||
    data.status?.toLowerCase() === "online";
  const kind = getKind(data);
  const isHost = kind === "HOST";
  const Icon = isHost ? Server : getIconComp(data.tags, data.label);
  const color = SERVICE_COLORS[serviceKey(data.tags, data.label)] || "#71717a";

  let tileClass,
    tileStyle = {},
    iconStyle = {};
  if (selected || isHost) {
    tileClass =
      "bg-zinc-900 dark:bg-zinc-100 border-zinc-900 dark:border-zinc-100 text-white dark:text-zinc-900";
  } else if (!isOnline) {
    tileClass =
      "bg-zinc-50 dark:bg-zinc-900/50 border-zinc-200 dark:border-zinc-700/60 text-zinc-400 dark:text-zinc-600";
  } else {
    tileClass = "";
    tileStyle = { backgroundColor: `${color}1A`, borderColor: `${color}33` };
    iconStyle = { color };
  }

  return (
    <div
      className={`relative min-w-[184px] rounded-lg border transition-all duration-150 overflow-hidden
        ${
          selected
            ? "border-zinc-900 dark:border-zinc-100 bg-white dark:bg-zinc-800 ring-1 ring-zinc-900/20 dark:ring-zinc-100/20 shadow-sm"
            : isHost
              ? "border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800/60 hover:border-zinc-400 dark:hover:border-zinc-500 shadow-sm"
              : "border-zinc-200 dark:border-zinc-700/60 bg-white dark:bg-zinc-800/50 hover:border-zinc-300 dark:hover:border-zinc-600"
        }`}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!opacity-0 !w-0 !h-0 !min-w-0 !min-h-0 !border-0"
      />

      {isHost && (
        <div className="absolute left-0 top-0 bottom-0 w-1 bg-zinc-900 dark:bg-zinc-100" />
      )}

      <div
        className={`flex items-center gap-2.5 py-2.5 pr-3 ${isHost ? "pl-4" : "pl-3"}`}
      >
        <div
          className={`shrink-0 rounded-md p-1.5 border ${tileClass}`}
          style={tileStyle}
        >
          <Icon size={15} style={iconStyle} />
        </div>

        <div className="flex flex-col min-w-0 flex-1">
          <div
            className={`text-[13px] leading-tight truncate text-zinc-800 dark:text-zinc-100 ${isHost ? "font-bold" : "font-semibold"}`}
          >
            {data.label}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span
              className={`h-1.5 w-1.5 rounded-full ${isOnline ? "bg-emerald-500" : "bg-red-500"}`}
            />
            <span className="text-[10px] font-medium text-zinc-500 dark:text-zinc-400 capitalize leading-none">
              {data.status || "Unknown"}
            </span>
          </div>
        </div>

        <div className="shrink-0 pl-2 border-l border-zinc-100 dark:border-zinc-700/60">
          <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 font-mono">
            {kind}
          </span>
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="!opacity-0 !w-0 !h-0 !min-w-0 !min-h-0 !border-0"
      />
    </div>
  );
}
