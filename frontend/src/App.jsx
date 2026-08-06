import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ReactFlow, Background, Controls, ControlButton, useNodesState, useEdgesState, ReactFlowProvider, useReactFlow } from '@xyflow/react';
import dagre from '@dagrejs/dagre';
import axios from 'axios';
import { API_BASE } from './api';
import '@xyflow/react/dist/style.css';
import ServiceNode from './components/ServiceNode';
import Logo from './components/Logo';
import { Send, Loader2, Network, Clock, Sun, Moon, Layout, LayoutTemplate, Settings, PanelRightClose, Server, Container, Cpu, MessageCircleDashed} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const nodeTypes = { service: ServiceNode };

const getLayoutedElements = (nodes, edges, direction = 'LR') => {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({ rankdir: direction, ranksep: 160, nodesep: 40 });
  nodes.forEach((node) => { dagreGraph.setNode(node.id, { width: 180, height: 50 }); });
  edges.forEach((edge) => { dagreGraph.setEdge(edge.source, edge.target); });
  dagre.layout(dagreGraph);
  return nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    const xPos = nodeWithPosition ? nodeWithPosition.x - 90 : 0;
    const yPos = nodeWithPosition ? nodeWithPosition.y - 25 : 0;
    return { ...node, targetPosition: 'left', sourcePosition: 'right', position: { x: xPos, y: yPos } };
  });
};

const pctToNumber = (usageString) => {
  if (!usageString || usageString === 'N/A') return 0;
  const parts = usageString.split(' / ');
  const toBytes = (s) => {
    const m = String(s).trim().match(/([\d.]+)\s*(B|KB|MB|GB|TB|PB)?/i);
    if (!m) return 0;
    const n = parseFloat(m[1]);
    const unit = (m[2] || 'B').toUpperCase();
    const mult = { B: 1, KB: 1e3, MB: 1e6, GB: 1e9, TB: 1e12, PB: 1e15 }[unit] || 1;
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
  const s = (n?.data?.status || '').toLowerCase();
  return s === 'running' || s === 'online';
};

const nodeKind = (n) => {
  const os = (n?.data?.os || '').toUpperCase();
  const tags = (n?.data?.tags || []).map(t => t.toLowerCase());
  const label = (n?.data?.label || '').toLowerCase();
  if (os.includes('LXC') || tags.includes('lxc') || tags.includes('container') || tags.includes('docker')) return 'container';
  if (label.includes('pve') || label.includes('proxmox') || label.includes('host') || tags.includes('host')) return 'host';
  return 'vm';
};

const SERVICE_COLORS = {
  dns:       '#10b981',
  security:  '#10b981',
  storage:   '#0ea5e9',
  network:   '#8b5cf6',
  dashboard: '#f43f5e',
  docker:    '#06b6d4',
  database:  '#f59e0b',
  host:      '#71717a',
};

const OFFLINE_COLOR_DARK = '#3f3f46';
const OFFLINE_COLOR_LIGHT = '#d4d4d8';

const serviceKey = (n) => {
  const tags = (n?.data?.tags || []).map(t => t.toLowerCase());
  for (const t of tags) if (SERVICE_COLORS[t]) return t;
  const l = (n?.data?.label || '').toLowerCase();
  if (l.includes('pihole') || l.includes('adguard') || l.includes('dns')) return 'dns';
  if (l.includes('cloud') || l.includes('nas') || l.includes('storage') || l.includes('smb')) return 'storage';
  if (l.includes('vpn') || l.includes('tailscale') || l.includes('wireguard') || l.includes('proxy')) return 'network';
  if (l.includes('dash') || l.includes('home') || l.includes('monitor')) return 'dashboard';
  if (l.includes('db') || l.includes('sql') || l.includes('redis') || l.includes('mongo')) return 'database';
  if (l.includes('docker') || l.includes('container')) return 'docker';
  if (l.includes('pve') || l.includes('proxmox') || l.includes('host') || l.includes('node')) return 'host';
  return 'host';
};

const styleEdge = (edge, rawNodes, dark) => {
  const target = rawNodes.find(n => n.id === edge.target);
  const online = isNodeOnline(target);
  if (!online) {
    return {
      ...edge,
      animated: false,
      className: 'edge-offline',
      style: { strokeWidth: 1.5, opacity: dark ? 0.4 : 0.5, stroke: dark ? OFFLINE_COLOR_DARK : OFFLINE_COLOR_LIGHT },
      labelStyle: { fill: dark ? '#a1a1aa' : '#52525b', fontSize: 9, fontWeight: 600 },
      labelBgStyle: { fill: dark ? '#18181b' : '#ffffff', stroke: dark ? '#27272a' : '#e4e4e7' },
    };
  }
  const c = SERVICE_COLORS[serviceKey(target)] || '#71717a';
  return {
    ...edge,
    animated: true,
    className: '',
    style: { strokeWidth: 1.5, opacity: dark ? 0.85 : 0.9, stroke: c },
    labelStyle: { fill: dark ? '#a1a1aa' : '#52525b', fontSize: 9, fontWeight: 600 },
    labelBgStyle: { fill: dark ? '#18181b' : '#ffffff', stroke: dark ? '#27272a' : '#e4e4e7' },
  };
};

const SERVICE_LEGEND = [
  ['dns', 'DNS / Security'],
  ['storage', 'Storage'],
  ['network', 'Network'],
  ['database', 'Database'],
  ['dashboard', 'Dashboard'],
  ['docker', 'Container'],
];

function Meter({ label, value, sub }) {
  const v = Math.max(0, Math.min(100, value));
  const barColor = v >= 90 ? 'bg-red-500' : v >= 75 ? 'bg-amber-500' : 'bg-zinc-800 dark:bg-zinc-200';
  return (
    <div className="py-2.5">
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">{label}</span>
        <div className="flex items-baseline gap-2">
          {sub && <span className="text-[10px] font-mono text-zinc-400 dark:text-zinc-500">{sub}</span>}
          <span className="text-xs font-mono font-semibold text-zinc-700 dark:text-zinc-200 tabular-nums">{v}%</span>
        </div>
      </div>
      <div className="w-full h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-sm overflow-hidden">
        <div className={`h-full rounded-sm transition-all duration-700 ${barColor}`} style={{ width: `${v}%` }} />
      </div>
    </div>
  );
}

function FlowWithProvider({ onOpenSettings }) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadProgress, setLoadProgress] = useState(0);
  const [loadingStep, setLoadingStep] = useState(0);
  const [ollamaOnline, setOllamaOnline] = useState(true);
  const { fitView } = useReactFlow();

  const [isDarkMode, setIsDarkMode] = useState(() => {
    try {
      const saved = localStorage.getItem('infralens-theme');
      if (saved) return saved === 'dark';
    } catch (_) {}
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });
  const isDarkModeRef = useRef(isDarkMode);

  const [chatOpen, setChatOpen] = useState(true);

  const chatInputRef = useRef(null);
  const chatScrollRef = useRef(null);
  const nodesRef = useRef([]);

  const [chatInput, setChatInput] = useState('');
  const [chatHistory, setChatHistory] = useState([
    { role: 'assistant', content: 'Assistant ready. Ask me about your infrastructure.' }
  ]);
  const [isThinking, setIsThinking] = useState(false);

  const loadingSteps = [
    "Authenticating with hypervisor...",
    "Discovering nodes...",
    "Probing services...",
    "Aggregating telemetry..."
  ];

  useEffect(() => {
    isDarkModeRef.current = isDarkMode;
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('infralens-theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('infralens-theme', 'light');
    }
  }, [isDarkMode]);

  useEffect(() => {
    setEdges((eds) => eds.map((edge) => styleEdge(edge, nodesRef.current, isDarkMode)));
  }, [isDarkMode, setEdges]);

  useEffect(() => {
    let progressInterval, textInterval;
    if (loading) {
      setLoadProgress(0); setLoadingStep(0);
      progressInterval = setInterval(() => {
        setLoadProgress(prev => { const inc = prev < 60 ? 7 : prev < 90 ? 1.5 : 0.2; return prev >= 98 ? 98 : prev + inc; });
      }, 150);
      textInterval = setInterval(() => {
        setLoadingStep(prev => (prev < loadingSteps.length - 1 ? prev + 1 : prev));
      }, 1200);
    } else { setLoadProgress(100); }
    return () => { clearInterval(progressInterval); clearInterval(textInterval); };
  }, [loading]);

  useEffect(() => {
    let mounted = true;
    const checkOllama = async () => {
      try {
        const { data } = await axios.get(`${API_BASE}/api/v1/health`, { timeout: 8000 });
        if (mounted) setOllamaOnline(!!data?.ollama?.ok);
      } catch {
        if (mounted) setOllamaOnline(false);
      }
    };
    checkOllama();
    const id = setInterval(checkOllama, 15000);
    return () => { mounted = false; clearInterval(id); };
  }, []);

  const fetchInfra = useCallback(async () => {
    if (nodesRef.current.length === 0) setLoading(true);
    try {
      const response = await axios.get(`${API_BASE}/api/v1/infrastructure`);
      const rawNodes = response.data.nodes || [];
      const rawEdges = response.data.edges || [];
      const currentDark = isDarkModeRef.current;
      const enhancedEdges = rawEdges.map(edge => styleEdge(edge, rawNodes, currentDark));
      setNodes((currentNodes) => {
        if (currentNodes.length === 0 && rawNodes.length > 0) return getLayoutedElements(rawNodes, enhancedEdges);
        return currentNodes.map(oldNode => {
          const incomingNode = rawNodes.find(n => n.id === oldNode.id);
          return incomingNode ? { ...oldNode, data: incomingNode.data } : oldNode;
        });
      });
      setEdges(enhancedEdges);
      nodesRef.current = rawNodes;
      if (nodesRef.current.length === 0 && rawNodes.length > 0) {
        setTimeout(() => fitView({ padding: 0.2, duration: 800 }), 100);
      }
    } catch (error) { console.error("Fetch Error:", error); }
    finally { setTimeout(() => setLoading(false), 500); }
  }, [setNodes, setEdges, fitView]);

  useEffect(() => {
    let isMounted = true;
    const pollBackend = async () => {
      if (!isMounted) return;
      await fetchInfra();
      setTimeout(pollBackend, 5000);
    };
    pollBackend();
    return () => { isMounted = false; };
  }, [fetchInfra]);

  useEffect(() => { if (ollamaOnline) chatInputRef.current?.focus(); }, [ollamaOnline]);

  useEffect(() => {
    if (chatScrollRef.current) chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
  }, [chatHistory, isThinking]);

  const handleReorder = () => {
    if (nodesRef.current.length === 0) return;
    setNodes(getLayoutedElements(nodesRef.current, edges));
    setTimeout(() => fitView({ padding: 0.2, duration: 800 }), 50);
  };

  const handleChatSubmit = async (e) => {
    e.preventDefault();
    if (!chatInput.trim() || !ollamaOnline) return;
    const userMsg = { role: 'user', content: chatInput };
    const cleanContext = nodesRef.current.map(n => ({ id: n.id, data: n.data }));
    setChatHistory(prev => [...prev, userMsg]);
    setChatInput('');
    setIsThinking(true);
    setTimeout(() => chatInputRef.current?.focus(), 10);
    try {
      const response = await axios.post(`${API_BASE}/api/v1/chat`, {
        prompt: userMsg.content, context: cleanContext,
        history: chatHistory.map(msg => ({ role: msg.role, content: msg.content }))
      });
      setChatHistory(prev => [...prev, { role: 'assistant', content: response.data.reply }]);
    } catch { setChatHistory(prev => [...prev, { role: 'assistant', content: "Connection interrupted." }]); }
    finally { setIsThinking(false); setTimeout(() => chatInputRef.current?.focus(), 50); }
  };

  const selectedNode = nodes.find(n => n.id === selectedNodeId);

  const allNodes = nodes.length ? nodes : [];
  const onlineCount = allNodes.filter(isNodeOnline).length;
  const totalCount = allNodes.length;
  const offlineCount = totalCount - onlineCount;
  const hostCount = allNodes.filter(n => nodeKind(n) === 'host').length;
  const vmCount = allNodes.filter(n => nodeKind(n) === 'vm').length;
  const containerCount = allNodes.filter(n => nodeKind(n) === 'container').length;
  const avgCpu = totalCount ? Math.round(allNodes.reduce((a, n) => a + pctToNumber(n.data?.cpu), 0) / totalCount) : 0;
  const avgRam = totalCount ? Math.round(allNodes.reduce((a, n) => a + pctToNumber(n.data?.ram), 0) / totalCount) : 0;

  const selectNode = (id) => {
    setSelectedNodeId(id);
    setTimeout(() => fitView({ nodes: [{ id }], padding: 0.5, duration: 500 }), 10);
  };

  const InfoRow = ({ icon: Icon, label, value }) => (
    <div className="flex items-center justify-between py-2 border-b border-zinc-100 dark:border-zinc-800 last:border-0">
      <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400">
        <Icon size={13} /><span className="text-xs">{label}</span>
      </div>
      <span className="text-xs font-mono text-zinc-700 dark:text-zinc-200">{value}</span>
    </div>
  );

  const StatCell = ({ label, value, valueClass = '' }) => (
    <div className="flex flex-col gap-1 px-3 py-2.5">
      <span className="text-[9px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 leading-none">{label}</span>
      <span className={`text-lg font-mono font-semibold leading-none ${valueClass || 'text-zinc-800 dark:text-zinc-100'}`}>{value}</span>
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

      {/* LEFT SIDEBAR */}
      <aside className="w-[340px] bg-white dark:bg-[#0d0d0f] flex flex-col border-r border-zinc-200 dark:border-zinc-800/80 shrink-0 z-20">
        <div className="px-4 h-14 border-b border-zinc-200 dark:border-zinc-800/80 flex items-center gap-2.5 shrink-0">
          <div className="w-7 h-7 rounded-md bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 flex items-center justify-center shrink-0">
            <Logo size={15} className="text-zinc-900 dark:text-white" />
          </div>
          <span className="font-semibold tracking-tight text-sm text-zinc-800 dark:text-zinc-100">InfraLens</span>
          <div className="ml-auto flex items-center gap-0.5">
            <button onClick={onOpenSettings} title="Settings" className="p-1.5 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 transition-colors">
              <Settings size={15} />
            </button>
            <button onClick={() => setIsDarkMode(!isDarkMode)} title="Toggle theme" className="p-1.5 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 transition-colors">
              {isDarkMode ? <Sun size={15} /> : <Moon size={15} />}
            </button>
          </div>
        </div>

        {!selectedNode ? (
          <div className="flex flex-col flex-grow overflow-hidden">
            <div className="px-4 pt-4 pb-2 shrink-0">
              <div className="text-[9px] font-bold uppercase tracking-wider text-zinc-400 mb-2">Cluster Overview</div>
              <div className="grid grid-cols-2 rounded-lg border border-zinc-200 dark:border-zinc-800 divide-x divide-y divide-zinc-200 dark:divide-zinc-800 overflow-hidden">
                <StatCell label="Total Nodes" value={totalCount} />
                <StatCell label="Online" value={`${onlineCount}/${totalCount}`} valueClass="text-emerald-600 dark:text-emerald-500" />
                <StatCell label="Avg CPU" value={`${avgCpu}%`} />
                <StatCell label="Avg Memory" value={`${avgRam}%`} />
              </div>
              <div className="flex items-center gap-4 mt-3 px-1">
                <div className="flex items-center gap-1.5 text-zinc-500 dark:text-zinc-400"><Server size={12} /><span className="text-[11px] font-mono">{hostCount} host</span></div>
                <div className="flex items-center gap-1.5 text-zinc-500 dark:text-zinc-400"><Cpu size={12} /><span className="text-[11px] font-mono">{vmCount} vm</span></div>
                <div className="flex items-center gap-1.5 text-zinc-500 dark:text-zinc-400"><Container size={12} /><span className="text-[11px] font-mono">{containerCount} ct</span></div>
                {offlineCount > 0 && <div className="flex items-center gap-1.5 text-red-500 ml-auto"><span className="h-1.5 w-1.5 rounded-full bg-red-500" /><span className="text-[11px] font-mono">{offlineCount} down</span></div>}
              </div>
            </div>

            <div className="px-4 pt-3 pb-1 shrink-0">
              <div className="text-[9px] font-bold uppercase tracking-wider text-zinc-400">Nodes ({totalCount})</div>
            </div>
            <div className="flex-grow overflow-y-auto custom-scrollbar px-2 pb-3">
              {allNodes.length === 0 ? (
                <div className="h-full flex items-center justify-center text-center px-6">
                  <p className="text-xs text-zinc-400 dark:text-zinc-600">Discovering nodes...</p>
                </div>
              ) : (
                allNodes.map((n) => {
                  const online = isNodeOnline(n);
                  return (
                    <button key={n.id} onClick={() => selectNode(n.id)}
                      className="w-full flex items-center gap-2.5 px-2 py-2 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800/60 transition-colors text-left">
                      <span className={`h-2 w-2 rounded-full shrink-0 ${online ? 'bg-emerald-500' : 'bg-red-500'}`} />
                      <span className="text-[13px] font-medium text-zinc-700 dark:text-zinc-200 truncate flex-1">{n.data?.label}</span>
                      <span className="text-[10px] font-mono text-zinc-400 dark:text-zinc-500 tabular-nums">{n.data?.cpu || ''}</span>
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
                  <h2 className="text-base font-semibold text-zinc-800 dark:text-zinc-100">{selectedNode.data.label}</h2>
                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${isNodeOnline(selectedNode) ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-500' : 'bg-red-500/10 text-red-600 dark:text-red-500'}`}>
                    {selectedNode.data.status}
                  </span>
                </div>
                <p className="text-[10px] font-mono text-zinc-400 dark:text-zinc-500 uppercase tracking-wide">ID: {selectedNode.id} · {nodeKind(selectedNode).toUpperCase()}</p>
              </div>

              <div className="mb-5 px-4 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-800">
                <div className="text-[9px] font-bold uppercase tracking-wider text-zinc-400 pt-2 pb-0.5">Resource Usage</div>
                <Meter label="CPU" value={pctToNumber(selectedNode.data.cpu)} />
                <Meter label="Memory" value={pctToNumber(selectedNode.data.ram)} sub={selectedNode.data.ram} />
                <Meter label="Disk" value={pctToNumber(selectedNode.data.disk)} sub={selectedNode.data.disk} />
              </div>

              <div className="mb-5">
                <div className="text-[9px] font-bold uppercase tracking-wider text-zinc-400 mb-1">Details</div>
                <InfoRow icon={Network} label="IP Address" value={selectedNode.data.ip || "N/A"} />
                <InfoRow icon={Clock} label="Uptime" value={selectedNode.data.uptime || "N/A"} />
              </div>

              {selectedNode.data.sub_services?.length > 0 && (
                <div>
                  <div className="text-[9px] font-bold uppercase tracking-wider text-zinc-400 mb-2">Services</div>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedNode.data.sub_services.map((svc, idx) => (
                      <div key={idx} className="flex items-center gap-1.5 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 px-2 py-1 rounded text-[11px] font-mono text-zinc-600 dark:text-zinc-300">
                        <LayoutTemplate size={11} className="text-zinc-500 dark:text-zinc-400" />{svc}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </aside>

      {/* MAIN CANVAS */}
      <main className="relative flex-grow h-full bg-zinc-100 dark:bg-[#0a0a0b]">
        <ReactFlow
          colorMode={isDarkMode ? "dark" : "light"}
          nodes={nodes} edges={edges}
          onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          onNodeClick={(e, n) => setSelectedNodeId(n.id)}
          onPaneClick={() => { setSelectedNodeId(null); fitView({ padding: 0.2, duration: 500 }); }}
          fitView proOptions={{ hideAttribution: true }}
        >
          <Background color={isDarkMode ? "#27272a" : "#d4d4d8"} gap={24} size={1} variant="dots" />
          <Controls showInteractive={false} className="!bg-white dark:!bg-zinc-900 !border !border-zinc-200 dark:!border-zinc-800 [&>button]:!border-zinc-200 dark:[&>button]:!border-zinc-800 [&>button]:!fill-zinc-500 [&>button:hover]:!bg-zinc-100 dark:[&>button:hover]:!bg-zinc-800 !rounded-lg !shadow-md !overflow-hidden">
            <ControlButton onClick={handleReorder} title="Auto-arrange"><Layout size={14} /></ControlButton>
          </Controls>
        </ReactFlow>

        {!chatOpen && (
          <button
            onClick={() => setChatOpen(true)}
            title="Open assistant"
            className="absolute top-4 right-4 z-30 flex items-center gap-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300 hover:border-zinc-400 dark:hover:border-zinc-600 text-xs font-medium px-3 py-2 rounded-lg shadow-sm transition-colors"
          >
            <MessageCircleDashed size={14} /> Assistant
          </button>
        )}

        <div className="absolute bottom-4 right-4 z-30 bg-white/90 dark:bg-zinc-900/90 backdrop-blur border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-2.5 shadow-md">
          <div className="text-[9px] font-bold uppercase tracking-wider text-zinc-400 mb-1.5">Connections</div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            {SERVICE_LEGEND.map(([k, label]) => (
              <div key={k} className="flex items-center gap-1.5">
                <span className="h-0.5 w-3 rounded-full" style={{ backgroundColor: SERVICE_COLORS[k] }} />
                <span className="text-[10px] text-zinc-500 dark:text-zinc-400">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* RIGHT SIDEBAR — assistant */}
      {chatOpen && (
        <aside className="w-[480px] bg-white dark:bg-[#0d0d0f] flex flex-col border-l border-zinc-200 dark:border-zinc-800/80 shrink-0 z-20">
          <div className="px-4 h-14 border-b border-zinc-200 dark:border-zinc-800/80 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-md bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 flex items-center justify-center">
                <MessageCircleDashed size={15} className="text-zinc-600 dark:text-zinc-300" />
              </div>
              <span className="font-semibold text-sm text-zinc-800 dark:text-zinc-100">Assistant</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <div className={`w-1.5 h-1.5 rounded-full ${!ollamaOnline ? 'bg-red-500' : isThinking ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'}`} />
                <span className={`text-[10px] font-medium uppercase tracking-wide ${!ollamaOnline ? 'text-red-500' : 'text-zinc-400'}`}>
                  {!ollamaOnline ? 'Offline' : isThinking ? 'Thinking' : 'Ready'}
                </span>
              </div>
              <button onClick={() => setChatOpen(false)} title="Close" className="p-1.5 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors">
                <PanelRightClose size={15} />
              </button>
            </div>
          </div>

          <div ref={chatScrollRef} className="flex-grow overflow-y-auto p-5 space-y-5 custom-scrollbar">
            {chatHistory.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start w-full'}`}>
                <div className={msg.role === 'user'
                  ? 'max-w-[80%] bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-3.5 py-2 rounded-lg rounded-tr-sm text-sm'
                  : 'w-full text-zinc-700 dark:text-zinc-300'}>
                  <div className={msg.role === 'user' ? '' :
                    "text-sm leading-relaxed space-y-4 [&>p]:mb-3 [&>ul]:list-disc [&>ul]:pl-5 [&>ul>li]:mb-1.5 [&>table]:block [&>table]:w-full [&>table]:overflow-x-auto [&>table]:whitespace-nowrap [&>table]:text-left [&>table]:border-collapse [&_th]:px-4 [&_th]:py-3 [&_th]:border-b [&_th]:border-zinc-300 dark:[&_th]:border-zinc-600 [&_th]:bg-zinc-100 dark:[&_th]:bg-zinc-800/50 [&_th]:font-semibold [&_td]:px-4 [&_td]:py-3 [&_td]:border-b [&_td]:border-zinc-200 dark:[&_td]:border-zinc-800 [&_td]:align-middle [&_strong]:text-zinc-900 dark:[&_strong]:text-white [&>h3]:text-base [&>h3]:font-bold [&>h3]:text-zinc-900 dark:[&>h3]:text-zinc-100 [&>h3]:mt-6 [&>h3]:mb-3"
                  }>
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
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
            <form onSubmit={handleChatSubmit} className="relative flex items-center">
              <input
                ref={chatInputRef}
                value={chatInput} onChange={(e) => setChatInput(e.target.value)}
                placeholder={ollamaOnline ? "Ask about your infrastructure..." : "Assistant offline"}
                className="w-full bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-lg py-2.5 pl-3.5 pr-11 text-sm outline-none focus:border-zinc-400 dark:focus:border-zinc-500 focus:ring-1 focus:ring-zinc-400/30 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                disabled={isThinking || !ollamaOnline}
              />
              <button type="submit" disabled={isThinking || !chatInput.trim() || !ollamaOnline}
                className="absolute right-1.5 p-1.5 rounded-md text-zinc-400 hover:text-white hover:bg-zinc-900 dark:hover:text-zinc-900 dark:hover:bg-zinc-100 disabled:hover:bg-transparent disabled:hover:text-zinc-400 disabled:opacity-50 transition-colors">
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