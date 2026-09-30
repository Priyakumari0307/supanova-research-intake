import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  CandidateReviewDecision,
  isReviewDecision,
  isValidIsoTimestamp,
  validateCandidateReviewDecision,
} from './candidate-review.types';

describe('Candidate Review Decision Data Model & Validation', () => {
  const validApprovedReview: CandidateReviewDecision = {
    id: 'rev_1727654400000_1a2b3c',
    candidate_work_id: 'cwi_harborline_dispatch_01',
    signal_id: '2026-09-29_research_harborline_123',
    decision: 'APPROVED',
    reviewer_notes: 'Evidence verified against Harborline EDI logs. Approved for sprint backlog.',
    decided_at: '2026-09-30T10:00:00.000Z',
  };

  const validRejectedReview: CandidateReviewDecision = {
    id: 'rev_1727654401000_4d5e6f',
    candidate_work_id: 'cwi_northwind_pricing_02',
    signal_id: '2026-09-29_research_northwind_456',
    decision: 'REJECTED',
    reviewer_notes: 'Duplicate task already tracked in Northwind Q3 board.',
    decided_at: '2026-09-30T10:05:00.000Z',
  };

  it('1. APPROVED is valid', () => {
    assert.strictEqual(isReviewDecision('APPROVED'), true);
    const result = validateCandidateReviewDecision(validApprovedReview);
    assert.strictEqual(result.isValid, true);
    assert.strictEqual(result.errors.length, 0);
  });

  it('2. REJECTED is valid', () => {
    assert.strictEqual(isReviewDecision('REJECTED'), true);
    const result = validateCandidateReviewDecision(validRejectedReview);
    assert.strictEqual(result.isValid, true);
    assert.strictEqual(result.errors.length, 0);
  });

  it('3. Invalid decisions are rejected', () => {
    assert.strictEqual(isReviewDecision('PENDING'), false);
    assert.strictEqual(isReviewDecision('DRAFT'), false);
    assert.strictEqual(isReviewDecision('accepted'), false);
    assert.strictEqual(isReviewDecision(''), false);
    assert.strictEqual(isReviewDecision(null), false);
    assert.strictEqual(isReviewDecision(undefined), false);
    assert.strictEqual(isReviewDecision(123), false);

    const invalidDecision = { ...validApprovedReview, decision: 'MAYBE' as any };
    const result = validateCandidateReviewDecision(invalidDecision);
    assert.strictEqual(result.isValid, false);
    assert.match(result.errors[0], /Decision must be one of: APPROVED, REJECTED/);
  });

  it('4. Required identifiers cannot be empty', () => {
    // Empty review id
    const missingId = { ...validApprovedReview, id: '' };
    const resId = validateCandidateReviewDecision(missingId);
    assert.strictEqual(resId.isValid, false);
    assert.match(resId.errors[0], /must have a valid non-empty "id"/);

    // Whitespace review id
    const whitespaceId = { ...validApprovedReview, id: '   ' };
    assert.strictEqual(validateCandidateReviewDecision(whitespaceId).isValid, false);

    // Empty candidate_work_id
    const missingCandidateId = { ...validApprovedReview, candidate_work_id: '' };
    const resCandidate = validateCandidateReviewDecision(missingCandidateId);
    assert.strictEqual(resCandidate.isValid, false);
    assert.match(resCandidate.errors[0], /must reference a valid non-empty "candidate_work_id"/);

    // Whitespace candidate_work_id
    const whitespaceCandidateId = { ...validApprovedReview, candidate_work_id: '   ' };
    assert.strictEqual(validateCandidateReviewDecision(whitespaceCandidateId).isValid, false);

    // Empty signal_id
    const missingSignalId = { ...validApprovedReview, signal_id: '' };
    const resSignal = validateCandidateReviewDecision(missingSignalId);
    assert.strictEqual(resSignal.isValid, false);
    assert.match(resSignal.errors[0], /must reference a valid non-empty "signal_id"/);

    // Whitespace signal_id
    const whitespaceSignalId = { ...validApprovedReview, signal_id: '   ' };
    assert.strictEqual(validateCandidateReviewDecision(whitespaceSignalId).isValid, false);
  });

  it('5. Reviewer notes can be null/empty when allowed', () => {
    // null notes
    const reviewWithNullNotes: CandidateReviewDecision = {
      ...validApprovedReview,
      reviewer_notes: null,
    };
    assert.strictEqual(validateCandidateReviewDecision(reviewWithNullNotes).isValid, true);

    // undefined notes
    const reviewWithUndefinedNotes: CandidateReviewDecision = {
      id: 'rev_1727654402000_7g8h9i',
      candidate_work_id: 'cwi_harborline_dispatch_01',
      signal_id: '2026-09-29_research_harborline_123',
      decision: 'APPROVED',
      decided_at: '2026-09-30T10:10:00.000Z',
    };
    assert.strictEqual(validateCandidateReviewDecision(reviewWithUndefinedNotes).isValid, true);

    // empty string notes
    const reviewWithEmptyNotes: CandidateReviewDecision = {
      ...validApprovedReview,
      reviewer_notes: '',
    };
    assert.strictEqual(validateCandidateReviewDecision(reviewWithEmptyNotes).isValid, true);

    // non-string invalid notes (e.g. number or object)
    const reviewWithInvalidNotes = {
      ...validApprovedReview,
      reviewer_notes: 12345 as any,
    };
    const invalidNotesResult = validateCandidateReviewDecision(reviewWithInvalidNotes);
    assert.strictEqual(invalidNotesResult.isValid, false);
    assert.match(invalidNotesResult.errors[0], /must be a string, null, or undefined/);
  });

  it('6. decided_at must be a valid ISO timestamp if validation is included', () => {
    // Valid ISO timestamps
    assert.strictEqual(isValidIsoTimestamp('2026-09-30T10:00:00.000Z'), true);
    assert.strictEqual(isValidIsoTimestamp('2026-09-30T10:00:00Z'), true);
    assert.strictEqual(isValidIsoTimestamp('2026-09-30T10:00:00+00:00'), true);
    assert.strictEqual(isValidIsoTimestamp('2026-09-30 10:00:00'), true);

    // Invalid ISO timestamps
    assert.strictEqual(isValidIsoTimestamp(''), false);
    assert.strictEqual(isValidIsoTimestamp('not-a-date'), false);
    assert.strictEqual(isValidIsoTimestamp('2026-99-99T99:99:99Z'), false);
    assert.strictEqual(isValidIsoTimestamp(null), false);
    assert.strictEqual(isValidIsoTimestamp(undefined), false);
    assert.strictEqual(isValidIsoTimestamp(1727654400000), false);

    const invalidTimestampReview = {
      ...validApprovedReview,
      decided_at: 'invalid-timestamp',
    };
    const result = validateCandidateReviewDecision(invalidTimestampReview);
    assert.strictEqual(result.isValid, false);
    assert.match(result.errors[0], /must be a valid ISO 8601 timestamp string/);
  });

  it('rejects non-object or null input', () => {
    assert.strictEqual(validateCandidateReviewDecision(null).isValid, false);
    assert.strictEqual(validateCandidateReviewDecision(undefined).isValid, false);
    assert.strictEqual(validateCandidateReviewDecision('string').isValid, false);
    assert.strictEqual(validateCandidateReviewDecision(42).isValid, false);
  });
});
