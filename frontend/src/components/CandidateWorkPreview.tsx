import React, { useState } from 'react';
import { CandidateWorkItem, CandidateReviewDecision, ReviewDecision } from '../types/api.types';
import { submitCandidateReview } from '../lib/api';
import {
  Sparkles,
  X,
  AlertCircle,
  Loader2,
  FileCheck2,
  Quote,
  ShieldCheck,
  Inbox,
  Clock,
  CheckCircle2,
  XCircle,
  UserCheck,
  Check,
} from 'lucide-react';

interface CandidateWorkPreviewProps {
  signalId: string;
  signalTitle?: string;
  candidates: CandidateWorkItem[] | null;
  isLoading: boolean;
  error: string | null;
  onClose: () => void;
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

export const CandidateWorkPreview: React.FC<CandidateWorkPreviewProps> = ({
  signalId,
  signalTitle,
  candidates,
  isLoading,
  error,
  onClose,
}) => {
  // Local review state per candidate
  const [reviewerNotes, setReviewerNotes] = useState<Record<string, string>>({});
  const [submittingAction, setSubmittingAction] = useState<Record<string, ReviewDecision | null>>({});
  const [reviewDecisions, setReviewDecisions] = useState<Record<string, CandidateReviewDecision>>({});
  const [reviewErrors, setReviewErrors] = useState<Record<string, string | null>>({});

  const handleReviewSubmit = async (candidateId: string, decision: ReviewDecision) => {
    // Prevent duplicate submissions
    if (submittingAction[candidateId] || reviewDecisions[candidateId]) {
      return;
    }

    setSubmittingAction((prev) => ({ ...prev, [candidateId]: decision }));
    setReviewErrors((prev) => ({ ...prev, [candidateId]: null }));

    try {
      const notes = reviewerNotes[candidateId];
      const result = await submitCandidateReview(candidateId, decision, notes);
      setReviewDecisions((prev) => ({ ...prev, [candidateId]: result }));
    } catch (err: any) {
      setReviewErrors((prev) => ({
        ...prev,
        [candidateId]: err.message || `Failed to submit ${decision.toLowerCase()} decision.`,
      }));
    } finally {
      setSubmittingAction((prev) => ({ ...prev, [candidateId]: null }));
    }
  };

  return (
    <div className="rounded-lg border border-slate-700/80 bg-[#0d131f] p-4 sm:p-5 flex flex-col gap-4 shadow-lg animate-in fade-in duration-200">
      {/* Header Row */}
      <div className="flex items-start justify-between gap-3 border-b border-slate-800 pb-3">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
              <Sparkles className="w-3 h-3 text-indigo-400" />
              <span>Candidate Work</span>
            </span>
            <span className="text-slate-600 text-xs">&bull;</span>
            <span className="text-xs font-mono text-slate-400 truncate max-w-sm sm:max-w-md">
              {signalTitle || signalId}
            </span>
          </div>
          <span className="text-[11px] text-slate-400">
            Signal: <code className="font-mono text-slate-300">{signalId}</code>
          </span>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="text-slate-400 hover:text-slate-200 p-1 rounded hover:bg-slate-800/60 transition-colors cursor-pointer"
          title="Close candidate preview"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* AI Assistance / Non-Committed Work Notice */}
      <div className="rounded border border-amber-500/20 bg-amber-950/10 p-3 flex items-start gap-2.5 text-xs text-amber-300/90 leading-relaxed">
        <Clock className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
        <div className="flex flex-col gap-0.5">
          <span className="font-semibold text-amber-200">Draft suggestions for review</span>
          <span className="text-[11px] text-slate-400">
            These work candidates are generated suggestions extracted directly from source text evidence.
            They are <span className="text-amber-300 font-medium">NOT committed work items yet</span> and require human review.
          </span>
        </div>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="py-8 flex flex-col items-center justify-center gap-2.5 text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin text-indigo-400" />
          <span className="text-xs font-mono">Analyzing signal source content for actionable work...</span>
        </div>
      )}

      {/* Error State */}
      {!isLoading && error && (
        <div className="rounded border border-rose-800/40 bg-rose-950/20 p-3.5 flex items-start gap-2 text-xs text-rose-300">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
          <div className="flex flex-col gap-0.5">
            <span className="font-semibold">Failed to preview candidate work:</span>
            <span className="text-slate-300 text-[11px]">{error}</span>
          </div>
        </div>
      )}

      {/* Empty State: No Actionable Work Detected */}
      {!isLoading && !error && candidates && candidates.length === 0 && (
        <div className="rounded border border-slate-800 bg-[#090d14] p-6 flex flex-col items-center justify-center gap-2 text-center text-slate-400">
          <Inbox className="w-6 h-6 text-slate-600" />
          <span className="text-xs font-medium text-slate-300">No candidate work items detected</span>
          <span className="text-[11px] text-slate-500 max-w-md leading-relaxed">
            This signal did not contain explicit actionable language (such as &quot;we should investigate...&quot; or &quot;action item:...&quot;).
            No ungrounded items were invented.
          </span>
        </div>
      )}

      {/* Candidate List */}
      {!isLoading && !error && candidates && candidates.length > 0 && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-medium text-slate-300">
              Found {candidates.length} candidate {candidates.length === 1 ? 'item' : 'items'}
            </span>
            <span className="text-[11px] font-mono text-slate-500">
              Status: DRAFT SUGGESTION
            </span>
          </div>

          <div className="flex flex-col gap-4">
            {candidates.map((candidate, idx) => {
              const candidateId = candidate.id || `candidate_${idx}`;
              const decision = reviewDecisions[candidateId];
              const isSubmitting = !!submittingAction[candidateId];
              const submittingType = submittingAction[candidateId];
              const candidateError = reviewErrors[candidateId];
              const currentNotes = reviewerNotes[candidateId] ?? '';

              return (
                <div
                  key={candidateId}
                  className="rounded border border-slate-800 bg-[#090d14] p-4 flex flex-col gap-3 text-xs"
                >
                  {/* Candidate Header Row */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-slate-800 text-slate-300 border border-slate-700/60 uppercase">
                        <FileCheck2 className="w-3 h-3 text-indigo-400" />
                        <span>Draft suggestion</span>
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-mono border ${getProjectBadgeStyle(
                          candidate.project_id
                        )}`}
                      >
                        {candidate.project_id}
                      </span>
                      <span className="text-slate-500 text-[10px] font-mono">
                        {Math.round(candidate.confidence * 100)}% confidence
                      </span>
                    </div>

                    <span className="font-mono text-[10px] text-slate-500 truncate">
                      {candidate.id}
                    </span>
                  </div>

                  {/* Candidate Title & Description */}
                  <div className="flex flex-col gap-1">
                    <h3 className="font-semibold text-slate-200 text-sm">
                      {candidate.title}
                    </h3>
                    <p className="text-slate-400 text-xs leading-relaxed">
                      {candidate.description}
                    </p>
                  </div>

                  {/* Evidence Excerpt */}
                  {candidate.evidence && candidate.evidence.length > 0 && (
                    <div className="flex flex-col gap-1.5 pt-1 border-t border-slate-800/80">
                      <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                        <Quote className="w-3 h-3 text-indigo-400" />
                        <span className="font-mono uppercase tracking-wider text-[10px]">
                          Source Evidence ({candidate.evidence.length})
                        </span>
                        {candidate.is_grounded && (
                          <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 font-mono ml-auto">
                            <ShieldCheck className="w-3 h-3" />
                            <span>Grounded in text</span>
                          </span>
                        )}
                      </div>
                      <div className="flex flex-col gap-1">
                        {candidate.evidence.map((ev, evIdx) => (
                          <blockquote
                            key={evIdx}
                            className="bg-slate-900/80 border-l-2 border-indigo-500/50 rounded-r px-2.5 py-1.5 text-[11px] text-slate-300 font-sans italic"
                          >
                            &ldquo;{ev}&rdquo;
                          </blockquote>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Human Review Decision Section */}
                  <div className="mt-2 pt-3 border-t border-slate-800/80 flex flex-col gap-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-300">
                        <UserCheck className="w-3.5 h-3.5 text-indigo-400" />
                        <span>Human Review Decision</span>
                      </div>
                      {decision && (
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase border ${
                            decision.decision === 'APPROVED'
                              ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40'
                              : 'bg-rose-500/15 text-rose-400 border-rose-500/40'
                          }`}
                        >
                          {decision.decision}
                        </span>
                      )}
                    </div>

                    {/* Review Decision Made: Confirmation & Details */}
                    {decision ? (
                      <div
                        className={`rounded border p-3 flex flex-col gap-2 text-xs ${
                          decision.decision === 'APPROVED'
                            ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-300'
                            : 'bg-rose-950/20 border-rose-500/30 text-rose-300'
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          {decision.decision === 'APPROVED' ? (
                            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />
                          ) : (
                            <XCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
                          )}
                          <div className="flex flex-col gap-0.5">
                            <span className="font-semibold text-slate-100">
                              {decision.decision === 'APPROVED'
                                ? 'Candidate approved'
                                : 'Candidate rejected'}
                            </span>
                            <span className="text-[11px] text-slate-400">
                              Decision made by human review &bull; Recorded to audit trail
                            </span>
                          </div>
                        </div>

                        {/* Review metadata */}
                        <div className="mt-1 pt-2 border-t border-slate-800/60 flex flex-col gap-1 text-[11px] text-slate-300">
                          <div className="flex items-center justify-between text-slate-400 font-mono text-[10px]">
                            <span>Review ID: {decision.id}</span>
                            <span>{formatDecidedTimestamp(decision.decided_at)}</span>
                          </div>
                          {decision.reviewer_notes && (
                            <div className="mt-1 text-slate-300 bg-slate-900/60 rounded p-2 text-[11px] border border-slate-800/80">
                              <span className="text-slate-400 font-medium block text-[10px] uppercase font-mono mb-0.5">
                                Reviewer Notes:
                              </span>
                              {decision.reviewer_notes}
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      /* Review Action Form (Pending Decision) */
                      <div className="flex flex-col gap-2.5">
                        <label
                          htmlFor={`notes-${candidateId}`}
                          className="text-[11px] text-slate-400 font-medium"
                        >
                          Reviewer notes (optional):
                        </label>
                        <textarea
                          id={`notes-${candidateId}`}
                          value={currentNotes}
                          onChange={(e) =>
                            setReviewerNotes((prev) => ({
                              ...prev,
                              [candidateId]: e.target.value,
                            }))
                          }
                          disabled={isSubmitting}
                          placeholder="Add optional reviewer notes (e.g., rationale, sprint target, or rejection reason)..."
                          rows={2}
                          className="w-full rounded border border-slate-700 bg-slate-900/90 px-3 py-2 text-xs text-slate-200 placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed resize-y"
                        />

                        {/* Error Alert */}
                        {candidateError && (
                          <div className="rounded border border-rose-800/40 bg-rose-950/20 p-2.5 flex items-start gap-1.5 text-xs text-rose-300">
                            <AlertCircle className="w-3.5 h-3.5 shrink-0 text-rose-400 mt-0.5" />
                            <span>{candidateError}</span>
                          </div>
                        )}

                        {/* Review Action Buttons */}
                        <div className="flex items-center gap-2.5 pt-1">
                          <button
                            type="button"
                            onClick={() => handleReviewSubmit(candidateId, 'APPROVED')}
                            disabled={isSubmitting}
                            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shadow-sm"
                          >
                            {isSubmitting && submittingType === 'APPROVED' ? (
                              <>
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                <span>Approving...</span>
                              </>
                            ) : (
                              <>
                                <Check className="w-3.5 h-3.5" />
                                <span>Approve</span>
                              </>
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={() => handleReviewSubmit(candidateId, 'REJECTED')}
                            disabled={isSubmitting}
                            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded text-xs font-semibold bg-rose-600/90 hover:bg-rose-500 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shadow-sm"
                          >
                            {isSubmitting && submittingType === 'REJECTED' ? (
                              <>
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                <span>Rejecting...</span>
                              </>
                            ) : (
                              <>
                                <X className="w-3.5 h-3.5" />
                                <span>Reject</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
