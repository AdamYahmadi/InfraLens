import React, { useState, useEffect } from 'react';
import { ReactFlow, Background, Controls } from '@xyflow/react';
import axios from 'axios';
import '@xyflow/react/dist/style.css';

import ServiceNode from './components/ServiceNode';

const nodeTypes = {
  service: ServiceNode,
};

function App() {
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [selectedNode, setSelectedNode] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchInfra = async () => {
      try {
        const response = await axios.get('http://127.0.0.1:8000/api/v1/infrastructure');
        setNodes(response.data.nodes || []);
        setEdges(response.data.edges || []);
      } catch (error) {
        console.error("Error fetching infrastructure:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchInfra();
    const interval = setInterval(fetchInfra, 30000);
    return () => clearInterval(interval);
  }, []);

  const onNodeClick = (event, node) => {
    setSelectedNode(node);
  };

  const onPaneClick = () => {
    setSelectedNode(null);
  };

  const getPercentage = (usageString) => {
    if (!usageString || usageString === 'N/A') return '0%';
    const parts = usageString.split(' / ');
    if (parts.length < 2) return '0%';
    const used = parseFloat(parts[0]);
    const total = parseFloat(parts[1]);
    if (isNaN(used) || isNaN(total) || total === 0) return '0%';
    return `${Math.min(Math.round((used / total) * 100), 100)}%`;
  };

  return (
    <div className="flex h-screen w-screen bg-[#0a0a0a] overflow-hidden text-white font-sans">
      
      {/* META DATA */}
      <aside className="w-96 bg-[#141414] flex flex-col shadow-[20px_0_50px_rgba(0,0,0,0.5)] z-20 border-r border-white/10">
        <div className="p-6 border-b border-white/5 bg-[#1a1a1a]/80">
          <h1 className="text-xl font-bold tracking-tight text-white italic">InfraLens</h1>
          <p className="text-[10px] text-blue-500 uppercase tracking-[0.3em] font-black">Node Explorer</p>
        </div>

        <div className="flex-grow p-6 overflow-y-auto custom-scrollbar bg-[#141414]">
          {selectedNode ? (
            <div className="space-y-8 animate-in fade-in slide-in-from-left-8 duration-500">
              {/* Node Header */}
              <div className="p-5 bg-gradient-to-br from-blue-500/10 to-transparent border border-blue-500/20 rounded-2xl">
                <h2 className="text-blue-400 text-[10px] font-black uppercase tracking-[0.2em] mb-1">Active Selection</h2>
                <h3 className="text-2xl font-bold tracking-tight leading-none">{selectedNode.data.label}</h3>
                <p className="text-[10px] text-gray-500 mt-3 font-mono opacity-50 uppercase tracking-widest">
                  {selectedNode.data.vmid ? `VMID: ${selectedNode.data.vmid}` : `UID: ${selectedNode.id}`}
                </p>
              </div>

              {/* Resource Usage Monitoring */}
              <div className="space-y-6">
                <h4 className="text-[10px] uppercase tracking-[0.2em] text-gray-500 font-black flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-blue-500 rounded-full shadow-[0_0_8px_rgba(59,130,246,0.8)]"></span> Real-time telemetry
                </h4>
                
                {/* CPU */}
                <div className="space-y-2">
                  <div className="flex justify-between text-[11px] font-mono">
                    <span className="text-gray-400 uppercase tracking-wider">CPU Intensity</span>
                    <span className="text-blue-400 font-bold">{selectedNode.data.cpu || '0%'}</span>
                  </div>
                  <div className="w-full bg-white/5 h-2 rounded-full overflow-hidden border border-white/5">
                    <div 
                      className="bg-blue-500 h-full rounded-full transition-all duration-1000 ease-in-out" 
                      style={{ width: selectedNode.data.cpu || '0%' }}
                    ></div>
                  </div>
                </div>

                {/* RAM */}
                <div className="space-y-2">
                  <div className="flex justify-between text-[11px] font-mono">
                    <span className="text-gray-400 uppercase tracking-wider">Memory allocation</span>
                    <span className="text-purple-400 font-bold">{selectedNode.data.ram?.split(' / ')[0] || '0MB'}</span>
                  </div>
                  <div className="w-full bg-white/5 h-2 rounded-full overflow-hidden border border-white/5">
                    <div 
                      className="bg-purple-500 h-full rounded-full transition-all duration-1000 ease-in-out" 
                      style={{ width: getPercentage(selectedNode.data.ram) }}
                    ></div>
                  </div>
                  <div className="flex justify-end text-[9px] text-gray-600 font-mono tracking-tighter">
                    Limit: {selectedNode.data.ram?.split(' / ')[1] || 'N/A'}
                  </div>
                </div>

                {/* STORAGE */}
                <div className="space-y-2">
                  <div className="flex justify-between text-[11px] font-mono">
                    <span className="text-gray-400 uppercase tracking-wider">Storage Capacity</span>
                    <span className="text-cyan-400 font-bold">{selectedNode.data.disk?.split(' / ')[0] || '0GB'}</span>
                  </div>
                  <div className="w-full bg-white/5 h-2 rounded-full overflow-hidden border border-white/5">
                    <div 
                      className="bg-cyan-500 h-full rounded-full transition-all duration-1000 ease-in-out" 
                      style={{ width: getPercentage(selectedNode.data.disk) }}
                    ></div>
                  </div>
                  <div className="flex justify-end text-[9px] text-gray-600 font-mono tracking-tighter">
                    Limit: {selectedNode.data.disk?.split(' / ')[1] || 'N/A'}
                  </div>
                </div>

              </div>

              <div className="space-y-4">
                <h4 className="text-[10px] uppercase tracking-[0.2em] text-gray-500 font-black flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span> Core Metadata
                </h4>
                <div className="grid grid-cols-1 gap-2">
                  {[
                    { label: 'Network IP', value: selectedNode.data.ip, color: 'text-gray-200' },
                    // 🚀 FIXED: Dynamic Status Color in the Sidebar
                    { 
                      label: 'State', 
                      value: selectedNode.data.status, 
                      color: (selectedNode.data.status === 'running' || selectedNode.data.status === 'online') 
                        ? 'text-green-400 uppercase font-bold' 
                        : 'text-red-500 uppercase font-bold' 
                    },
                    { label: 'Platform', value: selectedNode.data.os, color: 'text-gray-300' },
                    { label: 'Uptime', value: selectedNode.data.uptime, color: 'text-gray-300 font-mono' },
                    { label: 'Traffic In', value: selectedNode.data.net_in, color: 'text-gray-400 font-mono' },
                    { label: 'Traffic Out', value: selectedNode.data.net_out, color: 'text-gray-400 font-mono' },
                  ].map((item, idx) => (
                    <div key={idx} className="flex justify-between items-center p-3.5 bg-white/[0.03] border border-white/5 rounded-xl hover:bg-white/[0.05] transition-colors">
                      <span className="text-[9px] uppercase text-gray-500 font-black tracking-widest">{item.label}</span>
                      <span className={`text-[11px] font-mono ${item.color}`}>{item.value || '---'}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-4 bg-white/5 rounded-xl border border-dashed border-white/10">
                <p className="text-xs text-gray-400 leading-relaxed italic font-serif">
                  {selectedNode.data.details || 'No system notes provided for this node.'}
                </p>
              </div>

              <button 
                onClick={() => setSelectedNode(null)}
                className="w-full py-4 bg-[#1a1a1a] hover:bg-white/5 rounded-2xl border border-white/5 transition-all text-[9px] uppercase tracking-[0.4em] font-black text-gray-500 hover:text-white mt-4 cursor-pointer"
              >
                Close Inspector
              </button>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center p-10 opacity-30">
              <div className="relative mb-6">
                <div className="w-20 h-20 border-2 border-dashed border-blue-500/50 rounded-full animate-[spin_15s_linear_infinite]"></div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-3 h-3 bg-blue-500 rounded-full animate-pulse shadow-[0_0_15px_rgba(59,130,246,1)]"></div>
                </div>
              </div>
              <p className="text-[10px] uppercase tracking-[0.4em] font-black leading-loose">
                Select infrastructure<br/>node to inspect
              </p>
            </div>
          )}
        </div>

        <div className="p-6 bg-[#0a0a0a] border-t border-white/10 shadow-[0_-10px_40px_rgba(0,0,0,0.8)]">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
              <span className="text-[10px] text-gray-400 uppercase font-black tracking-[0.2em]">AI Intelligence</span>
            </div>
          </div>
          <div className="relative">
            <input 
              disabled 
              placeholder="Querying infrastructure..." 
              className="w-full bg-[#141414] border border-white/10 rounded-2xl p-4 text-xs text-gray-600 cursor-not-allowed italic pr-12 focus:outline-none"
            />
            <div className="absolute right-4 top-1/2 -translate-y-1/2">
               <div className="w-4 h-4 border-2 border-gray-800 border-t-gray-600 rounded-full animate-spin"></div>
            </div>
          </div>
        </div>
      </aside>

      {/* VISUALIZER SECTION */}
      <main className="relative flex-grow h-full bg-[#0d0d0d]">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <div className="flex flex-col items-center gap-4">
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
              <p className="text-gray-500 animate-pulse font-mono text-xs uppercase tracking-widest text-center">
                Syncing with M720q...
              </p>
            </div>
          </div>
        ) : (
          <div className="h-full w-full">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              onNodeClick={onNodeClick}
              onPaneClick={onPaneClick}
              fitView
              defaultEdgeOptions={{ animated: true }}
            >
              <Background color="#1a1a1a" gap={20} variant="dots" />
              <Controls className="bg-[#1a1a1a] border-white/10 fill-white" />
            </ReactFlow>
          </div>
        )}

        {/* Floating Lab Status Bar */}
        <div className="absolute top-6 right-6 z-10 flex gap-6 bg-black/80 backdrop-blur-md p-4 rounded-xl border border-white/10 shadow-2xl">
          <div className="flex flex-col">
            <span className="text-[10px] uppercase tracking-widest text-gray-500 font-bold">Host Node</span>
            <span className="text-sm font-mono text-blue-400 tracking-tighter">192.168.178.50</span>
          </div>
          <div className="flex flex-col border-l border-white/10 pl-6">
            <span className="text-[10px] uppercase tracking-widest text-gray-500 font-bold">Containers</span>
            <span className="text-sm font-mono text-green-400">{nodes.length > 0 ? nodes.length - 1 : 0} Active</span>
          </div>
        </div>
      </main>

    </div>
  );
}

export default App;