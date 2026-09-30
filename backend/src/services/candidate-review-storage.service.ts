import path from 'path';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import { randomUUID } from 'crypto';
import {
  CandidateReviewDecision,
  CandidateReviewsFile,
  CandidateReviewAuditEntry,
  validateCandidateReviewDecision,
} from '../types/candidate-review.types';
import { getFixtureDir, FixtureError } from './fixture.service';

export interface GuardedReviewWriteOptions {
  reviewsPath?: string;
  auditPath?: string;
}

/**
 * Resolves the default path to the candidate reviews JSON file.
 */
export function getReviewsFilePath(customPath?: string): string {
  if (customPath) return path.resolve(customPath);
  return path.join(getFixtureDir(), 'candidate-reviews.json');
}

/**
 * Resolves the default path to the append-only audit log file.
 */
export function getAuditFilePath(customPath?: string): string {
  if (customPath) return path.resolve(customPath);
  return path.join(getFixtureDir(), 'run-log.jsonl');
}

/**
 * Reads and parses the current candidate reviews file from disk.
 */
export async function readReviewsFile(reviewsPath?: string): Promise<CandidateReviewsFile> {
  const filePath = getReviewsFilePath(reviewsPath);

  if (!existsSync(filePath)) {
    return {
      version: 1,
      reviews: [],
    };
  }

  let raw: string;
  try {
    raw = await fs.readFile(filePath, 'utf-8');
  } catch (err: any) {
    throw new FixtureError(`Failed to read candidate reviews at ${filePath}: ${err.message}`, 500);
  }

  try {
    const parsed = JSON.parse(raw) as CandidateReviewsFile;
    if (!parsed || !Array.isArray(parsed.reviews)) {
      throw new FixtureError('Invalid candidate reviews shape: missing "reviews" array.', 500);
    }
    return parsed;
  } catch (err: any) {
    throw new FixtureError(`Malformed JSON in candidate reviews file: ${err.message}`, 500);
  }
}

/**
 * Reads only the candidate reviews array from candidate-reviews.json.
 */
export async function getCandidateReviews(reviewsPath?: string): Promise<CandidateReviewDecision[]> {
  const file = await readReviewsFile(reviewsPath);
  return file.reviews;
}

/**
 * SINGLE GUARDED CANDIDATE REVIEW WRITE PATH
 *
 * Persists a new human candidate review decision locally with strict atomicity and an append-only audit trail.
 *
 * Guarantees:
 * 1. Schema Validation: Enforces full CandidateReviewDecision validity before any disk writes.
 * 2. Atomicity: Writes to a temporary file + atomic rename (fs.rename) so partial/corrupted writes never occur.
 * 3. Idempotency & Deduplication: Rejects duplicate review IDs with 409 Conflict.
 * 4. Audit Trail: Appends a structured audit record to the local JSONL audit file (run-log.jsonl).
 * 5. Rollback / Cleanup: Cleans up the temporary file on error and leaves existing reviews untouched.
 */
export async function writeCandidateReviewGuarded(
  review: CandidateReviewDecision,
  options: GuardedReviewWriteOptions = {}
): Promise<CandidateReviewDecision> {
  // 1. Validate complete CandidateReviewDecision
  const validation = validateCandidateReviewDecision(review);
  if (!validation.isValid) {
    throw new FixtureError(
      `Guarded review write rejected: ${validation.errors.join('; ')}`,
      400
    );
  }

  const targetReviewsPath = getReviewsFilePath(options.reviewsPath);
  const targetAuditPath = getAuditFilePath(options.auditPath);
  const reviewsDir = path.dirname(targetReviewsPath);

  // Ensure target directory exists
  await fs.mkdir(reviewsDir, { recursive: true });

  // 2. Read existing reviews file
  const currentFile = await readReviewsFile(targetReviewsPath);

  // 3. Prevent duplicate review ID collisions
  const existingReviewIdIndex = currentFile.reviews.findIndex((r) => r.id === review.id);
  if (existingReviewIdIndex !== -1) {
    throw new FixtureError(
      `Guarded write rejected: a review with id "${review.id}" already exists.`,
      409
    );
  }

  // 4. Prevent duplicate reviews for the same candidate work item
  const existingCandidateIndex = currentFile.reviews.findIndex(
    (r) => r.candidate_work_id === review.candidate_work_id
  );
  if (existingCandidateIndex !== -1) {
    const existingReview = currentFile.reviews[existingCandidateIndex];
    throw new FixtureError(
      `Guarded write rejected: candidate work item "${review.candidate_work_id}" has already received a human review decision (${existingReview.decision}). Candidate work items may receive only one final decision.`,
      409
    );
  }

  // 5. Construct updated reviews file
  const updatedFile: CandidateReviewsFile = {
    version: currentFile.version || 1,
    reviews: [...currentFile.reviews, review],
  };

  const serializedReviews = JSON.stringify(updatedFile, null, 2) + '\n';

  // 5. Atomic Write: Write to unique temporary file in the same directory first
  const tempFileName = `.tmp-reviews-${Date.now()}-${randomUUID()}.json`;
  const tempFilePath = path.join(reviewsDir, tempFileName);

  try {
    await fs.writeFile(tempFilePath, serializedReviews, 'utf-8');

    // Rename atomically replaces the target file
    await fs.rename(tempFilePath, targetReviewsPath);
  } catch (err: any) {
    // Clean up temporary file if write or rename fails
    try {
      if (existsSync(tempFilePath)) {
        await fs.unlink(tempFilePath);
      }
    } catch {
      // Ignore cleanup error
    }
    throw new FixtureError(
      `Atomic persistence failure while writing candidate review: ${err.message}`,
      500
    );
  }

  // 6. Append-only Audit Trail: Record audit line to JSONL file
  const auditEntry: CandidateReviewAuditEntry = {
    event: 'candidate_review_decided',
    review_id: review.id,
    candidate_work_id: review.candidate_work_id,
    signal_id: review.signal_id,
    decision: review.decision,
    timestamp: review.decided_at,
    reviewer_notes: review.reviewer_notes !== undefined ? review.reviewer_notes : null,
  };

  try {
    const auditLine = JSON.stringify(auditEntry) + '\n';
    await fs.appendFile(targetAuditPath, auditLine, 'utf-8');
  } catch (err: any) {
    console.error(`[WARN] Failed to write audit trail to ${targetAuditPath}: ${err.message}`);
  }

  return review;
}
