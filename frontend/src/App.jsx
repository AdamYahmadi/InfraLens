import React, { useState, useEffect, useRef } from 'react';
import { ReactFlow, Background, Controls, ControlButton, useNodesState, useEdgesState } from '@xyflow/react';
import dagre from '@dagrejs/dagre';
import axios from 'axios';
import '@xyflow/react/dist/style.css';
import ServiceNode from './components/ServiceNode';
import { Activity, Globe, Send, Loader2, Cpu, HardDrive, Network, Clock, Sun, Moon, Layout } from 'lucide-react';
import ReactMarkdown from 'react-markdown'; 

const nodeTypes = { service: ServiceNode };

const dagreGraph = new dagre.graphlib.Graph();
dagreGraph.setDefaultEdgeLabel(() => ({}));

const getLayoutedElements = (nodes, edges, direction = 'LR') => {
  dagreGraph.setGraph({ rankdir: direction, ranksep: 160, nodesep: 40 });
  nodes.forEach((node) => dagreGraph.setNode(node.id, { width: 180, height: 50 }));
  edges.forEach((edge) => dagreGraph.setEdge(edge.source, edge.target));
  dagre.layout(dagreGraph);
  return nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    return { ...node, position: { x: nodeWithPosition.x - 90, y: nodeWithPosition.y - 25 } };
  });
};

function App() {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [loading, setLoading] = useState(true);
  
  const [isDarkMode, setIsDarkMode] = useState(true);
  const isDarkModeRef = useRef(isDarkMode);

  const [chatInput, setChatInput] = useState('');
  const [chatHistory, setChatHistory] = useState([
    { role: 'assistant', content: 'Connection established. How can I assist with the infrastructure?' }
  ]);
  const [isThinking, setIsThinking] = useState(false);
  const chatScrollRef = useRef(null);
  const nodesRef = useRef([]);

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
        style: {
          ...edge.style,
          stroke: isDarkMode ? '#52525b' : '#a1a1aa',
        },
        labelStyle: {
          fill: isDarkMode ? '#a1a1aa' : '#52525b',
          fontSize: 9,
          fontWeight: 'bold',
          fontFamily: 'monospace',
          letterSpacing: '0.05em',
        },
        labelBgStyle: {
          fill: isDarkMode ? '#09090b' : '#ffffff',
          stroke: isDarkMode ? '#27272a' : '#e4e4e7',
          strokeWidth: 1,
        },
      }))
    );
  }, [isDarkMode, setEdges]);

  const fetchInfra = async () => {
    try {
      const response = await axios.get('http://127.0.0.1:8000/api/v1/infrastructure');
      const rawNodes = response.data.nodes || [];
      const rawEdges = response.data.edges || [];
      
      const currentDark = isDarkModeRef.current; 

      const enhancedEdges = rawEdges.map(edge => {
        const baseStyle = edge.style || {};
        return {
          ...edge,
          style: {
            ...baseStyle,
            strokeWidth: 1.5,
            opacity: 0.7,
            stroke: currentDark ? '#52525b' : '#a1a1aa'
          },
          labelStyle: { fill: currentDark ? '#a1a1aa' : '#52525b', fontSize: 9, fontWeight: 'bold', fontFamily: 'monospace', letterSpacing: '0.05em' },
          labelBgStyle: { fill: currentDark ? '#09090b' : '#ffffff', stroke: currentDark ? '#27272a' : '#e4e4e7', strokeWidth: 1 },
          labelBgPadding: [8, 4],
          labelBgBorderRadius: 6,
        };
      });

      setNodes((currentNodes) => {
        if (currentNodes.length > 0 && currentNodes.length === rawNodes.length) {
          return currentNodes.map(oldNode => {
            const incomingNode = rawNodes.find(n => n.id === oldNode.id);
            return incomingNode ? { ...oldNode, data: incomingNode.data } : oldNode;
          });
        }
        
        const layouted = getLayoutedElements(rawNodes, enhancedEdges);
        return layouted.map((newNode) => {
          const existingNode = currentNodes.find((n) => n.id === newNode.id);
          return existingNode ? { ...newNode, selected: existingNode.selected } : newNode;
        });
      });
      
      setEdges(enhancedEdges);
      nodesRef.current = rawNodes;
    } catch (error) {
      console.error("Fetch Error:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInfra();
    const interval = setInterval(fetchInfra, 5000); 
    return () => clearInterval(interval);
  }, []); 

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatHistory, isThinking]);

  const handleReorder = () => {
    if (nodesRef.current.length === 0) return;
    const layouted = getLayoutedElements(nodesRef.current, edges);
    setNodes((currentNodes) => {
      return layouted.map((newNode) => {
        const existingNode = currentNodes.find((n) => n.id === newNode.id);
        return existingNode ? { ...newNode, selected: existingNode.selected } : newNode;
      });
    });
  };

  const handleChatSubmit = async (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    const userMsg = { role: 'user', content: chatInput };
    const historyToSend = chatHistory.map(msg => ({
      role: msg.role,
      content: msg.content
    }));

    setChatHistory(prev => [...prev, userMsg]);
    setChatInput('');
    setIsThinking(true);

    try {
      const response = await axios.post('http://127.0.0.1:8000/api/v1/chat', {
        prompt: userMsg.content,
        context: nodesRef.current,
        history: historyToSend 
      });
      setChatHistory(prev => [...prev, { role: 'assistant', content: response.data.reply }]);
    } catch (error) {
      setChatHistory(prev => [...prev, { role: 'assistant', content: "Connection error with AI service." }]);
    } finally {
      setIsThinking(false);
    }
  };

  const selectedNode = nodes.find(n => n.id === selectedNodeId);

  const parseBytes = (str) => {
    if (!str || str.includes('N/A')) return 0;
    const match = str.match(/([\d.]+)\s*([KMGTP]?B)/i);
    if (!match) return parseFloat(str) || 0;
    const val = parseFloat(match[1]);
    const unit = match[2].toUpperCase();
    const multipliers = { 'B': 1, 'KB': 1024, 'MB': 1024**2, 'GB': 1024**3, 'TB': 1024**4 };
    return val * (multipliers[unit] || 1);
  };

  const getPercentage = (usageString) => {
    if (!usageString || usageString === 'N/A') return '0%';
    const parts = usageString.split(' / ');
    if (parts.length < 2) return '0%';
    const usedBytes = parseBytes(parts[0]);
    const totalBytes = parseBytes(parts[1]);
    if (totalBytes === 0) return '0%';
    return `${Math.min(Math.max(Math.round((usedBytes / totalBytes) * 100), 0), 100)}%`;
  };

  const MetricRow = ({ icon: Icon, label, value, progress, accent }) => (
    <div className="py-3 border-b border-zinc-200 dark:border-white/5 last:border-0">
      <div className="flex justify-between items-center mb-2">
        <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400">
          <Icon size={14} />
          <span className="text-xs">{label}</span>
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

  const isSelectedNodeOnline = selectedNode?.data.status?.toLowerCase() === 'running' || selectedNode?.data.status?.toLowerCase() === 'online';

  return (
    <div className="flex h-screen w-screen bg-zinc-50 dark:bg-[#09090b] overflow-hidden text-zinc-800 dark:text-zinc-200 font-sans transition-colors duration-300">
      
      <aside className="w-80 bg-white dark:bg-zinc-950/50 flex flex-col border-r border-zinc-200 dark:border-white/5 shrink-0 z-20 backdrop-blur-xl transition-colors duration-300">
        <div className="p-5 border-b border-zinc-200 dark:border-white/5 flex items-center gap-3">
          <div className="bg-zinc-100 dark:bg-white/5 p-1.5 rounded-lg border border-zinc-200 dark:border-white/5">
             <Activity size={18} className="text-zinc-600 dark:text-zinc-300" />
          </div>
          <span className="font-semibold tracking-tight text-sm text-zinc-900 dark:text-zinc-100">InfraLens</span>
          <button 
            onClick={() => setIsDarkMode(!isDarkMode)} 
            className="ml-auto p-1.5 rounded-md hover:bg-zinc-100 dark:hover:bg-white/10 text-zinc-500 dark:text-zinc-400 transition-colors cursor-pointer"
            title="Toggle Theme"
          >
            {isDarkMode ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </div>

        <div className="flex-grow overflow-y-auto custom-scrollbar p-5">
          {selectedNode ? (
            <div key={selectedNode.id} className="animate-in fade-in duration-300">
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-1">
                  <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">{selectedNode.data.label}</h2>
                  <span className={`px-2 py-0.5 rounded-md text-[10px] font-medium border uppercase ${isSelectedNodeOnline ? 'bg-emerald-100 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20' : 'bg-rose-100 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-500/20'}`}>
                    {selectedNode.data.status}
                  </span>
                </div>
                <p className="text-xs text-zinc-500">UID: {selectedNode.id} • {selectedNode.data.os}</p>
              </div>

              <div className="bg-zinc-50 dark:bg-white/[0.02] border border-zinc-200 dark:border-white/5 rounded-xl p-4 mb-4">
                <MetricRow icon={Cpu} label="CPU Usage" value={selectedNode.data.cpu} progress={selectedNode.data.cpu} accent="bg-zinc-400 dark:bg-zinc-300" />
                <MetricRow icon={HardDrive} label="Memory" value={selectedNode.data.ram} progress={getPercentage(selectedNode.data.ram)} accent="bg-zinc-500 dark:bg-zinc-500" />
                <MetricRow icon={HardDrive} label="Disk" value={selectedNode.data.disk} progress={getPercentage(selectedNode.data.disk)} accent="bg-zinc-800 dark:bg-zinc-700" />
              </div>

              <div className="bg-zinc-50 dark:bg-white/[0.02] border border-zinc-200 dark:border-white/5 rounded-xl p-4 mb-6">
                <MetricRow icon={Network} label="Internal IP" value={selectedNode.data.ip} />
                <div className="grid grid-cols-2 gap-4 mt-3 pt-3 border-t border-zinc-200 dark:border-white/5">
                  <div>
                    <span className="text-[10px] text-zinc-500 block mb-1">RX Speed</span>
                    <span className="text-xs font-mono text-zinc-800 dark:text-zinc-200">{selectedNode.data.rx_speed}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-zinc-500 block mb-1">TX Speed</span>
                    <span className="text-xs font-mono text-zinc-800 dark:text-zinc-200">{selectedNode.data.tx_speed}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs text-zinc-500 mb-6 px-1">
                <div className="flex items-center gap-2"><Clock size={14} /> Uptime</div>
                <span className="font-mono text-zinc-600 dark:text-zinc-300">{selectedNode.data.uptime}</span>
              </div>

              <button onClick={() => setSelectedNodeId(null)} className="w-full py-2.5 bg-zinc-100 dark:bg-white/5 hover:bg-zinc-200 dark:hover:bg-white/10 rounded-lg border border-zinc-200 dark:border-white/5 text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors cursor-pointer">
                Clear Selection
              </button>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center opacity-40">
               <Globe size={32} className="mb-3 text-zinc-500" />
               <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Select a node to view<br/>telemetry data</p>
            </div>
          )}
        </div>
      </aside>

      <main className="relative flex-grow h-full z-10 min-w-0 min-h-0 bg-zinc-50 dark:bg-[#0d0d0d] transition-colors duration-300">
        <div className="w-full h-full">
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
            <Background color={isDarkMode ? "#27272a" : "#e4e4e7"} gap={25} variant="dots" size={1.5} />
            
            {/* 🚀 FIXED: Hidden lock button, added custom Layout reorder button */}
            <Controls 
              showInteractive={false} 
              className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-white/5 fill-zinc-600 dark:fill-zinc-400 rounded-lg shadow-xl"
            >
              <ControlButton onClick={handleReorder} title="Reorder Layout">
                <Layout size={14} />
              </ControlButton>
            </Controls>

          </ReactFlow>
        </div>
      </main>

      <aside className="w-[400px] bg-white dark:bg-zinc-950/50 flex flex-col border-l border-zinc-200 dark:border-white/5 shrink-0 z-20 backdrop-blur-xl transition-colors duration-300">
        <div className="p-5 border-b border-zinc-200 dark:border-white/5 flex items-center justify-between">
           <span className="font-medium text-sm text-zinc-900 dark:text-zinc-200">AI Assistant</span>
           <div className="flex items-center gap-2">
             <div className={`w-1.5 h-1.5 rounded-full ${isThinking ? 'bg-cyan-500 animate-pulse' : 'bg-emerald-500'}`}></div>
             <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">{isThinking ? 'Processing' : 'Ready'}</span>
           </div>
        </div>
        
        <div ref={chatScrollRef} className="flex-grow overflow-y-auto p-5 space-y-6 custom-scrollbar">
          {chatHistory.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[90%] text-sm leading-relaxed ${msg.role === 'user' ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 px-4 py-2.5 rounded-2xl rounded-tr-sm border border-zinc-200 dark:border-transparent' : 'text-zinc-700 dark:text-zinc-300'}`}>
                {msg.role === 'user' ? (
                   msg.content 
                ) : (
                   <ReactMarkdown 
                      components={{
                        p: ({node, ...props}) => <p className="mb-3 last:mb-0" {...props} />,
                        ul: ({node, ...props}) => <ul className="list-disc pl-5 mb-3 space-y-1 text-zinc-600 dark:text-zinc-400" {...props} />,
                        ol: ({node, ...props}) => <ol className="list-decimal pl-5 mb-3 space-y-1 text-zinc-600 dark:text-zinc-400" {...props} />,
                        strong: ({node, ...props}) => <strong className="text-zinc-900 dark:text-zinc-200 font-semibold" {...props} />,
                        code: ({node, inline, ...props}) => 
                          inline 
                            ? <code className="bg-zinc-100 dark:bg-white/5 text-zinc-800 dark:text-zinc-200 px-1.5 py-0.5 rounded-md font-mono text-xs border border-zinc-200 dark:border-white/5" {...props} />
                            : <pre className="bg-zinc-50 dark:bg-black/40 p-4 rounded-xl border border-zinc-200 dark:border-white/5 overflow-x-auto my-3 text-zinc-700 dark:text-zinc-300 font-mono text-xs"><code {...props} /></pre>
                      }}
                   >
                     {msg.content}
                   </ReactMarkdown>
                )}
              </div>
            </div>
          ))}
          {isThinking && (
            <div className="flex justify-start">
               <div className="text-zinc-500 flex items-center gap-2 text-sm">
                  <Loader2 size={14} className="animate-spin" />
                  Thinking...
               </div>
            </div>
          )}
        </div>

        <div className="p-4 bg-zinc-50 dark:bg-zinc-950 border-t border-zinc-200 dark:border-white/5 transition-colors duration-300">
          <form onSubmit={handleChatSubmit} className="relative flex items-center">
            <input 
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Ask about your infrastructure..." 
              className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 rounded-xl py-3 pl-4 pr-12 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 outline-none focus:border-zinc-400 dark:focus:border-zinc-500 transition-colors focus:ring-1 focus:ring-zinc-400 dark:focus:ring-zinc-500 shadow-sm" 
              disabled={isThinking}
            />
            <button 
              type="submit" 
              disabled={isThinking || !chatInput.trim()}
              className="absolute right-2 p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-100 disabled:opacity-50 transition-colors cursor-pointer"
            >
              <Send size={16} />
            </button>
          </form>
        </div>
      </aside>

    </div>
  );
}

export default App;