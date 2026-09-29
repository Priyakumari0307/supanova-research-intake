/**
 * Candidate Work Item Types & Validation Model
 *
 * Represents a candidate piece of work derived from a research signal
 * that a human can review, approve, or reject before it becomes committed work.
 */

export type CandidateWorkItemStatus = 'DRAFT' | 'APPROVED' | 'REJECTED';

export const CANDIDATE_WORK_STATUSES: readonly CandidateWorkItemStatus[] = [
  'DRAFT',
  'APPROVED',
  'REJECTED',
] as const;

export interface CandidateWorkItem {
  /** Stable unique identifier for the candidate work item (e.g., 'cwi_...') */
  id: string;
  /** Identifier of the source research signal from which this work item was derived */
  signal_id: string;
  /** Short, actionable title describing the candidate work item */
  title: string;
  /** Concise description detailing the proposed task or work */
  description: string;
  /** Direct excerpt(s) or quotes from source text serving as factual evidence */
  evidence: string[];
  /** Target project identifier (e.g., 'northwind', 'harborline', 'internal_unsorted') */
  project_id: string;
  /** Review and approval lifecycle status */
  status: CandidateWorkItemStatus;
  /** Confidence score between 0.0 and 1.0 */
  confidence: number;
  /** Flag indicating whether the candidate item is explicitly grounded in verified source evidence */
  is_grounded: boolean;
  /** Optional ISO 8601 timestamp of creation */
  created_at?: string;
  /** Optional ISO 8601 timestamp of last status update or review */
  updated_at?: string;
  /** Optional reviewer notes or context */
  reviewer_notes?: string | null;
}

export interface CreateCandidateWorkItemInput {
  id?: string;
  signal_id: string;
  title: string;
  description: string;
  evidence: string[];
  project_id: string;
  confidence: number;
  is_grounded: boolean;
  status?: CandidateWorkItemStatus;
  reviewer_notes?: string | null;
}

export interface CandidateWorkValidationResult {
  isValid: boolean;
  errors: string[];
}

/**
 * Type guard to check if a value is a valid CandidateWorkItemStatus.
 */
export function isCandidateWorkStatus(value: unknown): value is CandidateWorkItemStatus {
  return typeof value === 'string' && (CANDIDATE_WORK_STATUSES as readonly string[]).includes(value);
}

/**
 * Type guard to check if a confidence value is a valid number between 0 and 1.
 */
export function isValidConfidence(value: unknown): value is number {
  return typeof value === 'number' && !Number.isNaN(value) && value >= 0 && value <= 1;
}

/**
 * Validates a CandidateWorkItem record against required schema rules.
 *
 * Rules:
 * - id: non-empty string
 * - signal_id: non-empty string
 * - title: non-empty string
 * - description: non-empty string
 * - evidence: array of strings (must contain at least one non-empty string if is_grounded is true)
 * - project_id: non-empty string matching allowed projects if provided
 * - status: 'DRAFT' | 'APPROVED' | 'REJECTED'
 * - confidence: number in [0, 1] range
 * - is_grounded: boolean
 */
export function validateCandidateWorkItem(
  item: unknown,
  allowedProjects?: string[]
): CandidateWorkValidationResult {
  const errors: string[] = [];

  if (!item || typeof item !== 'object') {
    return { isValid: false, errors: ['Candidate work item must be a valid JSON object.'] };
  }

  const record = item as Record<string, unknown>;

  // Validate id
  if (typeof record.id !== 'string' || record.id.trim() === '') {
    errors.push('Candidate work item must have a valid non-empty "id".');
  }

  // Validate signal_id
  if (typeof record.signal_id !== 'string' || record.signal_id.trim() === '') {
    errors.push('Candidate work item must reference a valid non-empty "signal_id".');
  }

  // Validate title
  if (typeof record.title !== 'string' || record.title.trim() === '') {
    errors.push('Candidate work item must have a non-empty "title".');
  }

  // Validate description
  if (typeof record.description !== 'string' || record.description.trim() === '') {
    errors.push('Candidate work item must have a non-empty "description".');
  }

  // Validate evidence
  if (!Array.isArray(record.evidence)) {
    errors.push('Candidate work item "evidence" must be an array of string excerpts.');
  } else {
    for (let i = 0; i < record.evidence.length; i++) {
      if (typeof record.evidence[i] !== 'string' || (record.evidence[i] as string).trim() === '') {
        errors.push(`Evidence item at index ${i} must be a non-empty string.`);
      }
    }
  }

  // Validate project_id
  if (typeof record.project_id !== 'string' || record.project_id.trim() === '') {
    errors.push('Candidate work item must have a non-empty "project_id".');
  } else if (allowedProjects && allowedProjects.length > 0) {
    if (!allowedProjects.includes(record.project_id)) {
      errors.push(
        `Project "${record.project_id}" is not in the list of allowed projects: ${allowedProjects.join(', ')}.`
      );
    }
  }

  // Validate status
  if (!isCandidateWorkStatus(record.status)) {
    errors.push(
      `Status must be one of: ${CANDIDATE_WORK_STATUSES.join(', ')}. Received: "${record.status}".`
    );
  }

  // Validate confidence
  if (!isValidConfidence(record.confidence)) {
    errors.push(
      `Confidence must be a numeric value between 0.0 and 1.0 (inclusive). Received: ${record.confidence}.`
    );
  }

  // Validate is_grounded
  if (typeof record.is_grounded !== 'boolean') {
    errors.push('Field "is_grounded" must be a boolean flag.');
  } else if (record.is_grounded && Array.isArray(record.evidence) && record.evidence.length === 0) {
    errors.push('A candidate item marked as "is_grounded: true" must have at least one evidence excerpt.');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}
