import React from 'react';
import { RoutingResult, MatchEvidence } from '../types/api.types';
import { CheckCircle2, AlertTriangle, HelpCircle, X, ShieldAlert, Tag, ArrowRight } from 'lucide-react';

interface RoutingPreviewProps {
  result: RoutingResult | null;
  onClear: () => void;
}

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

function formatMatchMethod(method: string): string {
  switch (method) {
    case 'routing_hint_keyword':
      return 'Routing Hint (Keyword)';
    case 'routing_hint_domain':
      return 'Routing Hint (Domain)';
    case 'project_domain':
      return 'Project Domain Match';
    case 'project_keyword':
      return 'Project Keyword Match';
    case 'ambiguous':
      return 'Ambiguous Match (Multiple Projects)';
    case 'fallback_unrouted':
      return 'Unrouted Fallback';
    default:
      return method;
  }
}

export const RoutingPreview: React.FC<RoutingPreviewProps> = ({ result, onClear }) => {
  if (!result) return null;

  const isMatched = result.outcome === 'MATCHED';
  const isAmbiguous = result.outcome === 'AMBIGUOUS';
  const isUnrouted = result.outcome === 'UNROUTED';

  return (
    <div className="rounded-lg border border-slate-700/80 bg-[#0d131f] p-5 flex flex-col gap-4 shadow-md transition-all">
      {/* Header Row */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2.5">
          {isMatched && (
            <span className="flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Project Matched</span>
            </span>
          )}
          {isAmbiguous && (
            <span className="flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Ambiguous Match</span>
            </span>
          )}
          {isUnrouted && (
            <span className="flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-semibold bg-slate-500/15 text-slate-300 border border-slate-500/30">
              <HelpCircle className="w-3.5 h-3.5" />
              <span>No Match (Fallback)</span>
            </span>
          )}

          <span className="text-xs text-slate-400 font-mono">Routing preview result</span>
        </div>

        <button
          type="button"
          onClick={onClear}
          className="text-slate-400 hover:text-slate-200 p-1 rounded hover:bg-slate-800/60 transition-colors"
          title="Dismiss preview"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Main Routing Details */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Assigned Project */}
        <div className="bg-[#090d14] border border-slate-800/80 rounded p-3 flex flex-col gap-1.5">
          <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">
            Assigned Project
          </span>
          <div className="flex items-center gap-2">
            <span
              className={`px-2.5 py-1 rounded text-xs font-mono font-semibold border ${getProjectBadgeStyle(
                result.projectId
              )}`}
            >
              {result.projectId}
            </span>
            {result.fallbackApplied && (
              <span className="text-[11px] text-amber-400/90 font-mono">
                (fallback applied)
              </span>
            )}
          </div>
        </div>

        {/* Match Method */}
        <div className="bg-[#090d14] border border-slate-800/80 rounded p-3 flex flex-col gap-1.5">
          <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">
            Routing Method
          </span>
          <span className="text-xs font-medium text-slate-200">
            {formatMatchMethod(result.matchMethod)}
          </span>
        </div>
      </div>

      {/* Ambiguity breakdown if applicable */}
      {result.isAmbiguous && result.candidateProjects.length > 0 && (
        <div className="bg-amber-950/20 border border-amber-800/40 rounded p-3 flex flex-col gap-1.5 text-xs">
          <span className="font-semibold text-amber-300">Conflicting Project Matches:</span>
          <div className="flex items-center gap-1.5 flex-wrap">
            {result.candidateProjects.map((proj) => (
              <span
                key={proj}
                className="px-2 py-0.5 rounded font-mono text-[11px] bg-amber-500/10 text-amber-300 border border-amber-500/20"
              >
                {proj}
              </span>
            ))}
          </div>
          <span className="text-slate-400 text-[11px]">
            Because multiple projects matched, the signal is safely assigned to{' '}
            <code className="font-mono text-amber-300">{result.projectId}</code> until reviewed.
          </span>
        </div>
      )}

      {/* Evidence list */}
      {result.evidence.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">
            Match Evidence ({result.evidence.length})
          </span>
          <div className="flex flex-wrap gap-1.5">
            {result.evidence.map((ev: MatchEvidence, idx: number) => (
              <span
                key={idx}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs bg-slate-900 border border-slate-800 text-slate-300 font-mono"
              >
                <Tag className="w-3 h-3 text-indigo-400" />
                <span>&quot;{ev.matchedTerm}&quot;</span>
                <span className="text-slate-500 text-[10px]">({ev.matchType})</span>
                <ArrowRight className="w-2.5 h-2.5 text-slate-500" />
                <span className="text-indigo-300">{ev.projectId}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Invalid hint diagnostic warning if any */}
      {result.invalidHints.length > 0 && (
        <div className="bg-rose-950/20 border border-rose-800/40 rounded p-3 flex flex-col gap-1 text-xs">
          <div className="flex items-center gap-1.5 text-rose-300 font-semibold">
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>Invalid Hint Diagnostic:</span>
          </div>
          {result.invalidHints.map((ih, idx) => (
            <span key={idx} className="text-slate-300 text-[11px]">
              Hint &quot;{ih.hint.match}&quot; references non-existent project &quot;
              {ih.referencedProjectId}&quot;. Safely isolated and ignored.
            </span>
          ))}
        </div>
      )}

      {/* Disclaimer Banner */}
      <div className="text-[11px] text-slate-500 border-t border-slate-800/80 pt-2 flex items-center justify-between">
        <span>Preview only: No signal has been created and the ledger is untouched.</span>
      </div>
    </div>
  );
};
