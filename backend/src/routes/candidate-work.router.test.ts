import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Server } from 'http';
import fs from 'fs/promises';
import path from 'path';
import { app } from '../app';
import { getFixtureDir, getSignals } from '../services/fixture.service';

describe('POST /api/candidate-work/preview Route', () => {
  let server: Server;
  let baseUrl: string;

  before(async () => {
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

  after(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  it('1. returns preview candidates for a valid signal in the ledger', async () => {
    const signals = await getSignals();
    assert.ok(signals.length > 0, 'Fixture should have signals');
    const targetSignal = signals[0];

    const res = await fetch(`${baseUrl}/api/candidate-work/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        signal_id: targetSignal.id,
      }),
    });

    assert.strictEqual(res.status, 200);
    const data = (await res.json()) as any;
    assert.strictEqual(data.status, 'preview');
    assert.strictEqual(data.signal_id, targetSignal.id);
    assert.ok(Array.isArray(data.candidates));
  });

  it('2. returns an empty candidates array for a non-actionable signal', async () => {
    const signals = await getSignals();
    // Non-actionable meeting signal
    const targetSignal = signals.find((s) => s.id === '2026-07-06_atlas_permit_intake') || signals[0];

    const res = await fetch(`${baseUrl}/api/candidate-work/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        signal_id: targetSignal.id,
      }),
    });

    assert.strictEqual(res.status, 200);
    const data = (await res.json()) as any;
    assert.strictEqual(data.status, 'preview');
    assert.strictEqual(data.signal_id, targetSignal.id);
    assert.ok(Array.isArray(data.candidates));
  });

  it('3. returns 404 when signal does not exist', async () => {
    const res = await fetch(`${baseUrl}/api/candidate-work/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        signal_id: 'non_existent_signal_999',
      }),
    });

    assert.strictEqual(res.status, 404);
    const data = (await res.json()) as any;
    assert.ok(data.message.includes('Signal not found'));
  });

  it('4. returns 400 when signal_id is missing or empty', async () => {
    const resEmpty = await fetch(`${baseUrl}/api/candidate-work/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ signal_id: '' }),
    });
    assert.strictEqual(resEmpty.status, 400);

    const resMissing = await fetch(`${baseUrl}/api/candidate-work/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.strictEqual(resMissing.status, 400);
  });

  it('5. rejects client attempts to inject candidate status, id, project, or evidence', async () => {
    const signals = await getSignals();
    const validSignalId = signals[0].id;

    const payloads = [
      { signal_id: validSignalId, status: 'APPROVED' },
      { signal_id: validSignalId, id: 'injected_id' },
      { signal_id: validSignalId, project_id: 'custom_proj' },
      { signal_id: validSignalId, evidence: ['fake evidence'] },
      { signal_id: validSignalId, confidence: 1.0 },
      { signal_id: validSignalId, candidates: [] },
    ];

    for (const p of payloads) {
      const res = await fetch(`${baseUrl}/api/candidate-work/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(p),
      });

      assert.strictEqual(res.status, 400);
      const data = (await res.json()) as any;
      assert.ok(data.message.includes('Client injection prohibited'));
    }
  });

  it('6. preview does not modify the signal ledger or audit log', async () => {
    const fixtureDir = getFixtureDir();
    const ledgerPath = path.join(fixtureDir, 'signal-ledger.json');
    const auditPath = path.join(fixtureDir, 'run-log.jsonl');

    const ledgerBefore = await fs.readFile(ledgerPath, 'utf-8');
    const auditBefore = await fs.readFile(auditPath, 'utf-8');

    const signals = await getSignals();
    const validSignalId = signals[0].id;

    const res = await fetch(`${baseUrl}/api/candidate-work/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        signal_id: validSignalId,
      }),
    });

    assert.strictEqual(res.status, 200);

    const ledgerAfter = await fs.readFile(ledgerPath, 'utf-8');
    const auditAfter = await fs.readFile(auditPath, 'utf-8');

    assert.strictEqual(ledgerBefore, ledgerAfter, 'signal-ledger.json must not be modified');
    assert.strictEqual(auditBefore, auditAfter, 'run-log.jsonl must not be modified');
  });

  it('7. all returned preview candidates have status DRAFT', async () => {
    const signals = await getSignals();
    const validSignalId = signals[0].id;

    const res = await fetch(`${baseUrl}/api/candidate-work/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        signal_id: validSignalId,
      }),
    });

    assert.strictEqual(res.status, 200);
    const data = (await res.json()) as any;
    for (const c of data.candidates) {
      assert.strictEqual(c.status, 'DRAFT');
    }
  });
});
