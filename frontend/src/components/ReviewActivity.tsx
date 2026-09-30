import React, { useEffect, useState } from 'react';
import { CandidateReviewDecision } from '../types/api.types';
import { fetchCandidateReviews } from '../lib/api';
import {
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  AlertCircle,
  RefreshCw,
  FileCheck2,
  MessageSquareQuote,
} from 'lucide-react';

function formatDecidedTimestamp(isoString: string): string {
  try {
    const d = new Date(isoString);
    if (Number.isNaN(d.getTime())) return isoString;
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  } catch {
    return isoString;
  }
}

export const ReviewActivity: React.FC = () => {
  const [reviews, setReviews] = useState<CandidateReviewDecision[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadReviews = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchCandidateReviews();
      setReviews(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load review activity.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadReviews();
  }, []);

  // Sort most recent decisions first
  const sortedReviews = [...reviews].sort((a, b) => {
    const timeA = new Date(a.decided_at).getTime() || 0;
    const timeB = new Date(b.decided_at).getTime() || 0;
    return timeB - timeA;
  });

  return (
    <section className="flex flex-col gap-3">
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 pb-1">
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-white tracking-tight">Review activity</h2>
            {!isLoading && !error && (
              <span className="text-[11px] font-mono text-slate-400 px-2 py-0.5 rounded bg-slate-800/80 border border-slate-700/50">
                {reviews.length} {reviews.length === 1 ? 'decision' : 'decisions'}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400">
            Audit trail of human review decisions on candidate work items.
          </p>
        </div>

        <button
          type="button"
          onClick={loadReviews}
          disabled={isLoading}
          className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors disabled:opacity-50 cursor-pointer self-start sm:self-center"
          title="Refresh review activity"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          <span className="font-mono text-[11px]">Refresh</span>
        </button>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="rounded-lg border border-slate-800 bg-[#0f1724] p-8 flex flex-col items-center justify-center gap-3 text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin text-indigo-400" />
          <span className="text-xs font-mono">Loading review decisions from audit ledger...</span>
        </div>
      )}

      {/* Error State */}
      {!isLoading && error && (
        <div className="rounded-lg border border-rose-800/40 bg-rose-950/20 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-rose-300">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
            <div className="flex flex-col gap-0.5">
              <span className="font-semibold">Unable to reach review service:</span>
              <span className="text-slate-400 text-[11px]">{error}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={loadReviews}
            className="px-3 py-1 bg-rose-900/50 hover:bg-rose-900 border border-rose-700/60 rounded text-xs font-medium text-rose-200 transition-colors self-start sm:self-auto cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && !error && sortedReviews.length === 0 && (
        <div className="rounded-lg border border-slate-800 bg-[#0f1724] p-8 flex flex-col items-center justify-center gap-2 text-center text-slate-400">
          <ShieldCheck className="w-6 h-6 text-slate-600" />
          <span className="text-xs font-medium text-slate-300">No review decisions recorded yet</span>
          <span className="text-[11px] text-slate-500">
            Decisions made on candidate work items in the inbox will appear here.
          </span>
        </div>
      )}

      {/* Review Decision Items (Most recent first) */}
      {!isLoading && !error && sortedReviews.length > 0 && (
        <div className="rounded-lg border border-slate-800 bg-[#0f1724] overflow-hidden divide-y divide-slate-800/80 text-xs shadow-sm">
          {sortedReviews.map((review) => {
            const isApproved = review.decision === 'APPROVED';

            return (
              <div
                key={review.id}
                className="p-3.5 sm:px-4 flex flex-col gap-2.5 transition-colors hover:bg-slate-800/25"
              >
                {/* Header Row: Decision Badge, IDs & Timestamp */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Decision Badge */}
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono font-semibold border ${
                        isApproved
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                          : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                      }`}
                    >
                      {isApproved ? (
                        <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                      ) : (
                        <XCircle className="w-3 h-3 text-rose-400" />
                      )}
                      <span>{review.decision}</span>
                    </span>

                    {/* Candidate Work ID */}
                    <div className="flex items-center gap-1 font-mono text-slate-200 text-xs font-medium">
                      <FileCheck2 className="w-3.5 h-3.5 text-slate-500" />
                      <span className="truncate max-w-xs">{review.candidate_work_id}</span>
                    </div>
                  </div>

                  {/* Timestamp */}
                  <div className="flex items-center gap-1.5 text-slate-500 font-mono text-[11px] self-start sm:self-auto">
                    <Clock className="w-3 h-3 text-slate-600" />
                    <span>{formatDecidedTimestamp(review.decided_at)}</span>
                  </div>
                </div>

                {/* Sub-row: Signal ID & Review ID */}
                <div className="flex items-center gap-3 text-[11px] font-mono text-slate-400 flex-wrap">
                  <div className="flex items-center gap-1">
                    <span className="text-slate-500">Signal:</span>
                    <span className="text-slate-300 truncate max-w-xs">{review.signal_id}</span>
                  </div>
                  <span className="text-slate-700">&bull;</span>
                  <div className="flex items-center gap-1 text-slate-500">
                    <span>Audit ID:</span>
                    <span className="truncate max-w-xs">{review.id}</span>
                  </div>
                </div>

                {/* Reviewer Notes (if present) */}
                {review.reviewer_notes && review.reviewer_notes.trim() !== '' && (
                  <div className="flex items-start gap-2 p-2.5 rounded bg-slate-900/60 border border-slate-800 text-slate-300 text-xs">
                    <MessageSquareQuote className="w-3.5 h-3.5 text-indigo-400 shrink-0 mt-0.5" />
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500 font-semibold">
                        Reviewer note
                      </span>
                      <p className="italic leading-relaxed text-slate-300">
                        &ldquo;{review.reviewer_notes}&rdquo;
                      </p>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};
