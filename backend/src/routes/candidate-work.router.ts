import { Router, Request, Response, NextFunction } from 'express';
import { getSignals, FixtureError } from '../services/fixture.service';
import { generateCandidateWorkItems } from '../services/candidate-work.service';

export const candidateWorkRouter = Router();

/**
 * POST /api/candidate-work/preview
 *
 * Stateless preview endpoint that generates grounded DRAFT candidate work items
 * from an existing research signal without modifying the ledger or audit log.
 */
candidateWorkRouter.post('/preview', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = req.body;

    if (!body || typeof body !== 'object') {
      throw new FixtureError('Request body must be a valid JSON object.', 400);
    }

    // Security Check: Reject client attempts to inject candidate work fields
    const disallowedFields = ['id', 'status', 'confidence', 'evidence', 'project_id', 'candidates'];
    for (const field of disallowedFields) {
      if (body[field] !== undefined) {
        throw new FixtureError(
          `Client injection prohibited: "${field}" cannot be supplied to preview endpoint. Candidates are generated server-side from the source signal.`,
          400
        );
      }
    }

    const rawSignalId = body.signal_id;
    if (typeof rawSignalId !== 'string' || rawSignalId.trim() === '') {
      throw new FixtureError('Missing or invalid "signal_id" in request body.', 400);
    }

    const signalId = rawSignalId.trim();

    // Load signal from data-access layer
    const signals = await getSignals();
    const signal = signals.find((s) => s.id === signalId);

    if (!signal) {
      throw new FixtureError(`Signal not found with id "${signalId}".`, 404);
    }

    // Generate grounded DRAFT candidates
    const candidates = generateCandidateWorkItems(signal);

    res.json({
      status: 'preview',
      signal_id: signal.id,
      candidates,
    });
  } catch (err) {
    next(err);
  }
});
