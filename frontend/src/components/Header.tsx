import React from 'react';

export const Header: React.FC = () => {
  return (
    <header className="w-full border-b border-slate-800/80 bg-slate-950 sticky top-0 z-50">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 h-13 py-3 flex items-center justify-between">
        {/* Compact brand and section */}
        <div className="flex items-center gap-2.5">
          <span className="font-semibold text-sm tracking-tight text-white">Inbox</span>
          <span className="text-slate-600 text-xs">/</span>
          <span className="text-xs text-slate-400 font-medium">Research intake</span>
        </div>

        {/* Quiet status */}
        <div className="flex items-center gap-2 text-xs text-slate-400 font-mono">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          <span>Local &bull; Offline</span>
        </div>
      </div>
    </header>
  );
};
