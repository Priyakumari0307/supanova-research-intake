import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import { randomUUID } from 'crypto';
import {
  writeCandidateReviewGuarded,
  readReviewsFile,
  getCandidateReviews,
} from './candidate-review-storage.service';
import { CandidateReviewDecision } from '../types/candidate-review.types';

describe('Candidate Review Storage Service (Guarded Persistence & Audit Log)', () => {
  let tempDir: string;
  let testReviewsPath: string;
  let testAuditPath: string;

  const validReview: CandidateReviewDecision = {
    id: 'rev_1727654400000_123456',
    candidate_work_id: 'cwi_2026-09-29_research_northwind_audit_412a_01',
    signal_id: '2026-09-29_research_northwind_audit_412a',
    decision: 'APPROVED',
    reviewer_notes: 'Evidence verified against database logs. Approved for implementation.',
    decided_at: '2026-09-30T10:00:00.000Z',
  };

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `test-review-storage-${randomUUID()}`);
    await fs.mkdir(tempDir, { recursive: true });
    testReviewsPath = path.join(tempDir, 'candidate-reviews.json');
    testAuditPath = path.join(tempDir, 'run-log.jsonl');

    await fs.writeFile(
      testReviewsPath,
      JSON.stringify({ version: 1, reviews: [] }, null, 2),
      'utf-8'
    );
    await fs.writeFile(testAuditPath, '', 'utf-8');
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('1. first review for a candidate succeeds and is persisted', async () => {
    const result = await writeCandidateReviewGuarded(validReview, {
      reviewsPath: testReviewsPath,
      auditPath: testAuditPath,
    });

    assert.strictEqual(result.id, validReview.id);
    assert.strictEqual(result.decision, 'APPROVED');

    const reviews = await getCandidateReviews(testReviewsPath);
    assert.strictEqual(reviews.length, 1);
    assert.deepStrictEqual(reviews[0], validReview);

    const fullFile = await readReviewsFile(testReviewsPath);
    assert.strictEqual(fullFile.version, 1);
    assert.strictEqual(fullFile.reviews.length, 1);
  });

  it('2. second review for the same candidate is rejected', async () => {
    // 1st review succeeds
    await writeCandidateReviewGuarded(validReview, {
      reviewsPath: testReviewsPath,
      auditPath: testAuditPath,
    });

    // 2nd review with different review ID but SAME candidate_work_id
    const secondReview: CandidateReviewDecision = {
      ...validReview,
      id: 'rev_1727654409999_789abc',
      decision: 'REJECTED',
      reviewer_notes: 'Attempting to overwrite with rejection',
      decided_at: '2026-09-30T10:05:00.000Z',
    };

    await assert.rejects(
      async () => {
        await writeCandidateReviewGuarded(secondReview, {
          reviewsPath: testReviewsPath,
          auditPath: testAuditPath,
        });
      },
      (err: any) => {
        assert.ok(err.message.includes('has already received a human review decision (APPROVED)'));
        assert.strictEqual(err.statusCode, 409);
        return true;
      }
    );
  });

  it('3. second review does not change the stored first decision', async () => {
    await writeCandidateReviewGuarded(validReview, {
      reviewsPath: testReviewsPath,
      auditPath: testAuditPath,
    });

    const secondReview: CandidateReviewDecision = {
      ...validReview,
      id: 'rev_1727654409999_789abc',
      decision: 'REJECTED',
      reviewer_notes: 'Attempted override',
    };

    try {
      await writeCandidateReviewGuarded(secondReview, {
        reviewsPath: testReviewsPath,
        auditPath: testAuditPath,
      });
    } catch {
      // Expected rejection
    }

    const reviews = await getCandidateReviews(testReviewsPath);
    assert.strictEqual(reviews.length, 1);
    assert.strictEqual(reviews[0].decision, 'APPROVED');
    assert.strictEqual(reviews[0].id, validReview.id);
    assert.strictEqual(reviews[0].reviewer_notes, validReview.reviewer_notes);
  });

  it('4. second review does not create another audit entry', async () => {
    await writeCandidateReviewGuarded(validReview, {
      reviewsPath: testReviewsPath,
      auditPath: testAuditPath,
    });

    const secondReview: CandidateReviewDecision = {
      ...validReview,
      id: 'rev_1727654409999_789abc',
      decision: 'REJECTED',
    };

    try {
      await writeCandidateReviewGuarded(secondReview, {
        reviewsPath: testReviewsPath,
        auditPath: testAuditPath,
      });
    } catch {
      // Expected rejection
    }

    const auditContent = await fs.readFile(testAuditPath, 'utf-8');
    const lines = auditContent.trim().split('\n').filter(Boolean);
    assert.strictEqual(lines.length, 1, 'Audit log must contain only the first successful review entry');
    const parsed = JSON.parse(lines[0]);
    assert.strictEqual(parsed.review_id, validReview.id);
  });

  it('5. duplicate review ID is still rejected', async () => {
    await writeCandidateReviewGuarded(validReview, {
      reviewsPath: testReviewsPath,
      auditPath: testAuditPath,
    });

    // Review with same ID but different candidate_work_id
    const duplicateIdReview: CandidateReviewDecision = {
      id: validReview.id,
      candidate_work_id: 'cwi_another_candidate_99',
      signal_id: validReview.signal_id,
      decision: 'APPROVED',
      decided_at: '2026-09-30T10:10:00.000Z',
    };

    await assert.rejects(
      async () => {
        await writeCandidateReviewGuarded(duplicateIdReview, {
          reviewsPath: testReviewsPath,
          auditPath: testAuditPath,
        });
      },
      (err: any) => {
        assert.ok(err.message.includes(`a review with id "${validReview.id}" already exists`));
        assert.strictEqual(err.statusCode, 409);
        return true;
      }
    );

    const reviews = await getCandidateReviews(testReviewsPath);
    assert.strictEqual(reviews.length, 1);
  });

  it('6. multiple distinct candidates can each be reviewed once', async () => {
    const review1: CandidateReviewDecision = {
      ...validReview,
      id: 'rev_1727654400000_111111',
      candidate_work_id: 'cwi_candidate_alpha_01',
      decision: 'APPROVED',
    };
    const review2: CandidateReviewDecision = {
      ...validReview,
      id: 'rev_1727654401000_222222',
      candidate_work_id: 'cwi_candidate_beta_02',
      decision: 'REJECTED',
      reviewer_notes: 'Duplicate task.',
    };

    await writeCandidateReviewGuarded(review1, {
      reviewsPath: testReviewsPath,
      auditPath: testAuditPath,
    });
    await writeCandidateReviewGuarded(review2, {
      reviewsPath: testReviewsPath,
      auditPath: testAuditPath,
    });

    const reviews = await getCandidateReviews(testReviewsPath);
    assert.strictEqual(reviews.length, 2);
    assert.strictEqual(reviews[0].candidate_work_id, 'cwi_candidate_alpha_01');
    assert.strictEqual(reviews[1].candidate_work_id, 'cwi_candidate_beta_02');
  });

  it('7. invalid review is rejected without creating file or audit entry', async () => {
    const invalidReview: any = {
      id: '',
      candidate_work_id: validReview.candidate_work_id,
      signal_id: validReview.signal_id,
      decision: 'UNKNOWN_DECISION',
      decided_at: 'not-a-timestamp',
    };

    await assert.rejects(
      async () => {
        await writeCandidateReviewGuarded(invalidReview, {
          reviewsPath: testReviewsPath,
          auditPath: testAuditPath,
        });
      },
      (err: any) => {
        assert.ok(err.message.includes('Guarded review write rejected'));
        return true;
      }
    );

    const reviews = await getCandidateReviews(testReviewsPath);
    assert.strictEqual(reviews.length, 0);

    const auditContent = await fs.readFile(testAuditPath, 'utf-8');
    assert.strictEqual(auditContent.trim(), '');
  });

  it('8. atomic write cleans up temporary files on failure', async () => {
    // Attempt writing to directory path itself instead of file, which fails on fs.rename/writeFile
    await assert.rejects(
      async () => {
        await writeCandidateReviewGuarded(validReview, {
          reviewsPath: tempDir,
          auditPath: testAuditPath,
        });
      },
      (err: any) => {
        assert.ok(err.message.includes('Atomic persistence failure') || err.message.includes('Failed to read'));
        return true;
      }
    );

    const files = await fs.readdir(tempDir);
    const tmpFiles = files.filter((f) => f.startsWith('.tmp-reviews'));
    assert.strictEqual(tmpFiles.length, 0, 'Temporary files must be cleaned up');
  });

  it('9. audit entry is created and contains server review metadata', async () => {
    await writeCandidateReviewGuarded(validReview, {
      reviewsPath: testReviewsPath,
      auditPath: testAuditPath,
    });

    const auditContent = await fs.readFile(testAuditPath, 'utf-8');
    const lines = auditContent.trim().split('\n').filter(Boolean);
    assert.strictEqual(lines.length, 1);

    const parsedAudit = JSON.parse(lines[0]);
    assert.strictEqual(parsedAudit.event, 'candidate_review_decided');
    assert.strictEqual(parsedAudit.review_id, validReview.id);
    assert.strictEqual(parsedAudit.candidate_work_id, validReview.candidate_work_id);
    assert.strictEqual(parsedAudit.signal_id, validReview.signal_id);
    assert.strictEqual(parsedAudit.decision, 'APPROVED');
    assert.strictEqual(parsedAudit.timestamp, validReview.decided_at);
    assert.strictEqual(parsedAudit.reviewer_notes, validReview.reviewer_notes);
  });

  it('10. readReviewsFile returns empty structure if file does not exist yet', async () => {
    const nonExistentPath = path.join(tempDir, 'does-not-exist.json');
    const result = await readReviewsFile(nonExistentPath);
    assert.strictEqual(result.version, 1);
    assert.deepStrictEqual(result.reviews, []);
  });
});
