/**
 * Candidate Review Decision Types & Validation Model
 *
 * Represents an explicit, deliberate human review decision (approval or rejection)
 * performed on an existing candidate work item.
 *
 * Core principles:
 * - Only an existing candidate work item can be reviewed.
 * - A review decision is a deliberate human action, distinct and decoupled from candidate generation.
 * - Approval or rejection marks the transition from candidate draft to committed/rejected work.
 * - Reviewer notes are optional but provide helpful context and justification for the audit trail.
 */

export type ReviewDecision = 'APPROVED' | 'REJECTED';

export const REVIEW_DECISIONS: readonly ReviewDecision[] = [
  'APPROVED',
  'REJECTED',
] as const;

export interface CandidateReviewDecision {
  /** Stable unique audit/review identifier (e.g., 'rev_1727654400000_abc123') */
  id: string;
  /** Identifier of the candidate work item being reviewed */
  candidate_work_id: string;
  /** Identifier of the source research signal associated with the candidate */
  signal_id: string;
  /** Human decision outcome: 'APPROVED' or 'REJECTED' */
  decision: ReviewDecision;
  /** Optional human reviewer notes or justification */
  reviewer_notes?: string | null;
  /** ISO 8601 timestamp when the human decision was made */
  decided_at: string;
}

export interface CreateCandidateReviewInput {
  candidate_work_id: string;
  signal_id: string;
  decision: ReviewDecision;
  reviewer_notes?: string | null;
  decided_at?: string;
  id?: string;
}

export interface CandidateReviewsFile {
  version: number;
  reviews: CandidateReviewDecision[];
}

export interface CandidateReviewAuditEntry {
  event: 'candidate_review_decided';
  review_id: string;
  candidate_work_id: string;
  signal_id: string;
  decision: ReviewDecision;
  timestamp: string;
  reviewer_notes?: string | null;
}

export interface CandidateReviewValidationResult {
  isValid: boolean;
  errors: string[];
}

/**
 * Type guard to check if a value is a valid ReviewDecision ('APPROVED' | 'REJECTED').
 */
export function isReviewDecision(value: unknown): value is ReviewDecision {
  return typeof value === 'string' && (REVIEW_DECISIONS as readonly string[]).includes(value);
}

/**
 * Helper to check if a string is a valid ISO 8601 date-time timestamp.
 */
export function isValidIsoTimestamp(value: unknown): boolean {
  if (typeof value !== 'string' || value.trim() === '') {
    return false;
  }
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return false;
  }
  // Check that the ISO format is preserved (e.g. includes year-month-day)
  return /^\d{4}-\d{2}-\d{2}(T|\s)\d{2}:\d{2}/.test(value);
}

/**
 * Validates a CandidateReviewDecision record against required schema rules.
 *
 * Rules:
 * - id: non-empty string
 * - candidate_work_id: non-empty string (must reference a candidate work item)
 * - signal_id: non-empty string (must reference the associated signal)
 * - decision: 'APPROVED' | 'REJECTED'
 * - decided_at: valid ISO 8601 timestamp
 * - reviewer_notes: optional string or null/undefined
 */
export function validateCandidateReviewDecision(review: unknown): CandidateReviewValidationResult {
  const errors: string[] = [];

  if (!review || typeof review !== 'object') {
    return { isValid: false, errors: ['Candidate review decision must be a valid JSON object.'] };
  }

  const record = review as Record<string, unknown>;

  // Validate review audit id
  if (typeof record.id !== 'string' || record.id.trim() === '') {
    errors.push('Review decision must have a valid non-empty "id".');
  }

  // Validate candidate_work_id
  if (typeof record.candidate_work_id !== 'string' || record.candidate_work_id.trim() === '') {
    errors.push('Review decision must reference a valid non-empty "candidate_work_id".');
  }

  // Validate signal_id
  if (typeof record.signal_id !== 'string' || record.signal_id.trim() === '') {
    errors.push('Review decision must reference a valid non-empty "signal_id".');
  }

  // Validate decision
  if (!isReviewDecision(record.decision)) {
    errors.push(
      `Decision must be one of: ${REVIEW_DECISIONS.join(', ')}. Received: "${record.decision}".`
    );
  }

  // Validate decided_at timestamp
  if (!isValidIsoTimestamp(record.decided_at)) {
    errors.push(
      `Field "decided_at" must be a valid ISO 8601 timestamp string. Received: "${record.decided_at}".`
    );
  }

  // Validate reviewer_notes if provided
  if (
    record.reviewer_notes !== undefined &&
    record.reviewer_notes !== null &&
    typeof record.reviewer_notes !== 'string'
  ) {
    errors.push('Field "reviewer_notes" must be a string, null, or undefined.');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}
