import React, { useEffect, useState, useMemo } from 'react';
import { Signal, CandidateWorkItem } from '../types/api.types';
import { fetchSignals, previewCandidateWork } from '../lib/api';
import { CandidateWorkPreview } from './CandidateWorkPreview';
import { Loader2, AlertCircle, RefreshCw, Inbox, Sparkles, Clock, X } from 'lucide-react';

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

function getSignalStatus(signal: Signal): string | null {
  if (signal.status && Object.keys(signal.status).length > 0) {
    const firstStatus = Object.values(signal.status)[0];
    if (firstStatus?.state) {
      return firstStatus.state.toLowerCase();
    }
  }

  if (signal.type === 'research') {
    return 'intake';
  }

  return null;
}

function getSignalStatusBadge(signal: Signal): { label: string; style: string } | null {
  const status = getSignalStatus(signal);
  if (!status) return null;

  switch (status) {
    case 'analyzed':
      return { label: 'analyzed', style: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' };
    case 'pending':
      return { label: 'pending', style: 'bg-amber-500/10 text-amber-400 border-amber-500/30' };
    case 'intake':
      return { label: 'intake', style: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30' };
    default:
      return { label: status, style: 'bg-slate-800 text-slate-300 border-slate-700/60' };
  }
}

interface RecentSignalsProps {
  refreshKey?: number;
}

export const RecentSignals: React.FC<RecentSignalsProps> = ({ refreshKey }) => {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Client-side filter states
  const [selectedProject, setSelectedProject] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedType, setSelectedType] = useState<string>('all');

  // Candidate work preview state
  const [activeSignal, setActiveSignal] = useState<{ id: string; title: string } | null>(null);
  const [candidates, setCandidates] = useState<CandidateWorkItem[] | null>(null);
  const [isLoadingCandidates, setIsLoadingCandidates] = useState<boolean>(false);
  const [candidateError, setCandidateError] = useState<string | null>(null);

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

  // Derive unique filter options from currently loaded signals
  const availableProjects = useMemo(() => {
    const set = new Set<string>();
    signals.forEach((s) => {
      (s.projects || []).forEach((p) => {
        if (p) set.add(p);
      });
    });
    return Array.from(set).sort();
  }, [signals]);

  const availableStatuses = useMemo(() => {
    const set = new Set<string>();
    signals.forEach((s) => {
      const status = getSignalStatus(s);
      if (status) set.add(status);
    });
    return Array.from(set).sort();
  }, [signals]);

  const availableTypes = useMemo(() => {
    const set = new Set<string>();
    signals.forEach((s) => {
      if (s.type) set.add(s.type);
    });
    return Array.from(set).sort();
  }, [signals]);

  const isFilterActive = selectedProject !== 'all' || selectedStatus !== 'all' || selectedType !== 'all';

  const handleClearFilters = () => {
    setSelectedProject('all');
    setSelectedStatus('all');
    setSelectedType('all');
  };

  // Filter and sort signals client-side (newest first)
  const filteredSignals = useMemo(() => {
    return [...signals]
      .sort((a, b) => {
        const keyA = `${a.date || a.detected_on || ''} ${a.time || ''}`;
        const keyB = `${b.date || b.detected_on || ''} ${b.time || ''}`;
        return keyB.localeCompare(keyA);
      })
      .filter((signal) => {
        // Project filter
        if (selectedProject !== 'all') {
          const projects = signal.projects || [];
          if (!projects.includes(selectedProject)) {
            return false;
          }
        }

        // Status filter
        if (selectedStatus !== 'all') {
          const status = getSignalStatus(signal);
          if (status !== selectedStatus) {
            return false;
          }
        }

        // Type filter
        if (selectedType !== 'all') {
          if (signal.type !== selectedType) {
            return false;
          }
        }

        return true;
      });
  }, [signals, selectedProject, selectedStatus, selectedType]);

  const handlePreviewCandidateWork = async (signal: Signal) => {
    // If clicking the currently active signal that is already loaded, toggle off
    if (activeSignal?.id === signal.id && candidates !== null && !isLoadingCandidates) {
      setActiveSignal(null);
      setCandidates(null);
      setCandidateError(null);
      return;
    }

    setActiveSignal({ id: signal.id, title: signal.title || 'Untitled Signal' });
    setIsLoadingCandidates(true);
    setCandidateError(null);
    setCandidates(null);

    try {
      const result = await previewCandidateWork(signal.id);
      setCandidates(result.candidates || []);
    } catch (err: any) {
      setCandidateError(err.message || 'Could not generate candidate work preview.');
    } finally {
      setIsLoadingCandidates(false);
    }
  };

  const handleCloseCandidatePreview = () => {
    setActiveSignal(null);
    setCandidates(null);
    setCandidateError(null);
  };

  return (
    <section className="flex flex-col gap-3">
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 pb-1">
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-white tracking-tight">Inbox</h2>
            {!isLoading && !error && (
              <span className="text-[11px] font-mono text-slate-400 px-2 py-0.5 rounded bg-slate-800/80 border border-slate-700/50">
                {filteredSignals.length} {filteredSignals.length === 1 ? 'item' : 'items'}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400">
            Signals detected from research intake and internal sources.
          </p>
        </div>

        <button
          type="button"
          onClick={loadSignals}
          disabled={isLoading}
          className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors disabled:opacity-50 cursor-pointer self-start sm:self-center"
          title="Refresh inbox signals"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          <span className="font-mono text-[11px]">Refresh</span>
        </button>
      </div>

      {/* Filter Toolbar */}
      {!isLoading && !error && signals.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-lg bg-[#0f1724] border border-slate-800 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            {/* Project Filter */}
            <select
              id="inbox-project-filter"
              aria-label="Filter by project"
              value={selectedProject}
              onChange={(e) => setSelectedProject(e.target.value)}
              className="bg-slate-900 text-slate-300 border border-slate-700/70 rounded px-2.5 py-1 text-xs font-mono focus:outline-none focus:border-indigo-500 cursor-pointer"
            >
              <option value="all">All projects</option>
              {availableProjects.map((project) => (
                <option key={project} value={project}>
                  {project}
                </option>
              ))}
            </select>

            {/* Status Filter */}
            <select
              id="inbox-status-filter"
              aria-label="Filter by status"
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="bg-slate-900 text-slate-300 border border-slate-700/70 rounded px-2.5 py-1 text-xs font-mono focus:outline-none focus:border-indigo-500 cursor-pointer capitalize"
            >
              <option value="all">All statuses</option>
              {availableStatuses.map((status) => (
                <option key={status} value={status} className="capitalize">
                  {status}
                </option>
              ))}
            </select>

            {/* Type Filter */}
            <select
              id="inbox-type-filter"
              aria-label="Filter by type"
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="bg-slate-900 text-slate-300 border border-slate-700/70 rounded px-2.5 py-1 text-xs font-mono focus:outline-none focus:border-indigo-500 cursor-pointer capitalize"
            >
              <option value="all">All types</option>
              {availableTypes.map((type) => (
                <option key={type} value={type} className="capitalize">
                  {type}
                </option>
              ))}
            </select>
          </div>

          {/* Clear filters button */}
          {isFilterActive && (
            <button
              type="button"
              onClick={handleClearFilters}
              className="inline-flex items-center gap-1 text-[11px] font-mono text-indigo-400 hover:text-indigo-300 px-2 py-0.5 rounded border border-indigo-500/30 bg-indigo-500/10 hover:bg-indigo-500/20 transition-colors cursor-pointer"
            >
              <X className="w-3 h-3" />
              <span>Clear filters</span>
            </button>
          )}
        </div>
      )}

      {/* Candidate Work Preview Panel (Rendered when a signal is active) */}
      {activeSignal && (
        <CandidateWorkPreview
          signalId={activeSignal.id}
          signalTitle={activeSignal.title}
          candidates={candidates}
          isLoading={isLoadingCandidates}
          error={candidateError}
          onClose={handleCloseCandidatePreview}
        />
      )}

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

      {/* Empty State: No signals in backend ledger */}
      {!isLoading && !error && signals.length === 0 && (
        <div className="rounded-lg border border-slate-800 bg-[#0f1724] p-8 flex flex-col items-center justify-center gap-2 text-center text-slate-400">
          <Inbox className="w-6 h-6 text-slate-600" />
          <span className="text-xs font-medium text-slate-300">No signals found in inbox</span>
          <span className="text-[11px] text-slate-500">
            Incoming research signals will appear here once created.
          </span>
        </div>
      )}

      {/* Empty State: Filters returned no matching signals */}
      {!isLoading && !error && signals.length > 0 && filteredSignals.length === 0 && (
        <div className="rounded-lg border border-slate-800 bg-[#0f1724] p-8 flex flex-col items-center justify-center gap-2 text-center text-slate-400">
          <Inbox className="w-6 h-6 text-slate-600" />
          <span className="text-xs font-medium text-slate-300">No signals match these filters.</span>
          <button
            type="button"
            onClick={handleClearFilters}
            className="mt-1 inline-flex items-center gap-1 text-xs font-mono text-indigo-400 hover:text-indigo-300 px-2.5 py-1 rounded border border-indigo-500/30 bg-indigo-500/10 hover:bg-indigo-500/20 transition-colors cursor-pointer"
          >
            <X className="w-3 h-3" />
            <span>Clear filters</span>
          </button>
        </div>
      )}

      {/* Signal Rows (Showing filtered signals, newest first) */}
      {!isLoading && !error && filteredSignals.length > 0 && (
        <div className="rounded-lg border border-slate-800 bg-[#0f1724] overflow-hidden divide-y divide-slate-800/80 text-xs shadow-sm">
          {filteredSignals.map((signal) => {
            const project = signal.projects?.[0] || 'internal_unsorted';
            const statusBadge = getSignalStatusBadge(signal);
            const isSelected = activeSignal?.id === signal.id;
            const dateDisplay = signal.date || signal.detected_on;
            const timeDisplay = signal.time;

            return (
              <div
                key={signal.id}
                className={`p-3.5 sm:px-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors ${
                  isSelected ? 'bg-indigo-950/20 border-l-2 border-indigo-500' : 'hover:bg-slate-800/25'
                }`}
              >
                {/* Left Column: Title & Metadata */}
                <div className="flex flex-col gap-1.5 min-w-0 flex-1">
                  {/* Signal Title (Strongest typography) */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-slate-100 text-sm leading-snug">
                      {signal.title || 'Untitled Signal'}
                    </span>
                  </div>

                  {/* Metadata Badges Row */}
                  <div className="flex items-center gap-2 flex-wrap text-slate-400">
                    {/* Project Badge */}
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-mono font-medium border ${getProjectBadgeStyle(
                        project
                      )}`}
                    >
                      {project}
                    </span>

                    {/* Signal Type Label */}
                    <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-slate-800/80 text-slate-400 border border-slate-700/50">
                      {signal.type}
                    </span>

                    {/* Status Indicator / Badge */}
                    {statusBadge && (
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-mono uppercase border ${statusBadge.style}`}
                      >
                        {statusBadge.label}
                      </span>
                    )}

                    {/* Signal ID */}
                    <span className="font-mono text-[10px] text-slate-500 truncate max-w-xs">
                      {signal.id}
                    </span>
                  </div>
                </div>

                {/* Right Column: Time & Candidate Action */}
                <div className="flex items-center gap-3 shrink-0 self-start sm:self-center flex-wrap">
                  {/* Timestamp */}
                  <div className="flex items-center gap-1 text-slate-500 font-mono text-[11px]">
                    <Clock className="w-3 h-3 text-slate-600" />
                    <span>{dateDisplay}</span>
                    {timeDisplay && <span className="text-slate-600">&bull; {timeDisplay}</span>}
                  </div>

                  {/* Candidate Work Preview Trigger */}
                  <button
                    type="button"
                    onClick={() => handlePreviewCandidateWork(signal)}
                    disabled={isLoadingCandidates && isSelected}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded border text-xs font-medium transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-indigo-600 text-white border-indigo-500 shadow-sm'
                        : 'bg-slate-800/80 hover:bg-slate-800 text-slate-300 hover:text-white border-slate-700/70'
                    }`}
                    title="Preview candidate work items extracted from this signal"
                  >
                    {isLoadingCandidates && isSelected ? (
                      <>
                        <Loader2 className="w-3 h-3 animate-spin text-indigo-300" />
                        <span className="text-[11px]">Analyzing...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3 h-3 text-indigo-400" />
                        <span className="text-[11px]">Candidate work</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};
