import { Project, FallbacksConfig } from '../types/fixture.types';
import { CreateResearchSignalInput, ResearchSignal } from '../types/signal.types';
import { validateFetchUrl } from './fetcher.service';

export interface ValidationOutcome {
  isValid: boolean;
  errors: string[];
}

/**
 * Validates untrusted user input before signal creation begins.
 * Rejects client attempts to inject identity, status, or project assignments.
 */
export function validateClientInput(input: unknown): ValidationOutcome {
  const errors: string[] = [];

  if (!input || typeof input !== 'object') {
    return { isValid: false, errors: ['Input must be a valid JSON object.'] };
  }

  const raw = input as Record<string, unknown>;

  // Security Check 1: Client cannot inject server-managed identity fields
  if (raw.id !== undefined && raw.id !== null) {
    errors.push('Client injection prohibited: "id" is generated server-side.');
  }
  if (raw.match_key !== undefined && raw.match_key !== null) {
    errors.push('Client injection prohibited: "match_key" is generated server-side.');
  }

  // Security Check 2: Client cannot inject status or workflow state
  if (raw.status !== undefined && raw.status !== null) {
    errors.push('Client injection prohibited: "status" cannot be provided on creation.');
  }

  // Security Check 3: Client cannot inject arbitrary projects (project assignment comes strictly from server-side routing)
  if (raw.projects !== undefined && raw.projects !== null) {
    errors.push('Client injection prohibited: "projects" must be resolved by server-side routing.');
  }

  // Check input payload (must have non-empty text or valid URL)
  const text = typeof raw.text === 'string' ? raw.text.trim() : '';
  const url = typeof raw.url === 'string' ? raw.url.trim() : '';

  if (!text && !url) {
    errors.push('Either a non-empty "text" paragraph or a valid "url" must be provided.');
  }

  if (raw.text !== undefined && typeof raw.text === 'string' && raw.text.trim() === '') {
    errors.push('Text input cannot be empty or whitespace only.');
  }

  if (raw.url !== undefined && typeof raw.url === 'string') {
    const urlValidation = validateFetchUrl(raw.url);
    if (!urlValidation.isValid) {
      errors.push(`Invalid URL provided: ${urlValidation.error}`);
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Validates a constructed ResearchSignal object before it enters the guarded write path.
 * Guarantees that only strictly conforming, safely routed signals can be written to the ledger.
 */
export function validateResearchSignalRecord(
  signal: ResearchSignal,
  validProjects: Project[],
  fallbacks: FallbacksConfig
): ValidationOutcome {
  const errors: string[] = [];

  if (!signal) {
    return { isValid: false, errors: ['Signal record is missing or null.'] };
  }

  // Verify identity fields
  if (!signal.id || typeof signal.id !== 'string' || signal.id.trim() === '') {
    errors.push('Signal must have a valid server-generated "id".');
  }

  if (!signal.match_key || typeof signal.match_key !== 'string' || signal.match_key.trim() === '') {
    errors.push('Signal must have a valid server-generated "match_key".');
  }

  // Verify type
  if (signal.type !== 'research') {
    errors.push(`Signal type must be "research", received "${signal.type}".`);
  }

  // Verify date and time formatting
  if (!/^\d{4}-\d{2}-\d{2}$/.test(signal.date)) {
    errors.push(`Signal "date" must be formatted as YYYY-MM-DD, received "${signal.date}".`);
  }

  if (!/^\d{2}:\d{2}$/.test(signal.time)) {
    errors.push(`Signal "time" must be formatted as HH:MM, received "${signal.time}".`);
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(signal.detected_on)) {
    errors.push(`Signal "detected_on" must be formatted as YYYY-MM-DD, received "${signal.detected_on}".`);
  }

  // Verify title
  if (!signal.title || typeof signal.title !== 'string' || signal.title.trim() === '') {
    errors.push('Signal must have a non-empty "title".');
  }

  // Verify project assignment (must be in active configured projects or fallback)
  const allowedProjectIds = new Set([
    ...validProjects.filter((p) => p.active !== false).map((p) => p.id),
    fallbacks.unrouted || 'internal_unsorted',
  ]);

  if (!Array.isArray(signal.projects) || signal.projects.length === 0) {
    errors.push('Signal "projects" must contain at least one project.');
  } else {
    for (const proj of signal.projects) {
      if (!allowedProjectIds.has(proj)) {
        errors.push(`Project "${proj}" is not a valid active project or recognized fallback.`);
      }
    }
  }

  // Verify status is an empty object on creation
  if (!signal.status || typeof signal.status !== 'object' || Object.keys(signal.status).length > 0) {
    errors.push('New research signals must be created with an empty status object {}.');
  }

  // Verify sources
  if (!signal.sources || typeof signal.sources !== 'object') {
    errors.push('Signal must contain a valid "sources" object.');
  } else {
    if (signal.sources.input_kind !== 'text' && signal.sources.input_kind !== 'url') {
      errors.push('Signal sources "input_kind" must be "text" or "url".');
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}
