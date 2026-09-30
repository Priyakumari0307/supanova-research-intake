import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { Server } from 'http';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { randomUUID } from 'crypto';
import { app } from '../app';
import { getFixtureDir, getSignals } from '../services/fixture.service';
import { generateCandidateWorkItems } from '../services/candidate-work.service';
import { CandidateWorkItem } from '../types/candidate-work.types';
import {
  CandidateReviewDecision,
  isValidIsoTimestamp,
} from '../types/candidate-review.types';
import { SignalLedger } from '../types/fixture.types';

describe('POST & GET /api/candidate-work/reviews Route', () => {
  let server: Server;
  let baseUrl: string;
  let tempFixtureDir: string;
  let originalFixtureDirEnv: string | undefined;
  let validCandidate: CandidateWorkItem;

  const testLedger: SignalLedger = {
    version: 4,
    signals: [
      {
        id: '2026-09-29_research_northwind_audit_412a',
        match_key: 'research_northwind_audit_412a',
        type: 'research',
        date: '2026-09-29',
        time: '14:30',
        title: 'Northwind Sync Log Audit',
        detected_on: '2026-09-29',
        attendees: [],
        projects: ['northwind'],
        summary: null,
        expected_files: [],
        notes: 'Actionable research item',
        status: {},
        sources: {
          granola_note: null,
          transcript: null,
          recording: null,
          url: null,
          content: 'During order sync, we noticed latency spikes. We should investigate the database index fragmentation on orders table.',
          content_type: 'text/plain',
          fetched_at: '2026-09-29T14:30:00Z',
          final_url: null,
          input_kind: 'text',
        },
      } as any,
    ],
  };

  before(async () => {
    originalFixtureDirEnv = process.env.FIXTURE_DIR;
    const realFixtureDir = getFixtureDir();

    // Create isolated temporary fixture directory
    tempFixtureDir = path.join(os.tmpdir(), `test-fixture-review-${randomUUID()}`);
    await fs.mkdir(tempFixtureDir, { recursive: true });

    // Copy config.json and routing-hints.json
    const configData = await fs.readFile(path.join(realFixtureDir, 'config.json'), 'utf-8');
    const hintsData = await fs.readFile(path.join(realFixtureDir, 'routing-hints.json'), 'utf-8');
    await fs.writeFile(path.join(tempFixtureDir, 'config.json'), configData, 'utf-8');
    await fs.writeFile(path.join(tempFixtureDir, 'routing-hints.json'), hintsData, 'utf-8');
    await fs.writeFile(path.join(tempFixtureDir, 'signal-ledger.json'), JSON.stringify(testLedger, null, 2), 'utf-8');
    await fs.writeFile(
      path.join(tempFixtureDir, 'candidate-reviews.json'),
      JSON.stringify({ version: 1, reviews: [] }, null, 2),
      'utf-8'
    );
    await fs.writeFile(path.join(tempFixtureDir, 'run-log.jsonl'), '', 'utf-8');

    // Point fixture directory to temp directory
    process.env.FIXTURE_DIR = tempFixtureDir;

    // Load candidate from test ledger
    const signals = await getSignals();
    for (const s of signals) {
      const candidates = generateCandidateWorkItems(s);
      if (candidates.length > 0) {
        validCandidate = candidates[0];
        break;
      }
    }
    assert.ok(validCandidate, 'Must have at least one candidate work item in test fixtures');

    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        if (addr && typeof addr === 'object') {
          baseUrl = `http://127.0.0.1:${addr.port}`;
        }
        resolve();
      });
    });
  });

  beforeEach(async () => {
    if (tempFixtureDir) {
      await fs.writeFile(
        path.join(tempFixtureDir, 'candidate-reviews.json'),
        JSON.stringify({ version: 1, reviews: [] }, null, 2),
        'utf-8'
      );
      await fs.writeFile(path.join(tempFixtureDir, 'run-log.jsonl'), '', 'utf-8');
    }
  });

  after(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });

    if (originalFixtureDirEnv !== undefined) {
      process.env.FIXTURE_DIR = originalFixtureDirEnv;
    } else {
      delete process.env.FIXTURE_DIR;
    }

    try {
      await fs.rm(tempFixtureDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  });

  it('1. APPROVED succeeds and creates review decision', async () => {
    const res = await fetch(`${baseUrl}/api/candidate-work/${validCandidate.id}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        decision: 'APPROVED',
        reviewer_notes: 'Verified against source evidence. Approved for sprint backlog.',
      }),
    });

    assert.strictEqual(res.status, 200);
    const data = (await res.json()) as CandidateReviewDecision;
    assert.strictEqual(data.decision, 'APPROVED');
    assert.strictEqual(data.candidate_work_id, validCandidate.id);
    assert.strictEqual(data.signal_id, validCandidate.signal_id);
    assert.strictEqual(data.reviewer_notes, 'Verified against source evidence. Approved for sprint backlog.');
    assert.ok(data.id.startsWith('rev_'));
    assert.ok(isValidIsoTimestamp(data.decided_at));
  });

  it('2. REJECTED succeeds and creates review decision', async () => {
    const res = await fetch(`${baseUrl}/api/candidate-work/${validCandidate.id}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        decision: 'REJECTED',
        reviewer_notes: 'Out of scope for current milestone.',
      }),
    });

    assert.strictEqual(res.status, 200);
    const data = (await res.json()) as CandidateReviewDecision;
    assert.strictEqual(data.decision, 'REJECTED');
    assert.strictEqual(data.candidate_work_id, validCandidate.id);
    assert.strictEqual(data.signal_id, validCandidate.signal_id);
    assert.strictEqual(data.reviewer_notes, 'Out of scope for current milestone.');
    assert.ok(data.id.startsWith('rev_'));
    assert.ok(isValidIsoTimestamp(data.decided_at));
  });

  it('3. missing candidateId returns 400', async () => {
    const res = await fetch(`${baseUrl}/api/candidate-work/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        decision: 'APPROVED',
      }),
    });

    assert.strictEqual(res.status, 400);
    const data = (await res.json()) as any;
    assert.ok(data.message.includes('candidateId'));
  });

  it('4. unknown candidate returns 404', async () => {
    const res = await fetch(`${baseUrl}/api/candidate-work/cwi_non_existent_99999/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        decision: 'APPROVED',
      }),
    });

    assert.strictEqual(res.status, 404);
    const data = (await res.json()) as any;
    assert.ok(data.message.includes('Candidate work item not found'));
  });

  it('5. invalid decision rejected', async () => {
    const invalidDecisions = ['PENDING', 'DRAFT', 'ACCEPTED', 'approved', 'REJECT', '', null, 123];

    for (const d of invalidDecisions) {
      const res = await fetch(`${baseUrl}/api/candidate-work/${validCandidate.id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          decision: d,
        }),
      });

      assert.strictEqual(res.status, 400);
      const data = (await res.json()) as any;
      assert.ok(data.message.includes('Invalid review decision'));
    }
  });

  it('6. client id injection rejected', async () => {
    const res = await fetch(`${baseUrl}/api/candidate-work/${validCandidate.id}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        decision: 'APPROVED',
        id: 'rev_custom_client_injected_id',
      }),
    });

    assert.strictEqual(res.status, 400);
    const data = (await res.json()) as any;
    assert.ok(data.message.includes('Client injection prohibited'));
  });

  it('7. client candidate_work_id injection rejected', async () => {
    const res = await fetch(`${baseUrl}/api/candidate-work/${validCandidate.id}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        decision: 'APPROVED',
        candidate_work_id: 'cwi_different_id_999',
      }),
    });

    assert.strictEqual(res.status, 400);
    const data = (await res.json()) as any;
    assert.ok(data.message.includes('Client injection prohibited'));
  });

  it('8. client signal_id injection rejected', async () => {
    const res = await fetch(`${baseUrl}/api/candidate-work/${validCandidate.id}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        decision: 'APPROVED',
        signal_id: 'signal_spoofed_123',
      }),
    });

    assert.strictEqual(res.status, 400);
    const data = (await res.json()) as any;
    assert.ok(data.message.includes('Client injection prohibited'));
  });

  it('9. client decided_at injection rejected', async () => {
    const res = await fetch(`${baseUrl}/api/candidate-work/${validCandidate.id}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        decision: 'APPROVED',
        decided_at: '2020-01-01T00:00:00Z',
      }),
    });

    assert.strictEqual(res.status, 400);
    const data = (await res.json()) as any;
    assert.ok(data.message.includes('Client injection prohibited'));
  });

  it('10. invalid reviewer_notes type rejected', async () => {
    const res = await fetch(`${baseUrl}/api/candidate-work/${validCandidate.id}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        decision: 'APPROVED',
        reviewer_notes: 12345,
      }),
    });

    assert.strictEqual(res.status, 400);
    const data = (await res.json()) as any;
    assert.ok(data.message.includes('reviewer_notes'));
  });

  it('11. valid reviewer_notes accepted (null, omitted, or string)', async () => {
    // Null notes
    const resNull = await fetch(`${baseUrl}/api/candidate-work/${validCandidate.id}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        decision: 'APPROVED',
        reviewer_notes: null,
      }),
    });
    assert.strictEqual(resNull.status, 200);
    const dataNull = (await resNull.json()) as CandidateReviewDecision;
    assert.strictEqual(dataNull.reviewer_notes, null);

    // Reset between requests for the same candidate
    await fs.writeFile(
      path.join(tempFixtureDir, 'candidate-reviews.json'),
      JSON.stringify({ version: 1, reviews: [] }, null, 2),
      'utf-8'
    );

    // Omitted notes
    const resOmitted = await fetch(`${baseUrl}/api/candidate-work/${validCandidate.id}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        decision: 'APPROVED',
      }),
    });
    assert.strictEqual(resOmitted.status, 200);
    const dataOmitted = (await resOmitted.json()) as CandidateReviewDecision;
    assert.strictEqual(dataOmitted.reviewer_notes, null);

    // Reset between requests for the same candidate
    await fs.writeFile(
      path.join(tempFixtureDir, 'candidate-reviews.json'),
      JSON.stringify({ version: 1, reviews: [] }, null, 2),
      'utf-8'
    );

    // String notes
    const resString = await fetch(`${baseUrl}/api/candidate-work/${validCandidate.id}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        decision: 'REJECTED',
        reviewer_notes: 'Duplicate task.',
      }),
    });
    assert.strictEqual(resString.status, 200);
    const dataString = (await resString.json()) as CandidateReviewDecision;
    assert.strictEqual(dataString.reviewer_notes, 'Duplicate task.');
  });

  it('12. server generates id', async () => {
    const res = await fetch(`${baseUrl}/api/candidate-work/${validCandidate.id}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        decision: 'APPROVED',
      }),
    });

    assert.strictEqual(res.status, 200);
    const data = (await res.json()) as CandidateReviewDecision;
    assert.ok(typeof data.id === 'string');
    assert.ok(data.id.startsWith('rev_'));
    assert.ok(data.id.length > 8);
  });

  it('13. server generates decided_at as ISO timestamp', async () => {
    const beforeTime = new Date().getTime() - 1000;
    const res = await fetch(`${baseUrl}/api/candidate-work/${validCandidate.id}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        decision: 'APPROVED',
      }),
    });
    const afterTime = new Date().getTime() + 1000;

    assert.strictEqual(res.status, 200);
    const data = (await res.json()) as CandidateReviewDecision;
    assert.ok(isValidIsoTimestamp(data.decided_at));
    const parsedTime = Date.parse(data.decided_at);
    assert.ok(parsedTime >= beforeTime && parsedTime <= afterTime);
  });

  it('14. review endpoint persists decision to candidate-reviews.json and appends to run-log.jsonl without mutating signal-ledger.json', async () => {
    const ledgerPath = path.join(tempFixtureDir, 'signal-ledger.json');
    const reviewsPath = path.join(tempFixtureDir, 'candidate-reviews.json');
    const auditPath = path.join(tempFixtureDir, 'run-log.jsonl');

    const ledgerBefore = await fs.readFile(ledgerPath, 'utf-8');

    const res = await fetch(`${baseUrl}/api/candidate-work/${validCandidate.id}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        decision: 'APPROVED',
        reviewer_notes: 'Safety check for persistence and audit.',
      }),
    });

    assert.strictEqual(res.status, 200);
    const data = (await res.json()) as CandidateReviewDecision;

    // signal-ledger.json must be untouched
    const ledgerAfter = await fs.readFile(ledgerPath, 'utf-8');
    assert.strictEqual(ledgerBefore, ledgerAfter, 'signal-ledger.json must not be modified');

    // candidate-reviews.json must contain the new review
    const reviewsContent = await fs.readFile(reviewsPath, 'utf-8');
    const reviewsData = JSON.parse(reviewsContent);
    assert.ok(Array.isArray(reviewsData.reviews));
    const found = reviewsData.reviews.find((r: any) => r.id === data.id);
    assert.ok(found, 'Persisted review must be present in candidate-reviews.json');
    assert.strictEqual(found.decision, 'APPROVED');
    assert.strictEqual(found.reviewer_notes, 'Safety check for persistence and audit.');

    // run-log.jsonl must contain candidate_review_decided audit line
    const auditContent = await fs.readFile(auditPath, 'utf-8');
    const auditLines = auditContent.trim().split('\n').filter(Boolean);
    const matchingAudit = auditLines
      .map((line) => JSON.parse(line))
      .find((entry) => entry.event === 'candidate_review_decided' && entry.review_id === data.id);

    assert.ok(matchingAudit, 'Audit log must have candidate_review_decided event');
    assert.strictEqual(matchingAudit.candidate_work_id, validCandidate.id);
    assert.strictEqual(matchingAudit.signal_id, validCandidate.signal_id);
    assert.strictEqual(matchingAudit.decision, 'APPROVED');
  });

  it('15. GET /api/candidate-work/reviews returns persisted reviews', async () => {
    // Post a review first
    await fetch(`${baseUrl}/api/candidate-work/${validCandidate.id}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        decision: 'APPROVED',
      }),
    });

    const res = await fetch(`${baseUrl}/api/candidate-work/reviews`);
    assert.strictEqual(res.status, 200);
    const reviews = (await res.json()) as CandidateReviewDecision[];
    assert.ok(Array.isArray(reviews));
    assert.strictEqual(reviews.length, 1, 'Should return previously persisted reviews');
    assert.ok(reviews.every((r) => r.id.startsWith('rev_')));
  });

  it('16. second review for the same candidate returns 409 Conflict with clear explanation', async () => {
    // 1st review succeeds with 200
    const firstRes = await fetch(`${baseUrl}/api/candidate-work/${validCandidate.id}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        decision: 'APPROVED',
        reviewer_notes: 'Initial approval decision.',
      }),
    });
    assert.strictEqual(firstRes.status, 200);
    const firstData = (await firstRes.json()) as CandidateReviewDecision;
    assert.strictEqual(firstData.decision, 'APPROVED');

    // 2nd review for the same candidate fails with 409
    const secondRes = await fetch(`${baseUrl}/api/candidate-work/${validCandidate.id}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        decision: 'REJECTED',
        reviewer_notes: 'Attempted to change to rejection.',
      }),
    });

    assert.strictEqual(secondRes.status, 409);
    const errData = (await secondRes.json()) as any;
    assert.ok(
      errData.message.includes('has already received a human review decision') ||
      errData.message.includes('already been reviewed')
    );
    assert.ok(errData.message.includes(validCandidate.id));
  });
});
