import {
  Project,
  RoutingHint,
  FallbacksConfig,
  FixtureConfig,
} from '../types/fixture.types';
import {
  RoutingInput,
  RoutingResult,
  MatchEvidence,
  InvalidHintEncountered,
  MatchMethod,
} from '../types/routing.types';
import { getFixtureConfig, getRoutingHints } from './fixture.service';

/**
 * Escapes characters with special meaning in RegExp.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Normalizes user input (either string or structured object) into unified fields.
 */
export function normalizeRoutingInput(input: RoutingInput | string): {
  rawText: string;
  urls: string[];
  titles: string[];
  searchableText: string;
} {
  if (typeof input === 'string') {
    const trimmed = input.trim();
    const isLikelyUrl = /^(https?:\/\/|[a-zA-Z0-9-]+\.[a-zA-Z]{2,})/i.test(trimmed);
    const urls = isLikelyUrl ? [trimmed] : [];
    return {
      rawText: trimmed,
      urls,
      titles: [],
      searchableText: trimmed,
    };
  }

  const rawText = input.text?.trim() || '';
  const url = input.url?.trim() || '';
  const title = input.title?.trim() || '';

  const urls: string[] = [];
  if (url) {
    urls.push(url);
  }

  const parts = [title, rawText, url].filter(Boolean);
  const searchableText = parts.join(' ');

  return {
    rawText,
    urls,
    titles: title ? [title] : [],
    searchableText,
  };
}

/**
 * Extracts normalized hostnames/domains from URLs and text.
 */
export function extractDomains(urls: string[], text: string): string[] {
  const domains = new Set<string>();

  for (const urlStr of urls) {
    if (!urlStr) continue;
    try {
      const fullUrl = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//i.test(urlStr)
        ? urlStr
        : `http://${urlStr}`;
      const parsed = new URL(fullUrl);
      if (parsed.hostname) {
        domains.add(parsed.hostname.toLowerCase().replace(/^www\./, ''));
      }
    } catch {
      // Ignore URL parsing errors on arbitrary strings
    }
  }

  const domainPattern = /\b([a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}\b/g;
  let match: RegExpExecArray | null;
  while ((match = domainPattern.exec(text)) !== null) {
    domains.add(match[0].toLowerCase().replace(/^www\./, ''));
  }

  return Array.from(domains);
}

/**
 * Case-insensitive domain matcher.
 * Matches exact host, subdomain (e.g. app.domain.com -> domain.com), or domain token in text.
 */
export function matchesDomain(
  extractedDomains: string[],
  targetDomain: string,
  searchableText: string
): boolean {
  if (!targetDomain) return false;
  const normalizedTarget = targetDomain.toLowerCase().trim().replace(/^www\./, '');

  for (const extracted of extractedDomains) {
    if (extracted === normalizedTarget || extracted.endsWith(`.${normalizedTarget}`)) {
      return true;
    }
  }

  // Also check if domain appears in the searchable text with URL/domain boundary context
  const escapedTarget = escapeRegex(normalizedTarget);
  const regex = new RegExp(`(?:https?:\\/\\/)?(?:www\\.)?(?:[a-zA-Z0-9-]+\\.)*${escapedTarget}(?:[:\\/\\s?#]|$)`, 'i');
  return regex.test(searchableText);
}

/**
 * Case-insensitive keyword matcher with word-boundary checks.
 * Handles multi-word phrases and prevents false substring collisions.
 */
export function matchesKeyword(searchableText: string, keyword: string): boolean {
  if (!searchableText || !keyword) return false;
  const trimmedKeyword = keyword.trim();
  if (!trimmedKeyword) return false;

  const words = trimmedKeyword.split(/\s+/).map((w) => escapeRegex(w));
  const pattern = words.join('\\s+');

  const startBoundary = /^\w/.test(trimmedKeyword) ? '\\b' : '(?:^|\\W)';
  const endBoundary = /\w$/.test(trimmedKeyword) ? '\\b' : '(?:$|\\W)';

  const regex = new RegExp(`${startBoundary}${pattern}${endBoundary}`, 'i');
  return regex.test(searchableText);
}

export interface RoutingContext {
  projects: Project[];
  hints: RoutingHint[];
  fallbacks: FallbacksConfig;
  internalDomains?: string[];
}

/**
 * Pure deterministic routing logic.
 *
 * Precedence Order:
 * 1. Routing Hints (Operator-defined overrides in routing-hints.json)
 * 2. Project Domains (Authoritative external domain bindings from config.json)
 * 3. Project Keywords (Content/keyword bindings from config.json)
 * 4. Fallback Unrouted (Default to configured fallback: internal_unsorted)
 */
export function routeSignalDeterministic(
  input: RoutingInput | string,
  context: RoutingContext
): RoutingResult {
  const { projects, hints, fallbacks } = context;
  const fallbackUnrouted = fallbacks?.unrouted || 'internal_unsorted';

  const normalized = normalizeRoutingInput(input);
  const extractedDomains = extractDomains(normalized.urls, normalized.searchableText);

  const activeProjects = projects.filter((p) => p.active !== false);
  const validProjectMap = new Map<string, Project>(activeProjects.map((p) => [p.id, p]));
  const validProjectIds = new Set<string>(validProjectMap.keys());

  const diagnostics: string[] = [];
  const invalidHints: InvalidHintEncountered[] = [];

  // =========================================================================
  // TIER 1: Explicit Routing Hints (from routing-hints.json)
  // =========================================================================
  const hintCandidateSet = new Set<string>();
  const hintEvidence: MatchEvidence[] = [];

  for (const hint of hints) {
    let matched = false;
    if (hint.type === 'domain') {
      matched = matchesDomain(extractedDomains, hint.match, normalized.searchableText);
    } else if (hint.type === 'keyword') {
      matched = matchesKeyword(normalized.searchableText, hint.match);
    }

    if (matched) {
      if (validProjectIds.has(hint.project)) {
        hintCandidateSet.add(hint.project);
        hintEvidence.push({
          source: 'routing_hint',
          matchType: hint.type === 'domain' ? 'domain' : 'keyword',
          matchedTerm: hint.match,
          projectId: hint.project,
        });
      } else {
        const invalidRecord: InvalidHintEncountered = {
          hint,
          reason: `Routing hint matched term "${hint.match}", but referenced project "${hint.project}" does not exist in active configured projects.`,
          referencedProjectId: hint.project,
        };
        invalidHints.push(invalidRecord);
        diagnostics.push(
          `[WARN] Invalid routing hint encountered: matched term "${hint.match}" points to unknown project "${hint.project}". Hint was safely ignored.`
        );
      }
    }
  }

  if (hintCandidateSet.size === 1) {
    const matchedId = Array.from(hintCandidateSet)[0];
    const hasDomainHint = hintEvidence.some((e) => e.matchType === 'domain');
    const matchMethod: MatchMethod = hasDomainHint ? 'routing_hint_domain' : 'routing_hint_keyword';

    return {
      outcome: 'MATCHED',
      projectId: matchedId,
      matchedProjectId: matchedId,
      candidateProjects: [matchedId],
      isAmbiguous: false,
      matchMethod,
      evidence: hintEvidence,
      invalidHints,
      fallbackApplied: false,
      diagnostics,
    };
  }

  if (hintCandidateSet.size > 1) {
    const candidateList = Array.from(hintCandidateSet);
    diagnostics.push(
      `Ambiguous match in routing hints: multiple projects matched (${candidateList.join(', ')}). Routed to fallback '${fallbackUnrouted}'.`
    );
    return {
      outcome: 'AMBIGUOUS',
      projectId: fallbackUnrouted,
      matchedProjectId: null,
      candidateProjects: candidateList,
      isAmbiguous: true,
      matchMethod: 'ambiguous',
      evidence: hintEvidence,
      invalidHints,
      fallbackApplied: true,
      diagnostics,
    };
  }

  // =========================================================================
  // TIER 2: Project Domain Matching (from config.json project.domains)
  // =========================================================================
  const domainCandidateSet = new Set<string>();
  const domainEvidence: MatchEvidence[] = [];

  for (const project of activeProjects) {
    for (const domain of project.domains || []) {
      if (matchesDomain(extractedDomains, domain, normalized.searchableText)) {
        domainCandidateSet.add(project.id);
        domainEvidence.push({
          source: 'project_config',
          matchType: 'domain',
          matchedTerm: domain,
          projectId: project.id,
        });
      }
    }
  }

  if (domainCandidateSet.size === 1) {
    const matchedId = Array.from(domainCandidateSet)[0];
    return {
      outcome: 'MATCHED',
      projectId: matchedId,
      matchedProjectId: matchedId,
      candidateProjects: [matchedId],
      isAmbiguous: false,
      matchMethod: 'project_domain',
      evidence: domainEvidence,
      invalidHints,
      fallbackApplied: false,
      diagnostics,
    };
  }

  if (domainCandidateSet.size > 1) {
    const candidateList = Array.from(domainCandidateSet);
    diagnostics.push(
      `Ambiguous match in project domains: multiple projects matched (${candidateList.join(', ')}). Routed to fallback '${fallbackUnrouted}'.`
    );
    return {
      outcome: 'AMBIGUOUS',
      projectId: fallbackUnrouted,
      matchedProjectId: null,
      candidateProjects: candidateList,
      isAmbiguous: true,
      matchMethod: 'ambiguous',
      evidence: domainEvidence,
      invalidHints,
      fallbackApplied: true,
      diagnostics,
    };
  }

  // =========================================================================
  // TIER 3: Project Keyword Matching (from config.json project.keywords)
  // =========================================================================
  const keywordCandidateSet = new Set<string>();
  const keywordEvidence: MatchEvidence[] = [];

  for (const project of activeProjects) {
    for (const keyword of project.keywords || []) {
      if (matchesKeyword(normalized.searchableText, keyword)) {
        keywordCandidateSet.add(project.id);
        keywordEvidence.push({
          source: 'project_config',
          matchType: 'keyword',
          matchedTerm: keyword,
          projectId: project.id,
        });
      }
    }
  }

  if (keywordCandidateSet.size === 1) {
    const matchedId = Array.from(keywordCandidateSet)[0];
    return {
      outcome: 'MATCHED',
      projectId: matchedId,
      matchedProjectId: matchedId,
      candidateProjects: [matchedId],
      isAmbiguous: false,
      matchMethod: 'project_keyword',
      evidence: keywordEvidence,
      invalidHints,
      fallbackApplied: false,
      diagnostics,
    };
  }

  if (keywordCandidateSet.size > 1) {
    const candidateList = Array.from(keywordCandidateSet);
    diagnostics.push(
      `Ambiguous match in project keywords: multiple projects matched (${candidateList.join(', ')}). Routed to fallback '${fallbackUnrouted}'.`
    );
    return {
      outcome: 'AMBIGUOUS',
      projectId: fallbackUnrouted,
      matchedProjectId: null,
      candidateProjects: candidateList,
      isAmbiguous: true,
      matchMethod: 'ambiguous',
      evidence: keywordEvidence,
      invalidHints,
      fallbackApplied: true,
      diagnostics,
    };
  }

  // =========================================================================
  // TIER 4: Fallback Unrouted (No matching rules found)
  // =========================================================================
  diagnostics.push(
    `No matching routing hint, domain, or keyword found. Routed to fallback '${fallbackUnrouted}'.`
  );

  return {
    outcome: 'UNROUTED',
    projectId: fallbackUnrouted,
    matchedProjectId: null,
    candidateProjects: [],
    isAmbiguous: false,
    matchMethod: 'fallback_unrouted',
    evidence: [],
    invalidHints,
    fallbackApplied: true,
    diagnostics,
  };
}

/**
 * Service function that reads live fixture configuration and executes deterministic routing.
 */
export async function routeSignal(
  input: RoutingInput | string,
  options?: Partial<RoutingContext>
): Promise<RoutingResult> {
  const [config, hints] = await Promise.all([
    options?.projects && options?.fallbacks
      ? null
      : getFixtureConfig(),
    options?.hints ? null : getRoutingHints(),
  ]);

  const context: RoutingContext = {
    projects: options?.projects || config?.projects || [],
    hints: options?.hints || hints || [],
    fallbacks: options?.fallbacks || config?.fallbacks || {
      unrouted: 'internal_unsorted',
      unknown_project: 'unclassified',
    },
    internalDomains: options?.internalDomains || config?.internal_domains || [],
  };

  return routeSignalDeterministic(input, context);
}
