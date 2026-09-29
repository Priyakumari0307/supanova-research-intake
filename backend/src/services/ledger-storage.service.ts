import path from 'path';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import { randomUUID } from 'crypto';
import { SignalLedger } from '../types/fixture.types';
import { ResearchSignal, ResearchSignalAuditEntry } from '../types/signal.types';
import { getFixtureDir, FixtureError } from './fixture.service';

export interface GuardedWriteOptions {
  ledgerPath?: string;
  auditPath?: string;
}

/**
 * Resolves the default path to the signal ledger file.
 */
export function getLedgerFilePath(customPath?: string): string {
  if (customPath) return path.resolve(customPath);
  return path.join(getFixtureDir(), 'signal-ledger.json');
}

/**
 * Resolves the default path to the append-only audit log file.
 */
export function getAuditFilePath(customPath?: string): string {
  if (customPath) return path.resolve(customPath);
  return path.join(getFixtureDir(), 'run-log.jsonl');
}

/**
 * Reads and parses the current signal ledger from disk.
 */
export async function readLedger(ledgerPath?: string): Promise<SignalLedger> {
  const filePath = getLedgerFilePath(ledgerPath);
  let raw: string;
  try {
    raw = await fs.readFile(filePath, 'utf-8');
  } catch (err: any) {
    throw new FixtureError(`Failed to read signal ledger at ${filePath}: ${err.message}`, 500);
  }

  try {
    const parsed = JSON.parse(raw) as SignalLedger;
    if (!parsed || !Array.isArray(parsed.signals)) {
      throw new FixtureError('Invalid signal ledger shape: missing "signals" array.', 500);
    }
    return parsed;
  } catch (err: any) {
    throw new FixtureError(`Malformed JSON in signal ledger: ${err.message}`, 500);
  }
}

/**
 * SINGLE GUARDED WRITE PATH
 *
 * Persists a new research signal to the local ledger with strict atomicity and an append-only audit trail.
 *
 * Guarantees:
 * 1. Atomicity: Writes via a temporary file + atomic rename (fs.rename) so no partial or corrupted file can ever be written.
 * 2. Idempotency & Deduplication: Rejects signals with existing IDs.
 * 3. Preservation: All existing signals are preserved in their entirety.
 * 4. Audit Trail: Appends a structured audit record to the local JSONL audit file.
 * 5. Rollback / Cleanup: If the atomic write fails, the temporary file is deleted and the existing ledger is left untouched.
 */
export async function writeSignalToLedgerGuarded(
  newSignal: ResearchSignal,
  auditEntry: ResearchSignalAuditEntry,
  options: GuardedWriteOptions = {}
): Promise<void> {
  const targetLedgerPath = getLedgerFilePath(options.ledgerPath);
  const targetAuditPath = getAuditFilePath(options.auditPath);
  const ledgerDir = path.dirname(targetLedgerPath);

  // 1. Read existing ledger
  const currentLedger = await readLedger(targetLedgerPath);

  // 2. Prevent duplicate ID collisions
  const existingIndex = currentLedger.signals.findIndex((s) => s.id === newSignal.id);
  if (existingIndex !== -1) {
    throw new FixtureError(
      `Guarded write rejected: a signal with id "${newSignal.id}" already exists in the ledger.`,
      409
    );
  }

  // 3. Construct updated ledger preserving all existing signals
  const updatedLedger: SignalLedger = {
    version: currentLedger.version || 4,
    signals: [...currentLedger.signals, newSignal],
  };

  const serializedLedger = JSON.stringify(updatedLedger, null, 2) + '\n';

  // 4. Atomic Write: Write to a unique temporary file in the same directory first
  const tempFileName = `.tmp-ledger-${Date.now()}-${randomUUID()}.json`;
  const tempFilePath = path.join(ledgerDir, tempFileName);

  try {
    await fs.writeFile(tempFilePath, serializedLedger, 'utf-8');

    // Rename atomically replaces target file
    await fs.rename(tempFilePath, targetLedgerPath);
  } catch (err: any) {
    // Clean up temporary file if rename or write failed
    try {
      if (existsSync(tempFilePath)) {
        await fs.unlink(tempFilePath);
      }
    } catch {
      // Ignore cleanup error
    }
    throw new FixtureError(
      `Atomic persistence failure while writing to ledger: ${err.message}`,
      500
    );
  }

  // 5. Append-only Audit Trail: Record audit line to JSONL file
  try {
    const auditLine = JSON.stringify(auditEntry) + '\n';
    await fs.appendFile(targetAuditPath, auditLine, 'utf-8');
  } catch (err: any) {
    // Log warning if audit append failed, but do not corrupt ledger state
    console.error(`[WARN] Failed to write audit trail to ${targetAuditPath}: ${err.message}`);
  }
}
