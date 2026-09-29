import React, { useEffect, useState } from 'react';
import { Signal } from '../types/api.types';
import { fetchSignals } from '../lib/api';
import { Loader2, AlertCircle, RefreshCw, Layers } from 'lucide-react';

function getProjectBadgeStyle(projectId: string): string {
  switch (projectId) {
    case 'northwind':
      return 'bg-blue-500/10 text-blue-400 border-blue-500/30';
    case 'harborline':
      return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
    case 'atlas':
      return 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30';
    case 'quill':
      return 'bg-purple-500/10 text-purple-400 border-purple-500/30';
    case 'studio_ops':
      return 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30';
    case 'internal_unsorted':
    default:
      return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
  }
}

function deriveSignalState(signal: Signal): string {
  if (signal.status && Object.keys(signal.status).length > 0) {
    const firstStatus = Object.values(signal.status)[0];
    if (firstStatus?.state) return firstStatus.state;
  }
  if (signal.projects && signal.projects.includes('internal_unsorted')) {
    return 'unrouted';
  }
  return 'pending';
}

interface RecentSignalsProps {
  refreshKey?: number;
}

export const RecentSignals: React.FC<RecentSignalsProps> = ({ refreshKey }) => {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadSignals = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchSignals();
      setSignals(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load signals from backend.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadSignals();
  }, [refreshKey]);

  return (
    <section className="flex flex-col gap-3">
      {/* Section Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-white">Recent signals in ledger</h2>
          {!isLoading && !error && (
            <span className="text-[11px] font-mono text-slate-400 px-1.5 py-0.5 rounded bg-slate-800/80 border border-slate-700/50">
              {signals.length} {signals.length === 1 ? 'signal' : 'signals'}
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={loadSignals}
          disabled={isLoading}
          className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors disabled:opacity-50 cursor-pointer"
          title="Refresh ledger signals"
        >
          <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
          <span className="font-mono text-[11px]">Refresh</span>
        </button>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="rounded-lg border border-slate-800 bg-[#0f1724] p-8 flex flex-col items-center justify-center gap-3 text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin text-indigo-400" />
          <span className="text-xs font-mono">Loading signals from backend ledger...</span>
        </div>
      )}

      {/* Error State */}
      {!isLoading && error && (
        <div className="rounded-lg border border-rose-800/40 bg-rose-950/20 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-rose-300">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
            <div className="flex flex-col gap-0.5">
              <span className="font-semibold">Unable to reach backend:</span>
              <span className="text-slate-400 text-[11px]">{error}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={loadSignals}
            className="px-3 py-1 bg-rose-900/50 hover:bg-rose-900 border border-rose-700/60 rounded text-xs font-medium text-rose-200 transition-colors self-start sm:self-auto cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && !error && signals.length === 0 && (
        <div className="rounded-lg border border-slate-800 bg-[#0f1724] p-8 flex flex-col items-center justify-center gap-2 text-center text-slate-400">
          <Layers className="w-6 h-6 text-slate-600" />
          <span className="text-xs font-medium text-slate-300">No signals found in ledger</span>
          <span className="text-[11px] text-slate-500">
            Incoming research signals will appear here once created.
          </span>
        </div>
      )}

      {/* Signal Rows (Showing latest 10 signals) */}
      {!isLoading && !error && signals.length > 0 && (
        <div className="rounded-lg border border-slate-800 bg-[#0f1724] overflow-hidden divide-y divide-slate-800/80 text-xs shadow-sm">
          {signals.slice(0, 10).map((signal) => {
            const project = signal.projects?.[0] || 'internal_unsorted';
            const state = deriveSignalState(signal);

            return (
              <div
                key={signal.id}
                className="p-3.5 sm:px-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 hover:bg-slate-800/25 transition-colors"
              >
                <div className="flex flex-col gap-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-slate-200 text-sm truncate max-w-md">
                      {signal.title || 'Untitled Signal'}
                    </span>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-mono border ${getProjectBadgeStyle(
                        project
                      )}`}
                    >
                      {project}
                    </span>
                    <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-slate-800/60 text-slate-400 border border-slate-700/40">
                      {signal.type}
                    </span>
                  </div>
                  <span className="font-mono text-[11px] text-slate-500 truncate">
                    {signal.id}
                  </span>
                </div>

                <div className="flex items-center gap-3 shrink-0 text-slate-400 text-xs self-start sm:self-auto">
                  <span className="text-slate-500 font-mono text-[11px]">
                    {signal.date || signal.detected_on}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded font-mono text-[11px] ${
                      state === 'analyzed'
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : state === 'pending'
                        ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {state}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};
