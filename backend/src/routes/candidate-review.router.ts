import { Router, Request, Response, NextFunction } from 'express';
import { getSignals, FixtureError } from '../services/fixture.service';
import { generateCandidateWorkItems } from '../services/candidate-work.service';
import {
  writeCandidateReviewGuarded,
  getCandidateReviews,
} from '../services/candidate-review-storage.service';
import {
  CandidateReviewDecision,
  isReviewDecision,
  REVIEW_DECISIONS,
  validateCandidateReviewDecision,
} from '../types/candidate-review.types';
import { CandidateWorkItem } from '../types/candidate-work.types';

export const candidateReviewRouter = Router();

const DISALLOWED_CLIENT_FIELDS = [
  'id',
  'candidate_work_id',
  'signal_id',
  'decided_at',
  'project_id',
  'status',
  'confidence',
  'evidence',
] as const;

/**
 * Helper to find a candidate work item by ID across all signals.
 */
async function findCandidateWorkItemById(
  candidateId: string
): Promise<CandidateWorkItem | undefined> {
  const signals = await getSignals();
  for (const signal of signals) {
    const candidates = generateCandidateWorkItems(signal);
    const match = candidates.find((c) => c.id === candidateId);
    if (match) {
      return match;
    }
  }
  return undefined;
}

/**
 * GET /api/candidate-work/reviews
 *
 * Returns all locally persisted human candidate review decisions.
 */
candidateReviewRouter.get('/reviews', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const reviews = await getCandidateReviews();
    res.json(reviews);
  } catch (err) {
    next(err);
  }
});

/**
 * Handle missing candidateId in URL path
 */
candidateReviewRouter.post('/review', (_req: Request, _res: Response, next: NextFunction) => {
  next(new FixtureError('Missing or empty "candidateId" parameter in request URL.', 400));
});

/**
 * POST /api/candidate-work/:candidateId/review
 *
 * Explicit human review decision endpoint to approve or reject an existing candidate work item.
 */
candidateReviewRouter.post(
  '/:candidateId/review',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const rawCandidateId = req.params.candidateId;
      if (!rawCandidateId || typeof rawCandidateId !== 'string' || rawCandidateId.trim() === '') {
        throw new FixtureError('Missing or empty "candidateId" parameter in request URL.', 400);
      }

      const candidateId = rawCandidateId.trim();
      const body = req.body;

      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        throw new FixtureError('Request body must be a valid JSON object.', 400);
      }

      // Security Check: Reject any client attempts to inject server-controlled fields
      for (const field of DISALLOWED_CLIENT_FIELDS) {
        if (body[field] !== undefined) {
          throw new FixtureError(
            `Client injection prohibited: "${field}" cannot be supplied in review decision request. Value must be derived server-side.`,
            400
          );
        }
      }

      // Validate decision enum
      if (!isReviewDecision(body.decision)) {
        throw new FixtureError(
          `Invalid review decision. Decision must be one of: ${REVIEW_DECISIONS.join(', ')}. Received: "${body.decision}".`,
          400
        );
      }

      // Validate reviewer_notes if provided
      if (
        body.reviewer_notes !== undefined &&
        body.reviewer_notes !== null &&
        typeof body.reviewer_notes !== 'string'
      ) {
        throw new FixtureError('Field "reviewer_notes" must be a string, null, or undefined.', 400);
      }

      // Load candidate work item through backend data/service layer (verify candidate exists)
      const candidate = await findCandidateWorkItemById(candidateId);
      if (!candidate) {
        throw new FixtureError(
          `Candidate work item not found with id "${candidateId}".`,
          404
        );
      }

      // Generate server-controlled audit ID and timestamp
      const timestamp = Date.now();
      const randomSuffix = Math.random().toString(36).substring(2, 8);
      const reviewId = `rev_${timestamp}_${randomSuffix}`;
      const decidedAt = new Date().toISOString();

      const reviewDecision: CandidateReviewDecision = {
        id: reviewId,
        candidate_work_id: candidate.id,
        signal_id: candidate.signal_id,
        decision: body.decision,
        reviewer_notes: body.reviewer_notes !== undefined ? body.reviewer_notes : null,
        decided_at: decidedAt,
      };

      // Ensure constructed decision conforms strictly to model
      const validation = validateCandidateReviewDecision(reviewDecision);
      if (!validation.isValid) {
        throw new FixtureError(
          `Review decision validation failed: ${validation.errors.join('; ')}`,
          500
        );
      }

      // Persist via single guarded write path (atomic write + audit trail append)
      await writeCandidateReviewGuarded(reviewDecision);

      res.json(reviewDecision);
    } catch (err) {
      next(err);
    }
  }
);
