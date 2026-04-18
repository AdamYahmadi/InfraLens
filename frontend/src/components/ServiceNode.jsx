import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { Server, ShieldCheck, HardDrive, Globe, Activity } from 'lucide-react';

const icons = {
  pihole: <ShieldCheck size={18} className="text-green-400" />,
  nextcloud: <HardDrive size={18} className="text-blue-400" />,
  tailscale: <Globe size={18} className="text-purple-400" />,
  default: <Server size={18} className="text-gray-400" />
};

export default function ServiceNode({ data }) {
  return (
    <div className="px-4 py-3 shadow-2xl rounded-xl bg-[#1e1e1e] border border-[#333] min-w-[180px] hover:border-blue-500/50 transition-colors">
      <div className="flex items-center">
        <div className="rounded-lg p-2 bg-[#121212] border border-[#333]">
          {icons[data.icon] || icons.default}
        </div>
        
        <div className="ml-3 flex-grow">
          <div className="text-xs font-bold text-white tracking-wide">{data.label}</div>
          <div className="text-[10px] text-gray-500 font-mono uppercase">{data.status || 'Active'}</div>
        </div>

        {/* Status indicator dot */}
        <div className={`h-2 w-2 rounded-full ${data.status === 'offline' ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]' : 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]'}`} />
      </div>

      {/* Connection points (handles) */}
      <Handle type="target" position={Position.Top} className="w-2 h-2 !bg-blue-600 border-none" />
      <Handle type="source" position={Position.Bottom} className="w-2 h-2 !bg-blue-600 border-none" />
    </div>
  );
}