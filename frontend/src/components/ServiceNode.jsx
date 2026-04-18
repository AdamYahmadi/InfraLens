import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { Server, ShieldCheck, HardDrive, Globe, Activity, LayoutTemplate } from 'lucide-react';

const iconMap = {
  dns: <ShieldCheck size={18} className="text-green-400" />,
  security: <ShieldCheck size={18} className="text-green-400" />,
  storage: <HardDrive size={18} className="text-blue-400" />,
  network: <Globe size={18} className="text-purple-400" />,
  dashboard: <Activity size={18} className="text-pink-400" />,
  docker: <LayoutTemplate size={18} className="text-cyan-400" />,
  host: <Server size={18} className="text-blue-500" />
};

// Check tags first
const getIcon = (tags, label) => {
  if (tags && tags.length > 0) {
    for (let tag of tags) {
      if (iconMap[tag]) return iconMap[tag];
    }
  }
  
  // Fallback 
  const lowerLabel = (label || '').toLowerCase();
  if (lowerLabel.includes('pihole')) return iconMap.dns;
  if (lowerLabel.includes('nextcloud')) return iconMap.storage;
  if (lowerLabel.includes('tailscale')) return iconMap.network;
  if (lowerLabel.includes('homepage')) return iconMap.dashboard;
  if (lowerLabel.includes('adamlab')) return iconMap.host;
  return <Server size={18} className="text-gray-400" />;
};

export default function ServiceNode({ data, selected }) {
  const isOnline = data.status === 'running' || data.status === 'online';

  const dotColor = isOnline 
    ? 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.6)]' 
    : 'bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.6)]';
    
  const statusTextColor = isOnline ? 'text-gray-500' : 'text-red-400/80';
  const opacity = isOnline ? 'opacity-100' : 'opacity-50';

  const borderStyle = selected 
    ? 'border-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.2)]' 
    : 'border-[#333] hover:border-blue-500/50';

  return (
    <div className={`px-4 py-3 shadow-2xl rounded-xl bg-[#1e1e1e] border transition-all duration-300 min-w-[180px] ${borderStyle}`}>
      
      <Handle type="target" position={Position.Top} className="opacity-0 w-0 h-0" />

      <div className="flex items-center">
        <div className={`rounded-lg p-2 bg-[#121212] border border-[#333] ${opacity} transition-opacity`}>
          {getIcon(data.tags, data.label)}
        </div>
        
        <div className={`ml-3 flex-grow ${opacity} transition-opacity`}>
          <div className="text-xs font-bold text-white tracking-wide">{data.label}</div>
          <div className={`text-[10px] font-mono uppercase mt-0.5 ${statusTextColor}`}>
            {data.status || 'Unknown'}
          </div>
        </div>

        <div className={`h-2 w-2 rounded-full transition-colors duration-500 ml-3 ${dotColor}`} />
      </div>

      {/* Render Proxmox Tags as UI Pills */}
      {data.tags && data.tags.length > 0 && data.tags[0] !== 'host' && (
        <div className={`flex gap-1.5 mt-3 flex-wrap ${opacity}`}>
          {data.tags.map((tag) => (
            <span key={tag} className="px-1.5 py-0.5 rounded bg-[#111] text-[8px] uppercase tracking-widest text-gray-400 font-bold border border-white/10 shadow-inner">
              {tag}
            </span>
          ))}
        </div>
      )}

      <Handle type="source" position={Position.Bottom} className="opacity-0 w-0 h-0" />
    </div>
  );
}