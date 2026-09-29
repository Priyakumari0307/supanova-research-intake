import { randomBytes } from 'crypto';
import {
  CreateResearchSignalInput,
  CreateResearchSignalResult,
  ResearchInputKind,
  ResearchSignal,
  ResearchSignalAuditEntry,
  ResearchSignalSources,
} from '../types/signal.types';
import { Project, FallbacksConfig, FixtureConfig, RoutingHint } from '../types/fixture.types';
import { FetchSourceOptions, FetchedSourceResult } from '../types/fetcher.types';
import { fetchSource, validateFetchUrl } from './fetcher.service';
import { routeSignal, routeSignalDeterministic, RoutingContext } from './routing.service';
import { getFixtureConfig, getRoutingHints, FixtureError } from './fixture.service';
import { validateClientInput, validateResearchSignalRecord } from './signal-validator.service';
import { writeSignalToLedgerGuarded, GuardedWriteOptions } from './ledger-storage.service';

export interface SignalCreationOptions {
  guardedWrite?: GuardedWriteOptions;
  fetchOptions?: FetchSourceOptions;
  routingContext?: RoutingContext;
  persist?: boolean; // Default true, can be set to false for dry-run if needed
}

/**
 * Sanitizes a title into a URL/id-safe slug.
 */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
}

/**
 * Formats a Date object to YYYY-MM-DD.
 */
function formatDate(d: Date): string {
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Formats a Date object to HH:MM.
 */
function formatTime(d: Date): string {
  const hours = String(d.getUTCHours()).padStart(2, '0');
  const minutes = String(d.getUTCMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

/**
 * Generates an immutable, collision-resistant server-managed ID and match key.
 */
export function generateSignalIdentity(title: string, dateStr: string): { id: string; match_key: string } {
  const baseSlug = slugify(title) || 'signal';
  const randomSuffix = randomBytes(3).toString('hex'); // 6 hex characters
  const match_key = `research_${baseSlug}_${randomSuffix}`;
  const id = `${dateStr}_${match_key}`;
  return { id, match_key };
}

/**
 * Derives a human-readable title from content or URL if not explicitly provided.
 */
function deriveTitle(
  explicitTitle: string | undefined,
  fetchedTitle: string | null | undefined,
  content: string,
  url: string | undefined
): string {
  if (explicitTitle && explicitTitle.trim()) {
    return explicitTitle.trim();
  }
  if (fetchedTitle && fetchedTitle.trim()) {
    return fetchedTitle.trim();
  }
  if (url) {
    try {
      const parsed = new URL(url);
      const pathname = parsed.pathname.replace(/^\/|\/$/g, '').replace(/[\/-]+/g, ' ');
      if (pathname) return `${parsed.hostname} - ${pathname}`;
      return parsed.hostname;
    } catch {
      return url;
    }
  }
  const firstLine = content.split('\n')[0].trim();
  if (firstLine) {
    return firstLine.slice(0, 60);
  }
  return 'Untitled Research Signal';
}

/**
 * Pipeline to create and persist a new research signal.
 *
 * Sequence:
 * 1. Validate raw client input (reject client-injected ID, status, project, empty input).
 * 2. Ingest payload:
 *    - For text: preserve original user text as untrusted data.
 *    - For URL: safely fetch and sanitize using safe fetcher service.
 * 3. Run deterministic project routing (Phase 4).
 * 4. Generate immutable server-side identity fields (id, match_key).
 * 5. Construct conforming ResearchSignal object with clean status {}.
 * 6. Validate complete record shape.
 * 7. Write atomically through the single guarded write path.
 */
export async function createResearchSignal(
  input: CreateResearchSignalInput,
  options: SignalCreationOptions = {}
): Promise<CreateResearchSignalResult> {
  // Step 1: Validate client input
  const inputValidation = validateClientInput(input);
  if (!inputValidation.isValid) {
    throw new FixtureError(
      `Signal creation rejected: ${inputValidation.errors.join(' ')}`,
      400
    );
  }

  // Load configuration and hints if not explicitly provided
  const [fixtureConfig, routingHints] = await Promise.all([
    options.routingContext ? null : getFixtureConfig(),
    options.routingContext ? null : getRoutingHints(),
  ]);

  const projects: Project[] = options.routingContext?.projects || fixtureConfig?.projects || [];
  const hints: RoutingHint[] = options.routingContext?.hints || routingHints || [];
  const fallbacks: FallbacksConfig = options.routingContext?.fallbacks || fixtureConfig?.fallbacks || {
    unrouted: 'internal_unsorted',
    unknown_project: 'unclassified',
  };

  const now = new Date();
  const dateStr = formatDate(now);
  const timeStr = formatTime(now);

  // Step 2: Ingest and sanitize payload
  const rawUrl = typeof input.url === 'string' ? input.url.trim() : '';
  const isUrlInput = rawUrl.length > 0;
  const inputKind: ResearchInputKind = isUrlInput ? 'url' : 'text';

  let content = '';
  let fetchedSource: FetchedSourceResult | undefined;
  let originalUrl: string | null = null;
  let finalUrl: string | null = null;
  let contentType: string | null = 'text/plain';

  if (isUrlInput) {
    originalUrl = rawUrl;
    fetchedSource = await fetchSource(rawUrl, options.fetchOptions);
    if (fetchedSource.status === 'error') {
      throw new FixtureError(
        `Failed to fetch URL source: ${fetchedSource.error || 'Unknown error'}`,
        400
      );
    }
    content = fetchedSource.content;
    finalUrl = fetchedSource.finalUrl;
    contentType = fetchedSource.contentType;
  } else {
    content = (input.text || '').trim();
  }

  const title = deriveTitle(input.title, fetchedSource?.title, content, rawUrl || undefined);

  // Step 3: Run deterministic routing
  const routingContext: RoutingContext = options.routingContext || {
    projects,
    hints,
    fallbacks,
  };

  const routingResult = routeSignalDeterministic(
    {
      text: content,
      url: originalUrl || undefined,
      title,
    },
    routingContext
  );

  // Step 4: Server-generated identity fields
  const { id, match_key } = generateSignalIdentity(title, dateStr);

  // Step 5: Construct conforming ResearchSignal
  const sources: ResearchSignalSources = {
    granola_note: null,
    transcript: null,
    recording: null,
    url: originalUrl,
    content,
    content_type: contentType,
    fetched_at: isUrlInput && fetchedSource ? fetchedSource.fetchedAt : now.toISOString(),
    final_url: finalUrl,
    input_kind: inputKind,
  };

  const signal: ResearchSignal = {
    id,
    match_key,
    type: 'research',
    date: dateStr,
    time: timeStr,
    title,
    detected_on: dateStr,
    attendees: [],
    projects: [routingResult.projectId], // Deterministically assigned project or fallback
    summary: null,
    expected_files: [],
    notes: input.notes?.trim() || null,
    status: {}, // Clean initial state, no client-injected status
    sources,
    routing_diagnostics: {
      outcome: routingResult.outcome,
      matchMethod: routingResult.matchMethod,
      isAmbiguous: routingResult.isAmbiguous,
      candidateProjects: routingResult.candidateProjects,
      invalidHints: routingResult.invalidHints,
      diagnostics: routingResult.diagnostics,
    },
  };

  // Step 6: Validate constructed record before writing
  const recordValidation = validateResearchSignalRecord(signal, projects, fallbacks);
  if (!recordValidation.isValid) {
    throw new FixtureError(
      `Signal record validation failed: ${recordValidation.errors.join(' ')}`,
      500
    );
  }

  // Step 7: Construct audit trail entry
  const auditEntry: ResearchSignalAuditEntry = {
    event: 'research_signal_created',
    signal_id: signal.id,
    timestamp: now.toISOString(),
    project: signal.projects[0],
    input_type: inputKind,
    routing_outcome: routingResult.outcome,
    routing_method: routingResult.matchMethod,
    title: signal.title,
    source_url: originalUrl,
    content_length: content.length,
  };

  // Step 8: Single guarded write path
  if (options.persist !== false) {
    await writeSignalToLedgerGuarded(signal, auditEntry, options.guardedWrite);
  }

  return {
    status: 'created',
    signal,
    routing: routingResult,
    fetchedSource,
    auditEntry,
  };
}
