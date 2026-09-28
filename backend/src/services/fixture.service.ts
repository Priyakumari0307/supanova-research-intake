import path from 'path';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import {
  FixtureConfig,
  Project,
  SignalLedger,
  Signal,
  RoutingHint,
  RoutingConfigResponse,
} from '../types/fixture.types';

export class FixtureError extends Error {
  public statusCode: number;
  constructor(message: string, statusCode = 500) {
    super(message);
    this.name = 'FixtureError';
    this.statusCode = statusCode;
  }
}

/**
 * Resolves the absolute path to the fixture directory.
 * Checks environment variable FIXTURE_DIR first, then common relative project paths.
 */
export function getFixtureDir(): string {
  if (process.env.FIXTURE_DIR && existsSync(process.env.FIXTURE_DIR)) {
    return path.resolve(process.env.FIXTURE_DIR);
  }

  const candidates = [
    path.resolve(process.cwd(), 'fixture'),
    path.resolve(process.cwd(), '..', 'fixture'),
    path.resolve(__dirname, '../../..', 'fixture'),
    path.resolve(__dirname, '../..', 'fixture'),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  throw new FixtureError('Fixture directory could not be located on the server filesystem.');
}

/**
 * Generic helper to safely read and parse a JSON fixture file.
 */
async function readFixtureJson<T>(filename: string): Promise<T> {
  const fixtureDir = getFixtureDir();
  const filePath = path.join(fixtureDir, filename);

  let rawContent: string;
  try {
    rawContent = await fs.readFile(filePath, 'utf-8');
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      throw new FixtureError(`Fixture file not found: ${filename}`, 404);
    }
    throw new FixtureError(`Failed to read fixture file ${filename}: ${err.message}`, 500);
  }

  try {
    return JSON.parse(rawContent) as T;
  } catch (err: any) {
    throw new FixtureError(`Malformed JSON in fixture file ${filename}: ${err.message}`, 500);
  }
}

/**
 * Reads the full config from fixture/config.json
 */
export async function getFixtureConfig(): Promise<FixtureConfig> {
  return readFixtureJson<FixtureConfig>('config.json');
}

/**
 * Reads projects list from fixture/config.json
 */
export async function getProjects(): Promise<Project[]> {
  const config = await getFixtureConfig();
  if (!config || !Array.isArray(config.projects)) {
    throw new FixtureError('Invalid config.json: "projects" array is missing or invalid', 500);
  }
  return config.projects;
}

/**
 * Reads the entire signal ledger from fixture/signal-ledger.json
 */
export async function getSignalLedger(): Promise<SignalLedger> {
  return readFixtureJson<SignalLedger>('signal-ledger.json');
}

/**
 * Reads only the signals array from fixture/signal-ledger.json
 */
export async function getSignals(): Promise<Signal[]> {
  const ledger = await getSignalLedger();
  if (!ledger || !Array.isArray(ledger.signals)) {
    throw new FixtureError('Invalid signal-ledger.json: "signals" array is missing or invalid', 500);
  }
  return ledger.signals;
}

/**
 * Reads routing hints from fixture/routing-hints.json
 */
export async function getRoutingHints(): Promise<RoutingHint[]> {
  const hints = await readFixtureJson<RoutingHint[]>('routing-hints.json');
  if (!Array.isArray(hints)) {
    throw new FixtureError('Invalid routing-hints.json: root array is missing or invalid', 500);
  }
  return hints;
}

/**
 * Reads aggregate routing configuration (fallbacks, internal domains, and hints)
 */
export async function getRoutingConfig(): Promise<RoutingConfigResponse> {
  const [config, hints] = await Promise.all([getFixtureConfig(), getRoutingHints()]);
  return {
    fallbacks: config.fallbacks,
    internal_domains: config.internal_domains,
    hints,
  };
}
