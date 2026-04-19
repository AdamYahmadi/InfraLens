import React, { useState, useEffect, useRef } from 'react';
import { ReactFlow, Background, Controls, useNodesState, useEdgesState } from '@xyflow/react';
import dagre from '@dagrejs/dagre';
import axios from 'axios';
import '@xyflow/react/dist/style.css';
import ServiceNode from './components/ServiceNode';
import { Activity, Globe, Send, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown'; 

const nodeTypes = { service: ServiceNode };

const dagreGraph = new dagre.graphlib.Graph();
dagreGraph.setDefaultEdgeLabel(() => ({}));

const getLayoutedElements = (nodes, edges, direction = 'TB') => {
  dagreGraph.setGraph({ rankdir: direction, ranksep: 100, nodesep: 80 });
  nodes.forEach((node) => dagreGraph.setNode(node.id, { width: 220, height: 120 }));
  edges.forEach((edge) => dagreGraph.setEdge(edge.source, edge.target));
  dagre.layout(dagreGraph);
  return nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    return { ...node, position: { x: nodeWithPosition.x - 110, y: nodeWithPosition.y - 60 } };
  });
};

function App() {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');

  const [chatInput, setChatInput] = useState('');
  const [chatHistory, setChatHistory] = useState([
    { role: 'assistant', content: 'Neural Link established. How can I assist with the topology?' }
  ]);
  const [isThinking, setIsThinking] = useState(false);
  const chatScrollRef = useRef(null);
  const nodesRef = useRef([]);

  const fetchInfra = async () => {
    try {
      const response = await axios.get('http://127.0.0.1:8000/api/v1/infrastructure');
      const rawNodes = response.data.nodes || [];
      const rawEdges = response.data.edges || [];
      
      const layouted = getLayoutedElements(rawNodes, rawEdges);
      
      setNodes(layouted);
      setEdges(rawEdges);
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

  const handleChatSubmit = async (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    const userMsg = { role: 'user', content: chatInput };
    const historyToSend = [...chatHistory]; 

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
      setChatHistory(prev => [...prev, { role: 'assistant', content: "Connection to Local LLM failed." }]);
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

  const isNetworkActive = selectedNode?.data.rx_speed !== '0.0 B/s' && selectedNode?.data.rx_speed !== 'N/A (Host)';

  return (
    <div className="flex h-screen w-screen bg-[#0a0a0a] overflow-hidden text-white font-sans">
      
      {/* LEFT SIDEBAR - NODE INSPECTOR */}
      <aside className="w-96 bg-[#141414] flex flex-col shadow-[20px_0_50px_rgba(0,0,0,0.5)] z-20 border-r border-white/10 shrink-0">
        
        <div className="p-6 border-b border-white/10 bg-[#111] relative overflow-hidden shrink-0">
          <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-blue-500 via-cyan-400 to-transparent opacity-80"></div>
          <div className="flex items-center gap-4">
            <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/30 shadow-[0_0_15px_rgba(59,130,246,0.2)]">
              <Activity size={20} className="text-blue-400" />
              <div className="absolute inset-0 border border-blue-400/50 rounded-xl animate-ping opacity-50"></div>
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tighter text-white leading-none">
                INFRA<span className="text-blue-500">LENS</span>
              </h1>
              <div className="flex items-center gap-2 mt-1.5">
                <div className="w-1.5 h-1.5 bg-green-500 rounded-sm animate-pulse shadow-[0_0_5px_rgba(34,197,94,0.8)]"></div>
                <p className="text-[9px] text-gray-400 font-mono uppercase tracking-[0.3em] font-bold leading-none">Topology.Display</p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex-grow overflow-y-auto custom-scrollbar bg-[#141414]">
          {selectedNode ? (
            <div key={selectedNode.id} className="animate-in fade-in duration-300">
              <div className="p-6 pb-0">
                <div className="p-5 bg-gradient-to-br from-blue-500/10 to-transparent border border-blue-500/20 rounded-2xl shadow-lg">
                  <div className="flex justify-between items-start">
                    <div>
                      <h2 className="text-blue-400 text-[10px] font-black uppercase tracking-[0.2em] mb-1">Target Acquired</h2>
                      <h3 className="text-2xl font-bold tracking-tight leading-none">{selectedNode.data.label}</h3>
                    </div>
                    <div className={`px-2 py-1 rounded text-[9px] uppercase font-bold tracking-widest shadow-inner border border-white/5 ${selectedNode.data.status === 'running' || selectedNode.data.status === 'online' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                      {selectedNode.data.status}
                    </div>
                  </div>
                  <p className="text-[10px] text-gray-500 mt-3 font-mono opacity-80 uppercase tracking-widest">
                    {selectedNode.data.os} • UID: {selectedNode.id}
                  </p>
                </div>
              </div>

              <div className="flex px-6 mt-6 border-b border-white/10">
                {['overview', 'network', 'storage'].map(tab => (
                  <button key={tab} onClick={() => setActiveTab(tab)} className={`pb-3 px-4 text-[10px] uppercase tracking-widest font-bold border-b-2 transition-all ${activeTab === tab ? 'border-blue-500 text-blue-400' : 'border-transparent text-gray-500'}`}>{tab}</button>
                ))}
              </div>

              <div className="p-6 space-y-6">
                {activeTab === 'overview' && (
                  <div className="space-y-6">
                    <div className="space-y-2">
                      <div className="flex justify-between text-[11px] font-mono"><span className="text-gray-400">CPU Intensity</span><span className="text-blue-400 font-bold">{selectedNode.data.cpu}</span></div>
                      <div className="w-full bg-white/5 h-2 rounded-full overflow-hidden border border-white/5"><div className="bg-blue-500 h-full transition-all duration-1000" style={{ width: selectedNode.data.cpu }}></div></div>
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between text-[11px] font-mono"><span className="text-gray-400">Memory allocation</span><span className="text-purple-400 font-bold">{getPercentage(selectedNode.data.ram)}</span></div>
                      <div className="w-full bg-white/5 h-2 rounded-full overflow-hidden border border-white/5"><div className="bg-purple-500 h-full transition-all duration-1000" style={{ width: getPercentage(selectedNode.data.ram) }}></div></div>
                      <div className="text-right text-[9px] text-gray-600 font-mono italic">{selectedNode.data.ram}</div>
                    </div>
                    <div className="p-4 bg-white/[0.02] border border-white/5 rounded-xl flex justify-between items-center shadow-inner">
                      <span className="text-[9px] uppercase text-gray-500 font-black tracking-widest">System Uptime</span>
                      <span className="text-[12px] text-gray-300 font-mono">{selectedNode.data.uptime}</span>
                    </div>
                  </div>
                )}

                {activeTab === 'network' && (
                  <div className="space-y-4">
                    <div className="p-4 bg-white/[0.02] border border-white/5 rounded-xl flex items-center justify-between shadow-inner">
                      <span className="text-[9px] uppercase text-gray-500 font-black tracking-widest">Internal IP</span>
                      <span className="text-[12px] text-green-400 font-mono font-bold">{selectedNode.data.ip}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-4 bg-[#111] border border-white/5 rounded-xl relative overflow-hidden shadow-inner">
                        {isNetworkActive && <div className="absolute top-0 left-0 w-full h-0.5 bg-blue-500 animate-pulse"></div>}
                        <span className="text-[9px] uppercase text-gray-500 font-black tracking-widest block mb-2">Live RX</span>
                        <span className="text-lg text-blue-400 font-mono">{selectedNode.data.rx_speed}</span>
                      </div>
                      <div className="p-4 bg-[#111] border border-white/5 rounded-xl relative overflow-hidden shadow-inner">
                        {isNetworkActive && <div className="absolute top-0 left-0 w-full h-0.5 bg-purple-500 animate-pulse"></div>}
                        <span className="text-[9px] uppercase text-gray-500 font-black tracking-widest block mb-2">Live TX</span>
                        <span className="text-lg text-purple-400 font-mono">{selectedNode.data.tx_speed}</span>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'storage' && (
                  <div className="space-y-6">
                    <div className="space-y-2">
                      <div className="flex justify-between text-[11px] font-mono"><span className="text-gray-400 uppercase tracking-wider">Root Partition</span><span className="text-cyan-400 font-bold">{getPercentage(selectedNode.data.disk)}</span></div>
                      <div className="w-full bg-white/5 h-2 rounded-full overflow-hidden border border-white/5"><div className="bg-cyan-500 h-full transition-all duration-1000" style={{ width: getPercentage(selectedNode.data.disk) }}></div></div>
                      <div className="text-right text-[9px] text-gray-600 font-mono italic">{selectedNode.data.disk}</div>
                    </div>
                  </div>
                )}

                <button onClick={() => setSelectedNodeId(null)} className="w-full py-4 bg-[#1a1a1a] hover:bg-white/5 rounded-2xl border border-white/10 text-[9px] uppercase font-black text-gray-500 hover:text-white transition-all cursor-pointer shadow-md">Close Inspector</button>
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center p-10 opacity-30">
               <Globe size={40} className="mb-4 text-blue-500/50 animate-pulse" />
               <p className="text-[10px] uppercase tracking-[0.4em] font-black leading-loose">Initialize Topology<br/>Select Node to Probe</p>
            </div>
          )}
        </div>
      </aside>

      {/* VISUALIZER */}
      <main className="relative flex-grow h-full bg-[#0d0d0d] z-10">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          onNodeClick={(e, n) => setSelectedNodeId(n.id)}
          onPaneClick={() => setSelectedNodeId(null)}
          fitView
          defaultEdgeOptions={{ 
            animated: true,
            style: { stroke: '#3b82f6', strokeWidth: 1.5, opacity: 0.3 }
          }}
        >
          <Background color="#1a1a1a" gap={25} variant="dots" />
          <Controls className="bg-[#1a1a1a] border-white/10 fill-white rounded-xl overflow-hidden shadow-2xl" />
        </ReactFlow>
      </main>

      {/* RIGHT SIDEBAR - ACTIVE AI CHAT TERMINAL */}
      <aside className="w-96 bg-[#141414] flex flex-col shadow-[-20px_0_50px_rgba(0,0,0,0.5)] z-20 border-l border-white/10 shrink-0">
        <div className="p-6 border-b border-white/10 bg-[#111] relative overflow-hidden shrink-0">
           <div className="absolute top-0 right-0 w-full h-[2px] bg-gradient-to-l from-blue-500 via-cyan-400 to-transparent opacity-80"></div>
           <div className="flex items-center gap-3">
              <div className={`w-2 h-2 rounded-full shadow-[0_0_8px_rgba(59,130,246,0.8)] ${isThinking ? 'bg-cyan-400 animate-ping' : 'bg-blue-500 animate-pulse'}`}></div>
              <h2 className="text-[12px] text-blue-400 uppercase font-black tracking-[0.2em]">Neural Link</h2>
           </div>
        </div>
        
        <div ref={chatScrollRef} className="flex-grow overflow-y-auto p-4 space-y-4 custom-scrollbar">
          {chatHistory.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[90%] rounded-xl p-4 text-[11px] font-mono leading-relaxed ${msg.role === 'user' ? 'bg-blue-600/20 border border-blue-500/30 text-blue-100' : 'bg-[#1a1a1a] border border-white/5 text-gray-300 shadow-md'}`}>
                {msg.role === 'user' ? (
                   msg.content 
                ) : (
                   <ReactMarkdown 
                      components={{
                        p: ({node, ...props}) => <p className="mb-2 last:mb-0" {...props} />,
                        ul: ({node, ...props}) => <ul className="list-disc pl-4 mb-2 space-y-1 text-blue-300/80" {...props} />,
                        ol: ({node, ...props}) => <ol className="list-decimal pl-4 mb-2 space-y-1 text-blue-300/80" {...props} />,
                        li: ({node, ...props}) => <li {...props} />,
                        strong: ({node, ...props}) => <strong className="text-white font-bold" {...props} />,
                        code: ({node, inline, ...props}) => 
                          inline 
                            ? <code className="bg-black/40 text-cyan-400 px-1 py-0.5 rounded border border-white/5" {...props} />
                            : <pre className="bg-black/60 p-3 rounded-lg border border-white/10 overflow-x-auto my-2 text-blue-300"><code {...props} /></pre>
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
               <div className="bg-[#1a1a1a] border border-white/5 rounded-xl p-3 text-blue-400 shadow-md">
                  <Loader2 size={14} className="animate-spin" />
               </div>
            </div>
          )}
        </div>

        <form onSubmit={handleChatSubmit} className="p-4 pt-2 border-t border-white/5 bg-[#0a0a0a]">
          <div className="relative">
            <input 
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Query telemetry..." 
              className="w-full bg-[#141414] border border-white/10 rounded-xl py-4 pl-4 pr-12 text-[12px] font-mono text-white placeholder-gray-600 outline-none focus:border-blue-500/50 transition-colors shadow-inner" 
              disabled={isThinking}
            />
            <button 
              type="submit" 
              disabled={isThinking || !chatInput.trim()}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-2 bg-blue-500/10 text-blue-400 rounded-lg hover:bg-blue-500/20 disabled:opacity-50 transition-colors cursor-pointer border border-blue-500/20"
            >
              <Send size={14} />
            </button>
          </div>
        </form>
      </aside>

    </div>
  );
}

export default App;