import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { Server, ShieldCheck, HardDrive, Globe, Activity, LayoutTemplate, Database } from 'lucide-react';

const iconMap = {
  dns: <ShieldCheck size={16} className="text-emerald-600 dark:text-emerald-400" />,
  security: <ShieldCheck size={16} className="text-emerald-600 dark:text-emerald-400" />,
  storage: <HardDrive size={16} className="text-sky-600 dark:text-sky-400" />,
  network: <Globe size={16} className="text-indigo-600 dark:text-indigo-400" />,
  dashboard: <Activity size={16} className="text-rose-600 dark:text-rose-400" />,
  docker: <LayoutTemplate size={16} className="text-cyan-600 dark:text-cyan-400" />,
  database: <Database size={16} className="text-amber-600 dark:text-amber-400" />,
  host: <Server size={16} className="text-zinc-500 dark:text-zinc-400" />
};

const getIcon = (tags, label) => {
  if (tags && tags.length > 0) {
    for (let tag of tags) {
      const lowerTag = tag.toLowerCase();
      if (iconMap[lowerTag]) return iconMap[lowerTag];
    }
  }
  
  const lowerLabel = (label || '').toLowerCase();
  
  if (lowerLabel.includes('pihole') || lowerLabel.includes('adguard') || lowerLabel.includes('dns')) return iconMap.dns;
  if (lowerLabel.includes('cloud') || lowerLabel.includes('nas') || lowerLabel.includes('storage') || lowerLabel.includes('smb')) return iconMap.storage;
  if (lowerLabel.includes('vpn') || lowerLabel.includes('tailscale') || lowerLabel.includes('wireguard') || lowerLabel.includes('proxy')) return iconMap.network;
  if (lowerLabel.includes('dash') || lowerLabel.includes('home') || lowerLabel.includes('monitor')) return iconMap.dashboard;
  if (lowerLabel.includes('db') || lowerLabel.includes('sql') || lowerLabel.includes('redis') || lowerLabel.includes('mongo')) return iconMap.database;
  if (lowerLabel.includes('pve') || lowerLabel.includes('proxmox') || lowerLabel.includes('node') || lowerLabel.includes('host')) return iconMap.host;
  
  return <Server size={16} className="text-zinc-400 dark:text-zinc-500" />;
};

export default function ServiceNode({ data, selected }) {
  const isOnline = data.status?.toLowerCase() === 'running' || data.status?.toLowerCase() === 'online';

  const statusColor = isOnline ? 'bg-emerald-500' : 'bg-rose-500';
  const opacity = isOnline ? 'opacity-100' : 'opacity-60';

  const borderStyle = selected 
    ? 'border-zinc-400 dark:border-zinc-400 bg-white dark:bg-zinc-800 shadow-lg' 
    : 'border-zinc-200 dark:border-white/5 bg-zinc-50 dark:bg-zinc-900/60 hover:border-zinc-300 dark:hover:border-white/10 hover:bg-white dark:hover:bg-zinc-900/80';

  return (
    <div className={`px-4 py-2.5 rounded-xl backdrop-blur-md border transition-all duration-200 min-w-[160px] flex items-center justify-between gap-4 ${borderStyle}`}>
      
      <Handle type="target" position={Position.Left} className="opacity-0 w-0 h-0" />

      <div className="flex items-center gap-3">
        <div className={`rounded-md p-1.5 bg-zinc-100 dark:bg-zinc-950/50 border border-zinc-200 dark:border-white/5 ${opacity}`}>
          {getIcon(data.tags, data.label)}
        </div>
        
        <div className={`flex flex-col justify-center ${opacity}`}>
          <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100 leading-none">{data.label}</div>
          <div className="text-[10px] text-zinc-500 capitalize mt-1 leading-none">
            {data.status || 'Unknown'}
          </div>
        </div>
      </div>

      <div className={`h-2 w-2 rounded-full shrink-0 ${statusColor} ${opacity}`} />

      <Handle type="source" position={Position.Right} className="opacity-0 w-0 h-0" />
    </div>
  );
}