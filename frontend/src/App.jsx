import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  ControlButton,
  useNodesState,
  useEdgesState,
  ReactFlowProvider,
  useReactFlow,
} from "@xyflow/react";
import dagre from "@dagrejs/dagre";
import axios from "axios";
import { API_BASE } from "./api";
import "@xyflow/react/dist/style.css";
import ServiceNode from "./components/ServiceNode";
import Logo from "./components/Logo";
import {
  Send,
  Loader2,
  Network,
  Clock,
  Sun,
  Moon,
  Layout,
  LayoutTemplate,
  Settings,
  PanelRightClose,
  Server,
  Container,
  Cpu,
  MessageCircleDashed,
  Play,
  Power,
  RotateCw,
  Square,
  ChevronDown,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const nodeTypes = { service: ServiceNode };

const getLayoutedElements = (nodes, edges, direction = "LR") => {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({ rankdir: direction, ranksep: 160, nodesep: 40 });
  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: 180, height: 50 });
  });
  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });
  dagre.layout(dagreGraph);
  return nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    const xPos = nodeWithPosition ? nodeWithPosition.x - 90 : 0;
    const yPos = nodeWithPosition ? nodeWithPosition.y - 25 : 0;
    return {
      ...node,
      targetPosition: "left",
      sourcePosition: "right",
      position: { x: xPos, y: yPos },
    };
  });
};

const pctToNumber = (usageString) => {
  if (!usageString || usageString === "N/A") return 0;
  const parts = usageString.split(" / ");
  const toBytes = (s) => {
    const m = String(s)
      .trim()
      .match(/([\d.]+)\s*(B|KB|MB|GB|TB|PB)?/i);
    if (!m) return 0;
    const n = parseFloat(m[1]);
    const unit = (m[2] || "B").toUpperCase();
    const mult =
      { B: 1, KB: 1e3, MB: 1e6, GB: 1e9, TB: 1e12, PB: 1e15 }[unit] || 1;
    return n * mult;
  };
  if (parts.length < 2) {
    const single = parseFloat(usageString);
    return isNaN(single) ? 0 : Math.min(100, Math.max(0, single));
  }
  const used = toBytes(parts[0]);
  const total = toBytes(parts[1]);
  if (total === 0) return 0;
  return Math.min(100, Math.round((used / total) * 100));
};

const isNodeOnline = (n) => {
  const s = (n?.data?.status || "").toLowerCase();
  return s === "running" || s === "online";
};

const relTime = (epochSec) => {
  if (!epochSec) return "";
  const diff = Math.floor(Date.now() / 1000) - epochSec;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
};

const nodeKind = (n) => {
  const os = (n?.data?.os || "").toUpperCase();
  const tags = (n?.data?.tags || []).map((t) => t.toLowerCase());
  const label = (n?.data?.label || "").toLowerCase();
  if (
    os.includes("LXC") ||
    tags.includes("lxc") ||
    tags.includes("container") ||
    tags.includes("docker")
  )
    return "container";
  if (
    label.includes("pve") ||
    label.includes("proxmox") ||
    label.includes("host") ||
    tags.includes("host")
  )
    return "host";
  return "vm";
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

const OFFLINE_COLOR_DARK = "#3f3f46";
const OFFLINE_COLOR_LIGHT = "#d4d4d8";

const serviceKey = (n) => {
  const tags = (n?.data?.tags || []).map((t) => t.toLowerCase());
  for (const t of tags) if (SERVICE_COLORS[t]) return t;
  const l = (n?.data?.label || "").toLowerCase();
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
  if (
    l.includes("pve") ||
    l.includes("proxmox") ||
    l.includes("host") ||
    l.includes("node")
  )
    return "host";
  return "host";
};

const styleEdge = (edge, rawNodes, dark) => {
  const target = rawNodes.find((n) => n.id === edge.target);
  const online = isNodeOnline(target);
  if (!online) {
    return {
      ...edge,
      animated: false,
      className: "edge-offline",
      style: {
        strokeWidth: 1.5,
        opacity: dark ? 0.4 : 0.5,
        stroke: dark ? OFFLINE_COLOR_DARK : OFFLINE_COLOR_LIGHT,
      },
      labelStyle: {
        fill: dark ? "#a1a1aa" : "#52525b",
        fontSize: 9,
        fontWeight: 600,
      },
      labelBgStyle: {
        fill: dark ? "#18181b" : "#ffffff",
        stroke: dark ? "#27272a" : "#e4e4e7",
      },
    };
  }
  const c = SERVICE_COLORS[serviceKey(target)] || "#71717a";
  return {
    ...edge,
    animated: true,
    className: "",
    style: { strokeWidth: 1.5, opacity: dark ? 0.85 : 0.9, stroke: c },
    labelStyle: {
      fill: dark ? "#a1a1aa" : "#52525b",
      fontSize: 9,
      fontWeight: 600,
    },
    labelBgStyle: {
      fill: dark ? "#18181b" : "#ffffff",
      stroke: dark ? "#27272a" : "#e4e4e7",
    },
  };
};

const SERVICE_LEGEND = [
  ["dns", "DNS / Security"],
  ["storage", "Storage"],
  ["network", "Network"],
  ["database", "Database"],
  ["dashboard", "Dashboard"],
  ["docker", "Container"],
];

function Meter({ label, value, sub }) {
  const v = Math.max(0, Math.min(100, value));
  const barColor =
    v >= 90
      ? "bg-red-500"
      : v >= 75
        ? "bg-amber-500"
        : "bg-zinc-800 dark:bg-zinc-200";
  return (
    <div className="py-2.5">
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
          {label}
        </span>
        <div className="flex items-baseline gap-2">
          {sub && (
            <span className="text-[10px] font-mono text-zinc-400 dark:text-zinc-500">
              {sub}
            </span>
          )}
          <span className="text-xs font-mono font-semibold text-zinc-700 dark:text-zinc-200 tabular-nums">
            {v}%
          </span>
        </div>
      </div>
      <div className="w-full h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-sm overflow-hidden">
        <div
          className={`h-full rounded-sm transition-all duration-700 ${barColor}`}
          style={{ width: `${v}%` }}
        />
      </div>
    </div>
  );
}

function Sparkline({ data = [], color = "currentColor", height = 28 }) {
  const pts = (data || []).filter(
    (v) => v !== null && v !== undefined && !isNaN(v),
  );
  if (pts.length < 2) {
    return (
      <div className="h-7 flex items-center text-[10px] text-zinc-400 dark:text-zinc-600">
        No history
      </div>
    );
  }
  const w = 200,
    h = height,
    pad = 2;
  const min = Math.min(...pts),
    max = Math.max(...pts);
  const range = max - min || 1;
  const step = (w - pad * 2) / (pts.length - 1);
  const path = pts
    .map((v, i) => {
      const x = pad + i * step;
      const y = pad + (h - pad * 2) * (1 - (v - min) / range);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const areaPath = `${path} L${(pad + (pts.length - 1) * step).toFixed(1)},${h - pad} L${pad},${h - pad} Z`;
  const last = pts[pts.length - 1];
  const avg = pts.reduce((a, b) => a + b, 0) / pts.length;
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-[9px] font-mono text-zinc-400 dark:text-zinc-500">
          avg {Math.round(avg)}%
        </span>
        <span className="text-[11px] font-mono font-semibold text-zinc-700 dark:text-zinc-200">
          {Math.round(last)}%
        </span>
      </div>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        className="w-full"
        style={{ height }}
      >
        <path d={areaPath} fill={color} opacity="0.08" />
        <path
          d={path}
          fill="none"
          stroke={color}
          strokeWidth="1.5"
          vectorEffect="non-scaling-stroke"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}

function PowerControls({
  node,
  apiBase,
  onFired,
  pendingInfo,
  onSetPending,
  onClearPending,
}) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(null);
  const [error, setError] = useState(null);

  const s = (node?.data?.status || "").toLowerCase();
  const running = s === "running" || s === "online";

  const pending = pendingInfo?.action || null;
  const pendingSince = pendingInfo?.since || 0;

  useEffect(() => {
    if (!pending) return;
    const elapsed = Date.now() - pendingSince;

    let settled = false;
    if (pending === "start") settled = running;
    else if (pending === "stop" || pending === "shutdown") settled = !running;
    else if (pending === "reboot") settled = elapsed > 20000;

    const timedOut = elapsed > 60000;

    if (settled || timedOut) {
      onClearPending();
      return;
    }

    const t = setTimeout(() => setError((prev) => prev), 3000);
    return () => clearTimeout(t);
  }, [pending, running, pendingSince, onClearPending]);

  const fire = async (action) => {
    setOpen(false);
    setConfirming(null);
    setError(null);
    onSetPending(action);
    try {
      await axios.post(`${apiBase}/api/v1/nodes/${node.id}/action`, { action });
      if (onFired) onFired();
    } catch (e) {
      const raw = e?.response?.data?.detail || "";
      let detail;
      if (
        e?.response?.status === 403 ||
        /permission|forbidden|privilege/i.test(raw)
      ) {
        detail =
          "Not permitted. Your API token needs VM.PowerMgmt (role PVEVMAdmin) to control guests.";
      } else if (raw) {
        detail = raw;
      } else {
        detail = "Action failed. Check the connection and try again.";
      }
      setError(detail);
      onClearPending();
    }
  };

  const handle = (action, destructive) => {
    if (pending) return;
    if (destructive && confirming !== action) {
      setConfirming(action);
      return;
    }
    fire(action);
  };

  const busy = !!pending;
  const busyLabel =
    {
      start: "Starting…",
      stop: "Stopping…",
      reboot: "Rebooting…",
      shutdown: "Shutting down…",
    }[pending] || "Working…";
  const btnBase =
    "flex items-center justify-center gap-1.5 text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed";

  return (
    <div className="mb-5">
      <div className="text-[9px] font-bold uppercase tracking-wider text-zinc-400 mb-2">
        Power
      </div>
      <div className="relative flex">
        {running ? (
          <>
            <button
              disabled={busy}
              onClick={() => handle("shutdown", true)}
              className={`${btnBase} flex-1 px-3 py-2 rounded-l-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 ${confirming === "shutdown" ? "!bg-red-500 !text-white !border-red-500" : ""}`}
            >
              {busy ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Power size={14} />
              )}
              {busy
                ? busyLabel
                : confirming === "shutdown"
                  ? "Confirm shutdown?"
                  : "Shutdown"}
            </button>
            <button
              disabled={busy}
              onClick={() => setOpen((o) => !o)}
              className={`${btnBase} px-2 py-2 rounded-r-lg border border-l-0 border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-700 text-zinc-500`}
            >
              <ChevronDown size={14} />
            </button>
            {open && !busy && (
              <div className="absolute top-full right-0 mt-1 w-40 z-40 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 shadow-lg overflow-hidden">
                <button
                  onClick={() => handle("reboot", true)}
                  className={`w-full ${btnBase} justify-start px-3 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 ${confirming === "reboot" ? "!bg-amber-500 !text-white" : ""}`}
                >
                  <RotateCw size={14} />{" "}
                  {confirming === "reboot" ? "Confirm reboot?" : "Reboot"}
                </button>
                <button
                  onClick={() => handle("stop", true)}
                  className={`w-full ${btnBase} justify-start px-3 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-700 text-red-600 dark:text-red-400 ${confirming === "stop" ? "!bg-red-500 !text-white" : ""}`}
                >
                  <Square size={13} />{" "}
                  {confirming === "stop" ? "Confirm stop?" : "Stop (force)"}
                </button>
              </div>
            )}
          </>
        ) : (
          <button
            disabled={busy}
            onClick={() => handle("start", false)}
            className={`${btnBase} flex-1 px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200`}
          >
            {busy ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Play size={14} />
            )}
            {busy ? busyLabel : "Start"}
          </button>
        )}
      </div>
      {error && <div className="mt-2 text-[11px] text-red-500">{error}</div>}
    </div>
  );
}

function FlowWithProvider({ onOpenSettings }) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pendingActions, setPendingActions] = useState({});
  const [rrd, setRrd] = useState({ series: {} });
  const [tasks, setTasks] = useState([]);
  const [timeframe, setTimeframe] = useState("hour");
  const [ollamaOnline, setOllamaOnline] = useState(true);
  const { fitView } = useReactFlow();

  const [isDarkMode, setIsDarkMode] = useState(() => {
    try {
      const saved = localStorage.getItem("infralens-theme");
      if (saved) return saved === "dark";
    } catch (_) {}
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });
  const isDarkModeRef = useRef(isDarkMode);

  const [chatOpen, setChatOpen] = useState(true);

  const chatInputRef = useRef(null);
  const chatScrollRef = useRef(null);
  const nodesRef = useRef([]);

  const setNodePending = (nodeId, action) => {
    setPendingActions((prev) => ({
      ...prev,
      [nodeId]: { action, since: Date.now() },
    }));
  };
  const clearNodePending = (nodeId) => {
    setPendingActions((prev) => {
      const next = { ...prev };
      delete next[nodeId];
      return next;
    });
  };

  const [chatInput, setChatInput] = useState("");
  const [chatHistory, setChatHistory] = useState([
    {
      role: "assistant",
      content: "Assistant ready. Ask me about your infrastructure.",
    },
  ]);
  const [isThinking, setIsThinking] = useState(false);

  useEffect(() => {
    isDarkModeRef.current = isDarkMode;
    if (isDarkMode) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("infralens-theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("infralens-theme", "light");
    }
  }, [isDarkMode]);

  useEffect(() => {
    setEdges((eds) =>
      eds.map((edge) => styleEdge(edge, nodesRef.current, isDarkMode)),
    );
  }, [isDarkMode, setEdges]);

  useEffect(() => {
    let mounted = true;
    const checkOllama = async () => {
      try {
        const { data } = await axios.get(`${API_BASE}/api/v1/health`, {
          timeout: 8000,
        });
        if (mounted) setOllamaOnline(!!data?.ollama?.ok);
      } catch {
        if (mounted) setOllamaOnline(false);
      }
    };
    checkOllama();
    const id = setInterval(checkOllama, 15000);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    const loadTasks = async () => {
      try {
        const { data } = await axios.get(`${API_BASE}/api/v1/tasks`, {
          params: { limit: 12 },
          timeout: 10000,
        });
        if (mounted) setTasks(data?.tasks || []);
      } catch {
        if (mounted) setTasks([]);
      }
    };
    loadTasks();
    const id = setInterval(loadTasks, 15000);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    if (!selectedNodeId) {
      setRrd({ series: {} });
      return;
    }
    let cancelled = false;
    axios
      .get(`${API_BASE}/api/v1/nodes/${selectedNodeId}/rrd`, {
        params: { timeframe },
        timeout: 12000,
      })
      .then(({ data }) => {
        if (!cancelled) setRrd(data || { series: {} });
      })
      .catch(() => {
        if (!cancelled) setRrd({ series: {} });
      });
    return () => {
      cancelled = true;
    };
  }, [selectedNodeId, timeframe]);

  const fetchInfra = useCallback(async () => {
    if (nodesRef.current.length === 0) setLoading(true);
    try {
      const response = await axios.get(`${API_BASE}/api/v1/infrastructure`);
      const rawNodes = response.data.nodes || [];
      const rawEdges = response.data.edges || [];
      const currentDark = isDarkModeRef.current;
      const enhancedEdges = rawEdges.map((edge) =>
        styleEdge(edge, rawNodes, currentDark),
      );
      setNodes((currentNodes) => {
        if (currentNodes.length === 0 && rawNodes.length > 0)
          return getLayoutedElements(rawNodes, enhancedEdges);
        return currentNodes.map((oldNode) => {
          const incomingNode = rawNodes.find((n) => n.id === oldNode.id);
          return incomingNode
            ? { ...oldNode, data: incomingNode.data }
            : oldNode;
        });
      });
      setEdges(enhancedEdges);
      nodesRef.current = rawNodes;
      if (nodesRef.current.length === 0 && rawNodes.length > 0) {
        setTimeout(() => fitView({ padding: 0.2, duration: 800 }), 100);
      }
    } catch (error) {
      console.error("Fetch Error:", error);
    } finally {
      setTimeout(() => setLoading(false), 500);
    }
  }, [setNodes, setEdges, fitView]);

  useEffect(() => {
    let isMounted = true;
    const pollBackend = async () => {
      if (!isMounted) return;
      await fetchInfra();
      setTimeout(pollBackend, 5000);
    };
    pollBackend();
    return () => {
      isMounted = false;
    };
  }, [fetchInfra]);

  useEffect(() => {
    if (ollamaOnline) chatInputRef.current?.focus();
  }, [ollamaOnline]);

  useEffect(() => {
    if (chatScrollRef.current)
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
  }, [chatHistory, isThinking]);

  const handleReorder = () => {
    if (nodesRef.current.length === 0) return;
    setNodes(getLayoutedElements(nodesRef.current, edges));
    setTimeout(() => fitView({ padding: 0.2, duration: 800 }), 50);
  };

  const handleChatSubmit = async (e) => {
    e.preventDefault();
    if (!chatInput.trim() || !ollamaOnline) return;
    const userMsg = { role: "user", content: chatInput };
    const cleanContext = nodesRef.current.map((n) => ({
      id: n.id,
      data: n.data,
    }));
    setChatHistory((prev) => [...prev, userMsg]);
    setChatInput("");
    setIsThinking(true);
    setTimeout(() => chatInputRef.current?.focus(), 10);
    try {
      const response = await axios.post(`${API_BASE}/api/v1/chat`, {
        prompt: userMsg.content,
        context: cleanContext,
        history: chatHistory.map((msg) => ({
          role: msg.role,
          content: msg.content,
        })),
      });
      setChatHistory((prev) => [
        ...prev,
        { role: "assistant", content: response.data.reply },
      ]);
    } catch {
      setChatHistory((prev) => [
        ...prev,
        { role: "assistant", content: "Connection interrupted." },
      ]);
    } finally {
      setIsThinking(false);
      setTimeout(() => chatInputRef.current?.focus(), 50);
    }
  };

  const selectedNode = nodes.find((n) => n.id === selectedNodeId);

  const allNodes = nodes.length ? nodes : [];
  const onlineCount = allNodes.filter(isNodeOnline).length;
  const totalCount = allNodes.length;
  const offlineCount = totalCount - onlineCount;
  const hostCount = allNodes.filter((n) => nodeKind(n) === "host").length;
  const vmCount = allNodes.filter((n) => nodeKind(n) === "vm").length;
  const containerCount = allNodes.filter(
    (n) => nodeKind(n) === "container",
  ).length;
  const avgCpu = totalCount
    ? Math.round(
        allNodes.reduce((a, n) => a + pctToNumber(n.data?.cpu), 0) / totalCount,
      )
    : 0;
  const avgRam = totalCount
    ? Math.round(
        allNodes.reduce((a, n) => a + pctToNumber(n.data?.ram), 0) / totalCount,
      )
    : 0;
  const attentionNodes = allNodes.filter((n) => {
    if (!isNodeOnline(n)) return true;
    return pctToNumber(n.data?.cpu) >= 85 || pctToNumber(n.data?.ram) >= 85;
  });
  const attentionIds = new Set(attentionNodes.map((n) => n.id));
  const runningGuests = allNodes.filter(
    (n) => nodeKind(n) !== "host" && isNodeOnline(n),
  ).length;
  const serviceCount = allNodes.reduce(
    (a, n) => a + (n.data?.sub_services?.length || 0),
    0,
  );
  const listNodes = allNodes.filter((n) => !attentionIds.has(n.id));

  const selectNode = (id) => {
    setSelectedNodeId(id);
    setTimeout(
      () => fitView({ nodes: [{ id }], padding: 0.5, duration: 500 }),
      10,
    );
  };

  const InfoRow = ({ icon: Icon, label, value }) => (
    <div className="flex items-center justify-between py-2 border-b border-zinc-100 dark:border-zinc-800 last:border-0">
      <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400">
        <Icon size={13} />
        <span className="text-xs">{label}</span>
      </div>
      <span className="text-xs font-mono text-zinc-700 dark:text-zinc-200">
        {value}
      </span>
    </div>
  );

  const StatCell = ({ label, value, valueClass = "" }) => (
    <div className="flex flex-col gap-1 px-3 py-2.5">
      <span className="text-[9px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 leading-none">
        {label}
      </span>
      <span
        className={`text-lg font-mono font-semibold leading-none ${valueClass || "text-zinc-800 dark:text-zinc-100"}`}
      >
        {value}
      </span>
    </div>
  );

  return (
    <div className="flex h-screen w-screen bg-zinc-50 dark:bg-[#0a0a0b] overflow-hidden text-zinc-800 dark:text-zinc-200 font-sans transition-colors duration-200">
      {loading && (
        <div className="absolute inset-0 z-[100] flex flex-col items-center justify-center gap-6 bg-zinc-50 dark:bg-[#0a0a0b] transition-opacity duration-500">
          <div className="il-breathe">
            <Logo size={44} className="text-zinc-900 dark:text-zinc-100" />
          </div>
          <div className="relative h-px w-28 overflow-hidden bg-zinc-200 dark:bg-zinc-800">
            <div className="il-sweep absolute inset-y-0 w-1/2 bg-zinc-900 dark:bg-zinc-100" />
          </div>
        </div>
      )}

      {}
      <aside className="w-[340px] bg-white dark:bg-[#0d0d0f] flex flex-col border-r border-zinc-200 dark:border-zinc-800/80 shrink-0 z-20">
        <div className="px-4 h-14 border-b border-zinc-200 dark:border-zinc-800/80 flex items-center gap-2.5 shrink-0">
          <div className="w-7 h-7 rounded-md bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 flex items-center justify-center shrink-0">
            <Logo size={15} className="text-zinc-900 dark:text-white" />
          </div>
          <span className="font-semibold tracking-tight text-sm text-zinc-800 dark:text-zinc-100">
            InfraLens
          </span>
          <div className="ml-auto flex items-center gap-0.5">
            <button
              onClick={onOpenSettings}
              title="Settings"
              className="p-1.5 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 transition-colors"
            >
              <Settings size={15} />
            </button>
            <button
              onClick={() => setIsDarkMode(!isDarkMode)}
              title="Toggle theme"
              className="p-1.5 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 transition-colors"
            >
              {isDarkMode ? <Sun size={15} /> : <Moon size={15} />}
            </button>
          </div>
        </div>

        {!selectedNode ? (
          <div className="flex flex-col flex-grow overflow-hidden">
            <div className="px-4 pt-4 pb-2 shrink-0">
              <div className="text-[9px] font-bold uppercase tracking-wider text-zinc-400 mb-2">
                Cluster Overview
              </div>
              <div className="grid grid-cols-2 rounded-lg border border-zinc-200 dark:border-zinc-800 divide-x divide-y divide-zinc-200 dark:divide-zinc-800 overflow-hidden">
                <StatCell label="Total Nodes" value={totalCount} />
                <StatCell
                  label="Online"
                  value={`${onlineCount}/${totalCount}`}
                  valueClass="text-emerald-600 dark:text-emerald-500"
                />
                <StatCell label="Guests Running" value={runningGuests} />
                <StatCell label="Services" value={serviceCount} />
              </div>
              <div className="flex items-center gap-4 mt-3 px-1">
                <div className="flex items-center gap-1.5 text-zinc-500 dark:text-zinc-400">
                  <Server size={12} />
                  <span className="text-[11px] font-mono">
                    {hostCount} host
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-zinc-500 dark:text-zinc-400">
                  <Cpu size={12} />
                  <span className="text-[11px] font-mono">{vmCount} vm</span>
                </div>
                <div className="flex items-center gap-1.5 text-zinc-500 dark:text-zinc-400">
                  <Container size={12} />
                  <span className="text-[11px] font-mono">
                    {containerCount} ct
                  </span>
                </div>
                {offlineCount > 0 && (
                  <div className="flex items-center gap-1.5 text-red-500 ml-auto">
                    <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                    <span className="text-[11px] font-mono">
                      {offlineCount} down
                    </span>
                  </div>
                )}
              </div>

              {}
              <div className="mt-4 px-1">
                <Meter label="Cluster CPU" value={avgCpu} />
                <Meter label="Cluster Memory" value={avgRam} />
              </div>

              {}
              {attentionNodes.length > 0 && (
                <div className="mt-3">
                  <div className="text-[9px] font-bold uppercase tracking-wider text-zinc-400 mb-2">
                    Attention
                  </div>
                  <div className="space-y-1">
                    {attentionNodes.map((n) => {
                      const offline = !isNodeOnline(n);
                      const cpu = pctToNumber(n.data?.cpu);
                      const ram = pctToNumber(n.data?.ram);
                      const reason = offline
                        ? "offline"
                        : cpu >= 85 && ram >= 85
                          ? `CPU ${cpu}% · RAM ${ram}%`
                          : cpu >= 85
                            ? `CPU ${cpu}%`
                            : `RAM ${ram}%`;
                      const tone =
                        offline || cpu >= 90 || ram >= 90 ? "red" : "amber";
                      return (
                        <button
                          key={n.id}
                          onClick={() => selectNode(n.id)}
                          className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-lg border text-left transition-colors hover:opacity-80 ${
                            tone === "red"
                              ? "border-red-500/20 bg-red-500/5"
                              : "border-amber-500/20 bg-amber-500/5"
                          }`}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full shrink-0 ${tone === "red" ? "bg-red-500" : "bg-amber-500"}`}
                          />
                          <span className="text-[11px] font-medium text-zinc-700 dark:text-zinc-200 truncate flex-1">
                            {n.data?.label}
                          </span>
                          <span
                            className={`text-[10px] font-mono shrink-0 ${tone === "red" ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400"}`}
                          >
                            {reason}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {}
              {tasks.length > 0 && (
                <div className="mt-4">
                  <div className="text-[9px] font-bold uppercase tracking-wider text-zinc-400 mb-2">
                    Recent Activity
                  </div>
                  <div className="space-y-0.5">
                    {tasks.slice(0, 6).map((t, i) => {
                      const Icon =
                        t.state === "ok"
                          ? CheckCircle2
                          : t.state === "error"
                            ? XCircle
                            : Loader2;
                      const dot =
                        t.state === "ok"
                          ? "text-emerald-500"
                          : t.state === "error"
                            ? "text-red-500"
                            : "text-amber-500";
                      return (
                        <div
                          key={t.id || i}
                          className="flex items-center gap-2 px-2 py-1.5 rounded-md"
                        >
                          <Icon
                            size={12}
                            className={`${dot} shrink-0 ${t.state === "running" ? "animate-spin" : ""}`}
                          />
                          <span className="text-[11px] text-zinc-700 dark:text-zinc-300 truncate flex-1">
                            {t.label}
                            {t.guest ? (
                              <span className="text-zinc-400 dark:text-zinc-500 font-mono">
                                {" "}
                                {t.guest}
                              </span>
                            ) : (
                              ""
                            )}
                          </span>
                          <span className="text-[10px] font-mono text-zinc-400 dark:text-zinc-500 shrink-0">
                            {relTime(t.starttime)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className="px-4 pt-3 pb-1 shrink-0">
              <div className="text-[9px] font-bold uppercase tracking-wider text-zinc-400">
                Nodes ({listNodes.length})
              </div>
            </div>
            <div className="flex-grow overflow-y-auto custom-scrollbar px-2 pb-3">
              {allNodes.length === 0 ? (
                <div className="h-full flex items-center justify-center text-center px-6">
                  <p className="text-xs text-zinc-400 dark:text-zinc-600">
                    Discovering nodes...
                  </p>
                </div>
              ) : (
                listNodes.map((n) => {
                  const online = isNodeOnline(n);
                  return (
                    <button
                      key={n.id}
                      onClick={() => selectNode(n.id)}
                      className="w-full flex items-center gap-2.5 px-2 py-2 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800/60 transition-colors text-left"
                    >
                      <span
                        className={`h-2 w-2 rounded-full shrink-0 ${online ? "bg-emerald-500" : "bg-red-500"}`}
                      />
                      <span className="text-[13px] font-medium text-zinc-700 dark:text-zinc-200 truncate flex-1">
                        {n.data?.label}
                      </span>
                      <span className="text-[10px] font-mono text-zinc-400 dark:text-zinc-500 tabular-nums">
                        {n.data?.cpu || ""}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col flex-grow overflow-hidden">
            <div className="flex-grow overflow-y-auto custom-scrollbar p-4">
              <div className="mb-5">
                <div className="flex items-center gap-2 mb-1.5">
                  <h2 className="text-base font-semibold text-zinc-800 dark:text-zinc-100">
                    {selectedNode.data.label}
                  </h2>
                  <span
                    className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${isNodeOnline(selectedNode) ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-500" : "bg-red-500/10 text-red-600 dark:text-red-500"}`}
                  >
                    {selectedNode.data.status}
                  </span>
                </div>
                <p className="text-[10px] font-mono text-zinc-400 dark:text-zinc-500 uppercase tracking-wide">
                  ID: {selectedNode.id} · {nodeKind(selectedNode).toUpperCase()}
                </p>
              </div>

              <div className="mb-5 px-4 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-800">
                <div className="text-[9px] font-bold uppercase tracking-wider text-zinc-400 pt-2 pb-0.5">
                  Resource Usage
                </div>
                <Meter label="CPU" value={pctToNumber(selectedNode.data.cpu)} />
                <Meter
                  label="Memory"
                  value={pctToNumber(selectedNode.data.ram)}
                  sub={selectedNode.data.ram}
                />
                <Meter
                  label="Disk"
                  value={pctToNumber(selectedNode.data.disk)}
                  sub={selectedNode.data.disk}
                />
              </div>

              {(() => {
                const rx = selectedNode.data.rx_speed;
                const tx = selectedNode.data.tx_speed;
                const has = (v) => v && v !== "N/A" && v !== "0 B/s";
                return has(rx) || has(tx);
              })() && (
                <div className="mb-5 flex gap-2">
                  <div className="flex-1 flex items-center gap-2 px-3 py-2.5 rounded-lg bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-800">
                    <ArrowDown size={14} className="text-zinc-400 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-[9px] font-bold uppercase tracking-wider text-zinc-400 leading-none">
                        Download
                      </div>
                      <div className="text-[12px] font-mono font-semibold text-zinc-700 dark:text-zinc-200 leading-none mt-1 truncate">
                        {selectedNode.data.rx_speed || "0 B/s"}
                      </div>
                    </div>
                  </div>
                  <div className="flex-1 flex items-center gap-2 px-3 py-2.5 rounded-lg bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-800">
                    <ArrowUp size={14} className="text-zinc-400 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-[9px] font-bold uppercase tracking-wider text-zinc-400 leading-none">
                        Upload
                      </div>
                      <div className="text-[12px] font-mono font-semibold text-zinc-700 dark:text-zinc-200 leading-none mt-1 truncate">
                        {selectedNode.data.tx_speed || "0 B/s"}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {nodeKind(selectedNode) !== "host" && (
                <PowerControls
                  node={selectedNode}
                  apiBase={API_BASE}
                  onFired={fetchInfra}
                  pendingInfo={pendingActions[selectedNode.id] || null}
                  onSetPending={(action) =>
                    setNodePending(selectedNode.id, action)
                  }
                  onClearPending={() => clearNodePending(selectedNode.id)}
                />
              )}

              <div className="mb-5">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-[9px] font-bold uppercase tracking-wider text-zinc-400">
                    History
                  </div>
                  <div className="flex items-center gap-0.5 rounded-md border border-zinc-200 dark:border-zinc-700 p-0.5">
                    {["hour", "day", "week"].map((tf) => (
                      <button
                        key={tf}
                        onClick={() => setTimeframe(tf)}
                        className={`px-2 py-0.5 rounded text-[10px] font-medium capitalize transition-colors ${
                          timeframe === tf
                            ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900"
                            : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
                        }`}
                      >
                        {tf}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-3 px-1">
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-1">
                      CPU
                    </div>
                    <Sparkline data={rrd.series?.cpu} color="#3b82f6" />
                  </div>
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-1">
                      Memory
                    </div>
                    <Sparkline data={rrd.series?.mem} color="#8b5cf6" />
                  </div>
                </div>
              </div>

              <div className="mb-5">
                <div className="text-[9px] font-bold uppercase tracking-wider text-zinc-400 mb-1">
                  Details
                </div>
                <InfoRow
                  icon={Network}
                  label="IP Address"
                  value={selectedNode.data.ip || "N/A"}
                />
                <InfoRow
                  icon={Clock}
                  label="Uptime"
                  value={selectedNode.data.uptime || "N/A"}
                />
              </div>

              {selectedNode.data.sub_services?.length > 0 && (
                <div>
                  <div className="text-[9px] font-bold uppercase tracking-wider text-zinc-400 mb-2">
                    Services
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedNode.data.sub_services.map((svc, idx) => (
                      <div
                        key={idx}
                        className="flex items-center gap-1.5 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 px-2 py-1 rounded text-[11px] font-mono text-zinc-600 dark:text-zinc-300"
                      >
                        <LayoutTemplate
                          size={11}
                          className="text-zinc-500 dark:text-zinc-400"
                        />
                        {svc}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </aside>

      {}
      <main className="relative flex-grow h-full bg-zinc-100 dark:bg-[#0a0a0b]">
        <ReactFlow
          colorMode={isDarkMode ? "dark" : "light"}
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          onNodeClick={(e, n) => setSelectedNodeId(n.id)}
          onPaneClick={() => {
            setSelectedNodeId(null);
            fitView({ padding: 0.2, duration: 500 });
          }}
          fitView
          proOptions={{ hideAttribution: true }}
        >
          <Background
            color={isDarkMode ? "#27272a" : "#d4d4d8"}
            gap={24}
            size={1}
            variant="dots"
          />
          <Controls
            showInteractive={false}
            className="!bg-white dark:!bg-zinc-900 !border !border-zinc-200 dark:!border-zinc-800 [&>button]:!border-zinc-200 dark:[&>button]:!border-zinc-800 [&>button]:!fill-zinc-500 [&>button:hover]:!bg-zinc-100 dark:[&>button:hover]:!bg-zinc-800 !rounded-lg !shadow-md !overflow-hidden"
          >
            <ControlButton onClick={handleReorder} title="Auto-arrange">
              <Layout size={14} />
            </ControlButton>
          </Controls>
        </ReactFlow>

        {!chatOpen && (
          <button
            onClick={() => {
              setChatOpen(true);
              setTimeout(() => fitView({ padding: 0.2, duration: 300 }), 60);
            }}
            title="Open assistant"
            className="absolute top-4 right-4 z-30 flex items-center gap-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300 hover:border-zinc-400 dark:hover:border-zinc-600 text-xs font-medium px-3 py-2 rounded-lg shadow-sm transition-colors"
          >
            <MessageCircleDashed size={14} /> Assistant
          </button>
        )}

        <div className="absolute bottom-4 right-4 z-30 bg-white/90 dark:bg-zinc-900/90 backdrop-blur border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-2.5 shadow-md">
          <div className="text-[9px] font-bold uppercase tracking-wider text-zinc-400 mb-1.5">
            Connections
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            {SERVICE_LEGEND.map(([k, label]) => (
              <div key={k} className="flex items-center gap-1.5">
                <span
                  className="h-0.5 w-3 rounded-full"
                  style={{ backgroundColor: SERVICE_COLORS[k] }}
                />
                <span className="text-[10px] text-zinc-500 dark:text-zinc-400">
                  {label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </main>

      {}
      {chatOpen && (
        <aside className="w-[480px] bg-white dark:bg-[#0d0d0f] flex flex-col border-l border-zinc-200 dark:border-zinc-800/80 shrink-0 z-20">
          <div className="px-4 h-14 border-b border-zinc-200 dark:border-zinc-800/80 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-md bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 flex items-center justify-center">
                <MessageCircleDashed
                  size={15}
                  className="text-zinc-600 dark:text-zinc-300"
                />
              </div>
              <span className="font-semibold text-sm text-zinc-800 dark:text-zinc-100">
                Assistant
              </span>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <div
                  className={`w-1.5 h-1.5 rounded-full ${!ollamaOnline ? "bg-red-500" : isThinking ? "bg-amber-500 animate-pulse" : "bg-emerald-500"}`}
                />
                <span
                  className={`text-[10px] font-medium uppercase tracking-wide ${!ollamaOnline ? "text-red-500" : "text-zinc-400"}`}
                >
                  {!ollamaOnline
                    ? "Offline"
                    : isThinking
                      ? "Thinking"
                      : "Ready"}
                </span>
              </div>
              <button
                onClick={() => {
                  setChatOpen(false);
                  setTimeout(
                    () => fitView({ padding: 0.2, duration: 400 }),
                    60,
                  );
                }}
                title="Close"
                className="p-1.5 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors"
              >
                <PanelRightClose size={15} />
              </button>
            </div>
          </div>

          <div
            ref={chatScrollRef}
            className="flex-grow overflow-y-auto p-5 space-y-5 custom-scrollbar"
          >
            {chatHistory.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start w-full"}`}
              >
                <div
                  className={
                    msg.role === "user"
                      ? "max-w-[80%] bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-3.5 py-2 rounded-lg rounded-tr-sm text-sm"
                      : "w-full text-zinc-700 dark:text-zinc-300"
                  }
                >
                  <div
                    className={
                      msg.role === "user"
                        ? ""
                        : "text-sm leading-relaxed space-y-4 [&>p]:mb-3 [&>ul]:list-disc [&>ul]:pl-5 [&>ul>li]:mb-1.5 [&>table]:block [&>table]:w-full [&>table]:overflow-x-auto [&>table]:whitespace-nowrap [&>table]:text-left [&>table]:border-collapse [&_th]:px-4 [&_th]:py-3 [&_th]:border-b [&_th]:border-zinc-300 dark:[&_th]:border-zinc-600 [&_th]:bg-zinc-100 dark:[&_th]:bg-zinc-800/50 [&_th]:font-semibold [&_td]:px-4 [&_td]:py-3 [&_td]:border-b [&_td]:border-zinc-200 dark:[&_td]:border-zinc-800 [&_td]:align-middle [&_strong]:text-zinc-900 dark:[&_strong]:text-white [&>h3]:text-base [&>h3]:font-bold [&>h3]:text-zinc-900 dark:[&>h3]:text-zinc-100 [&>h3]:mt-6 [&>h3]:mb-3"
                    }
                  >
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {msg.content}
                    </ReactMarkdown>
                  </div>
                </div>
              </div>
            ))}
            {isThinking && (
              <div className="flex justify-start items-center text-zinc-400 text-[10px] uppercase font-semibold tracking-wider mt-4">
                <Loader2 size={12} className="animate-spin mr-2" /> Processing
              </div>
            )}
          </div>

          <div className="p-4 border-t border-zinc-200 dark:border-zinc-800/80">
            {!ollamaOnline && (
              <div className="mb-2 flex items-center gap-1.5 text-[11px] text-red-500">
                <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                LLM server offline — start to enable chat.
              </div>
            )}
            <form
              onSubmit={handleChatSubmit}
              className="relative flex items-center"
            >
              <input
                ref={chatInputRef}
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder={
                  ollamaOnline
                    ? "Ask about your infrastructure..."
                    : "Assistant offline"
                }
                className="w-full bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-lg py-2.5 pl-3.5 pr-11 text-sm outline-none focus:border-zinc-400 dark:focus:border-zinc-500 focus:ring-1 focus:ring-zinc-400/30 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                disabled={isThinking || !ollamaOnline}
              />
              <button
                type="submit"
                disabled={isThinking || !chatInput.trim() || !ollamaOnline}
                className="absolute right-1.5 p-1.5 rounded-md text-zinc-400 hover:text-white hover:bg-zinc-900 dark:hover:text-zinc-900 dark:hover:bg-zinc-100 disabled:hover:bg-transparent disabled:hover:text-zinc-400 disabled:opacity-50 transition-colors"
              >
                <Send size={15} />
              </button>
            </form>
          </div>
        </aside>
      )}
    </div>
  );
}

export default function AppWrapper({ onOpenSettings }) {
  return (
    <ReactFlowProvider>
      <FlowWithProvider onOpenSettings={onOpenSettings} />
    </ReactFlowProvider>
  );
}
