import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ReactFlow, Background, Controls, ControlButton, useNodesState, useEdgesState, ReactFlowProvider, useReactFlow } from '@xyflow/react';
import dagre from '@dagrejs/dagre';
import axios from 'axios';
import '@xyflow/react/dist/style.css';
import ServiceNode from './components/ServiceNode';
import { Activity, Globe, Send, Loader2, Cpu, HardDrive, Network, Clock, Sun, Moon, Layout, LayoutTemplate } from 'lucide-react';
import ReactMarkdown from 'react-markdown'; 
import remarkGfm from 'remark-gfm';

const nodeTypes = { service: ServiceNode };

const getLayoutedElements = (nodes, edges, direction = 'LR') => {
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
      targetPosition: 'left',
      sourcePosition: 'right',
      position: { x: xPos, y: yPos } 
    };
  });
};

function FlowWithProvider() {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  
  const [loading, setLoading] = useState(true);
  const [loadProgress, setLoadProgress] = useState(0); 
  const [loadingStep, setLoadingStep] = useState(0); 
  
  const { fitView } = useReactFlow(); 
  
  const [isDarkMode, setIsDarkMode] = useState(true);
  const isDarkModeRef = useRef(isDarkMode);

  const chatInputRef = useRef(null);
  const chatScrollRef = useRef(null);
  const nodesRef = useRef([]);

  const [chatInput, setChatInput] = useState('');
  const [chatHistory, setChatHistory] = useState([
    { role: 'assistant', content: 'Chatbot established. I’m monitoring the stack.' }
  ]);
  const [isThinking, setIsThinking] = useState(false);

  const loadingSteps = [
    "Authenticating with Hypervisor...",
    "Discovering network nodes...",
    "Probing container services...",
    "Aggregating telemetry..."
  ];

  useEffect(() => {
    isDarkModeRef.current = isDarkMode;
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  useEffect(() => {
    setEdges((eds) =>
      eds.map((edge) => ({
        ...edge,
        style: { stroke: isDarkMode ? '#52525b' : '#a1a1aa', strokeWidth: 1.5, opacity: 0.7 },
        labelStyle: { fill: isDarkMode ? '#a1a1aa' : '#52525b', fontSize: 9, fontWeight: 'bold' },
        labelBgStyle: { fill: isDarkMode ? '#09090b' : '#ffffff', stroke: isDarkMode ? '#27272a' : '#e4e4e7' },
      }))
    );
  }, [isDarkMode, setEdges]);

  useEffect(() => {
    let progressInterval;
    let textInterval;

    if (loading) {
      setLoadProgress(0);
      setLoadingStep(0);
      
      progressInterval = setInterval(() => {
        setLoadProgress(prev => {
          const increment = prev < 60 ? 7 : prev < 90 ? 1.5 : 0.2;
          return prev >= 98 ? 98 : prev + increment;
        });
      }, 150);

      textInterval = setInterval(() => {
        setLoadingStep(prev => (prev < loadingSteps.length - 1 ? prev + 1 : prev));
      }, 1200);

    } else {
      setLoadProgress(100); 
    }

    return () => {
      clearInterval(progressInterval);
      clearInterval(textInterval);
    };
  }, [loading]);

  const fetchInfra = useCallback(async () => {
    if (nodesRef.current.length === 0) setLoading(true);

    try {
      const response = await axios.get(`${import.meta.env.VITE_API_URL}/api/v1/infrastructure`);
      const rawNodes = response.data.nodes || [];
      const rawEdges = response.data.edges || [];
      const currentDark = isDarkModeRef.current; 

      const enhancedEdges = rawEdges.map(edge => ({
        ...edge,
        style: { strokeWidth: 1.5, opacity: 0.7, stroke: currentDark ? '#52525b' : '#a1a1aa' },
        labelStyle: { fill: currentDark ? '#a1a1aa' : '#52525b', fontSize: 9, fontWeight: 'bold' },
        labelBgStyle: { fill: currentDark ? '#09090b' : '#ffffff', stroke: currentDark ? '#27272a' : '#e4e4e7' }
      }));

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
    return () => { isMounted = false; };
  }, [fetchInfra]); 

  useEffect(() => {
    chatInputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatHistory, isThinking]);

  const handleReorder = () => {
    if (nodesRef.current.length === 0) return;
    const layouted = getLayoutedElements(nodesRef.current, edges);
    setNodes(layouted);
    setTimeout(() => fitView({ padding: 0.2, duration: 800 }), 50);
  };

  const handleChatSubmit = async (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    const userMsg = { role: 'user', content: chatInput };
    const cleanContext = nodesRef.current.map(n => ({ id: n.id, data: n.data }));
    
    setChatHistory(prev => [...prev, userMsg]);
    setChatInput('');
    setIsThinking(true);

    setTimeout(() => chatInputRef.current?.focus(), 10);

    try {
      const response = await axios.post(`${import.meta.env.VITE_API_URL}/api/v1/chat`, {
        prompt: userMsg.content,
        context: cleanContext,
        history: chatHistory.map(msg => ({ role: msg.role, content: msg.content }))
      });
      setChatHistory(prev => [...prev, { role: 'assistant', content: response.data.reply }]);
    } catch (error) {
      setChatHistory(prev => [...prev, { role: 'assistant', content: "Connection interrupted." }]);
    } finally {
      setIsThinking(false);
      setTimeout(() => chatInputRef.current?.focus(), 50);
    }
  };

  const selectedNode = nodes.find(n => n.id === selectedNodeId);

  const getPercentage = (usageString) => {
    if (!usageString || usageString === 'N/A') return '0%';
    const parts = usageString.split(' / ');
    if (parts.length < 2) return '0%';
    const used = parseFloat(parts[0]);
    const total = parseFloat(parts[1]);
    if (total === 0) return '0%';
    return `${Math.round((used / total) * 100)}%`;
  };

  const MetricRow = ({ icon: Icon, label, value, progress, accent }) => (
    <div className="py-3 border-b border-zinc-200 dark:border-white/5 last:border-0">
      <div className="flex justify-between items-center mb-2">
        <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400">
          <Icon size={14} />
          <span className="text-xs font-medium">{label}</span>
        </div>
        <span className="text-xs font-mono text-zinc-800 dark:text-zinc-200">{value}</span>
      </div>
      {progress !== undefined && (
        <div className="w-full h-1 bg-zinc-200 dark:bg-zinc-900 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all duration-1000 ${accent}`} style={{ width: progress || '0%' }} />
        </div>
      )}
    </div>
  );

  return (
    <div className="flex h-screen w-screen bg-zinc-50 dark:bg-[#09090b] overflow-hidden text-zinc-800 dark:text-zinc-200 font-sans transition-colors duration-300">
      
      {loading && (
        <div className="absolute inset-0 z-[100] flex items-center justify-center bg-zinc-50/80 dark:bg-[#09090b]/80 backdrop-blur-sm transition-opacity duration-500">
          <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-white/10 p-8 rounded-2xl shadow-2xl flex flex-col items-center w-80">
            <Loader2 size={32} className="text-zinc-900 dark:text-white animate-spin mb-5" />
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-2">Initializing Workspace</h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 h-4 text-center">
              {loadingSteps[loadingStep]}
            </p>
            <div className="w-full h-1 bg-zinc-100 dark:bg-zinc-900 rounded-full mt-6 overflow-hidden">
              <div 
                className="h-full bg-zinc-900 dark:bg-white transition-all duration-300 ease-out" 
                style={{ width: `${loadProgress}%` }}
              ></div>
            </div>
          </div>
        </div>
      )}

      <aside className="w-80 bg-white dark:bg-zinc-950/50 flex flex-col border-r border-zinc-200 dark:border-white/5 shrink-0 z-20 backdrop-blur-xl">
        <div className="p-5 border-b border-zinc-200 dark:border-white/5 flex items-center gap-3">
          <Activity size={18} className="text-zinc-400" />
          <span className="font-semibold tracking-tight text-sm text-zinc-900 dark:text-zinc-100">InfraLens</span>
          <button onClick={() => setIsDarkMode(!isDarkMode)} className="ml-auto p-1.5 rounded-md hover:bg-zinc-100 dark:hover:bg-white/10 text-zinc-500">
            {isDarkMode ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </div>

        <div className="flex-grow overflow-y-auto custom-scrollbar p-5">
          {selectedNode ? (
            <div className="animate-in fade-in slide-in-from-left-2 duration-300">
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-1">
                  <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">{selectedNode.data.label}</h2>
                  <span className={`px-2 py-0.5 rounded-md text-[9px] font-bold uppercase border ${selectedNode.data.status === 'running' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : 'bg-zinc-500/10 text-zinc-500 border-zinc-500/20'}`}>
                    {selectedNode.data.status}
                  </span>
                </div>
                <p className="text-[10px] font-mono text-zinc-500 uppercase tracking-tight">Node ID: {selectedNode.id}</p>
              </div>

              <div className="space-y-1 mb-6">
                <MetricRow icon={Cpu} label="CPU" value={selectedNode.data.cpu || "N/A"} progress={selectedNode.data.cpu} accent="bg-zinc-800 dark:bg-zinc-200" />
                <MetricRow icon={HardDrive} label="RAM" value={selectedNode.data.ram || "N/A"} progress={getPercentage(selectedNode.data.ram)} accent="bg-zinc-500" />
                <MetricRow icon={HardDrive} label="Disk" value={selectedNode.data.disk || "N/A"} progress={getPercentage(selectedNode.data.disk)} accent="bg-zinc-600" />
                <MetricRow icon={Network} label="IP Address" value={selectedNode.data.ip || "N/A"} />
                <MetricRow icon={Clock} label="Uptime" value={selectedNode.data.uptime || "N/A"} />
              </div>

              {selectedNode.data.sub_services?.length > 0 && (
                <div>
                  <h3 className="text-[10px] uppercase tracking-widest text-zinc-400 font-bold mb-3">Active Services</h3>
                  <div className="flex flex-wrap gap-2">
                    {selectedNode.data.sub_services.map((svc, idx) => (
                      <div key={idx} className="flex items-center gap-2 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-white/5 px-3 py-1.5 rounded-lg text-xs font-mono">
                        <LayoutTemplate size={12} className="text-zinc-400" />
                        {svc}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center opacity-30">
               <Globe size={32} className="mb-4" />
               <p className="text-xs font-medium">Select a node to inspect<br/>live telemetry</p>
            </div>
          )}
        </div>
      </aside>

      <main className="relative flex-grow h-full bg-zinc-50 dark:bg-[#0d0d0d]">
        <ReactFlow
          colorMode={isDarkMode ? "dark" : "light"}
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          onNodeClick={(e, n) => setSelectedNodeId(n.id)}
          onPaneClick={() => setSelectedNodeId(null)}
          fitView
          proOptions={{ hideAttribution: true }}
        >
          <Background color={isDarkMode ? "#222" : "#ddd"} gap={20} variant="dots" />
          <Controls showInteractive={false} className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-white/5 fill-zinc-400 rounded-lg shadow-xl">
            <ControlButton onClick={handleReorder} title="Reorder Layout"><Layout size={14} /></ControlButton>
          </Controls>
        </ReactFlow>
      </main>

      <aside className="w-[500px] bg-white dark:bg-zinc-950/50 flex flex-col border-l border-zinc-200 dark:border-white/5 shrink-0 z-20 backdrop-blur-xl transition-all duration-300">
        <div className="p-5 border-b border-zinc-200 dark:border-white/5 flex items-center justify-between">
           <span className="font-semibold text-xs uppercase tracking-widest text-zinc-500">Ai Chatbot</span>
           <div className="flex items-center gap-2">
             <div className={`w-1.5 h-1.5 rounded-full ${isThinking ? 'bg-zinc-400 animate-pulse' : 'bg-emerald-500'}`}></div>
             <span className="text-[10px] font-bold text-zinc-400 uppercase">{isThinking ? 'Thinking' : 'Online'}</span>
           </div>
        </div>
        
        <div ref={chatScrollRef} className="flex-grow overflow-y-auto p-6 space-y-6 custom-scrollbar">
          {chatHistory.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start w-full'}`}>
              
              <div className={
                msg.role === 'user' 
                ? 'max-w-[80%] bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 px-4 py-2.5 rounded-2xl rounded-tr-sm text-sm' 
                : 'w-full text-zinc-700 dark:text-zinc-300' 
              }>
                
                <div className={
                  msg.role === 'user' ? '' : 
                  "text-sm leading-relaxed space-y-4 [&>p]:mb-3 [&>ul]:list-disc [&>ul]:pl-5 [&>ul>li]:mb-1.5 [&>table]:block [&>table]:w-full [&>table]:overflow-x-auto [&>table]:whitespace-nowrap [&>table]:text-left [&>table]:border-collapse [&_th]:px-4 [&_th]:py-3 [&_th]:border-b [&_th]:border-zinc-300 dark:[&_th]:border-zinc-600 [&_th]:bg-zinc-100 dark:[&_th]:bg-zinc-800/50 [&_th]:font-semibold [&_td]:px-4 [&_td]:py-3 [&_td]:border-b [&_td]:border-zinc-200 dark:[&_td]:border-zinc-800 [&_td]:align-middle [&_strong]:text-zinc-900 dark:[&_strong]:text-white [&>h3]:text-lg [&>h3]:font-bold [&>h3]:text-zinc-900 dark:[&>h3]:text-zinc-100 [&>h3]:mt-6 [&>h3]:mb-3"
                }>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                </div>

              </div>
            </div>
          ))}
          {isThinking && (
            <div className="flex justify-start text-zinc-400 text-[10px] uppercase font-bold tracking-widest mt-4">
              <Loader2 size={12} className="animate-spin mr-2" /> Processing...
            </div>
          )}
        </div>

        <div className="p-4 bg-zinc-50 dark:bg-zinc-950 border-t border-zinc-200 dark:border-white/5">
          <form onSubmit={handleChatSubmit} className="relative flex items-center">
            <input 
              ref={chatInputRef}
              value={chatInput} onChange={(e) => setChatInput(e.target.value)}
              placeholder="Query infrastructure..." 
              className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 rounded-xl py-3 pl-4 pr-12 text-sm outline-none focus:border-zinc-400 transition-colors" 
              disabled={isThinking}
            />
            <button type="submit" disabled={isThinking || !chatInput.trim()} className="absolute right-2 p-1.5 text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-100 transition-colors">
              <Send size={16} />
            </button>
          </form>
        </div>
      </aside>

    </div>
  );
}

export default function AppWrapper() {
  return (
    <ReactFlowProvider>
      <FlowWithProvider />
    </ReactFlowProvider>
  );
}