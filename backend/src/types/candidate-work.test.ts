import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  CandidateWorkItem,
  validateCandidateWorkItem,
  isCandidateWorkStatus,
  isValidConfidence,
} from './candidate-work.types';

describe('Candidate Work Item Data Model & Validation', () => {
  const validItem: CandidateWorkItem = {
    id: 'cwi_harborline_dispatch_01',
    signal_id: '2026-09-29_research_harborline_123',
    title: 'Audit Harborline EDI Freight Dispatch Queue',
    description: 'Investigate discrepancies reported in freight dispatch manifests.',
    evidence: [
      'Harborline container delivery tracking and freight dispatch notes indicate queue backlog.',
    ],
    project_id: 'harborline',
    status: 'DRAFT',
    confidence: 0.95,
    is_grounded: true,
    created_at: '2026-09-29T22:30:00Z',
    updated_at: '2026-09-29T22:30:00Z',
    reviewer_notes: null,
  };

  it('validates a complete, conforming candidate work item', () => {
    const result = validateCandidateWorkItem(validItem);
    assert.strictEqual(result.isValid, true);
    assert.strictEqual(result.errors.length, 0);
  });

  it('supports all valid lifecycle statuses: DRAFT, APPROVED, REJECTED', () => {
    assert.strictEqual(isCandidateWorkStatus('DRAFT'), true);
    assert.strictEqual(isCandidateWorkStatus('APPROVED'), true);
    assert.strictEqual(isCandidateWorkStatus('REJECTED'), true);
    assert.strictEqual(isCandidateWorkStatus('PENDING'), false);
    assert.strictEqual(isCandidateWorkStatus(''), false);
    assert.strictEqual(isCandidateWorkStatus(null), false);

    const approvedItem: CandidateWorkItem = { ...validItem, status: 'APPROVED' };
    assert.strictEqual(validateCandidateWorkItem(approvedItem).isValid, true);

    const rejectedItem: CandidateWorkItem = { ...validItem, status: 'REJECTED' };
    assert.strictEqual(validateCandidateWorkItem(rejectedItem).isValid, true);

    const invalidStatusItem = { ...validItem, status: 'UNKNOWN' };
    const invalidResult = validateCandidateWorkItem(invalidStatusItem);
    assert.strictEqual(invalidResult.isValid, false);
    assert.match(invalidResult.errors[0], /Status must be one of/);
  });

  it('validates confidence is bounded between 0.0 and 1.0', () => {
    assert.strictEqual(isValidConfidence(0), true);
    assert.strictEqual(isValidConfidence(0.5), true);
    assert.strictEqual(isValidConfidence(1), true);
    assert.strictEqual(isValidConfidence(-0.1), false);
    assert.strictEqual(isValidConfidence(1.01), false);
    assert.strictEqual(isValidConfidence(NaN), false);
    assert.strictEqual(isValidConfidence('0.5'), false);

    const lowConfidence = { ...validItem, confidence: -0.01 };
    assert.strictEqual(validateCandidateWorkItem(lowConfidence).isValid, false);

    const highConfidence = { ...validItem, confidence: 1.5 };
    assert.strictEqual(validateCandidateWorkItem(highConfidence).isValid, false);
  });

  it('rejects candidate item with missing or blank id / signal_id / title / description', () => {
    const missingId = { ...validItem, id: '' };
    assert.strictEqual(validateCandidateWorkItem(missingId).isValid, false);

    const missingSignalId = { ...validItem, signal_id: '   ' };
    assert.strictEqual(validateCandidateWorkItem(missingSignalId).isValid, false);

    const missingTitle = { ...validItem, title: '' };
    assert.strictEqual(validateCandidateWorkItem(missingTitle).isValid, false);

    const missingDescription = { ...validItem, description: '' };
    assert.strictEqual(validateCandidateWorkItem(missingDescription).isValid, false);
  });

  it('validates grounded items must include non-empty evidence excerpts', () => {
    const groundedWithoutEvidence = { ...validItem, is_grounded: true, evidence: [] };
    const result = validateCandidateWorkItem(groundedWithoutEvidence);
    assert.strictEqual(result.isValid, false);
    assert.match(result.errors[0], /must have at least one evidence excerpt/);

    const groundedWithEmptyString = { ...validItem, is_grounded: true, evidence: ['   '] };
    const emptyStrResult = validateCandidateWorkItem(groundedWithEmptyString);
    assert.strictEqual(emptyStrResult.isValid, false);
    assert.match(emptyStrResult.errors[0], /must be a non-empty string/);
  });

  it('verifies project against allowed project list when provided', () => {
    const allowedProjects = ['northwind', 'harborline', 'atlas', 'quill'];
    assert.strictEqual(validateCandidateWorkItem(validItem, allowedProjects).isValid, true);

    const invalidProjectItem = { ...validItem, project_id: 'unknown_client' };
    const result = validateCandidateWorkItem(invalidProjectItem, allowedProjects);
    assert.strictEqual(result.isValid, false);
    assert.match(result.errors[0], /is not in the list of allowed projects/);
  });

  it('rejects non-object or null input', () => {
    assert.strictEqual(validateCandidateWorkItem(null).isValid, false);
    assert.strictEqual(validateCandidateWorkItem(undefined).isValid, false);
    assert.strictEqual(validateCandidateWorkItem('string').isValid, false);
    assert.strictEqual(validateCandidateWorkItem(123).isValid, false);
  });
});
