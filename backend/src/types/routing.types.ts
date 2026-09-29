import { RoutingHint } from './fixture.types';

export type RoutingOutcome = 'MATCHED' | 'UNROUTED' | 'AMBIGUOUS';

export type MatchMethod =
  | 'routing_hint_domain'
  | 'routing_hint_keyword'
  | 'project_domain'
  | 'project_keyword'
  | 'fallback_unrouted'
  | 'ambiguous';

export interface MatchEvidence {
  source: 'routing_hint' | 'project_config';
  matchType: 'domain' | 'keyword';
  matchedTerm: string;
  projectId: string;
}

export interface InvalidHintEncountered {
  hint: RoutingHint;
  reason: string;
  referencedProjectId: string;
}

export interface RoutingInput {
  text?: string;
  url?: string;
  title?: string;
}

export interface RoutingResult {
  outcome: RoutingOutcome;
  projectId: string; // The resolved project ID or fallback (e.g., 'northwind' or 'internal_unsorted')
  matchedProjectId: string | null; // The uniquely matched project ID, or null if unrouted/ambiguous
  candidateProjects: string[]; // List of valid project IDs that matched
  isAmbiguous: boolean;
  matchMethod: MatchMethod;
  evidence: MatchEvidence[];
  invalidHints: InvalidHintEncountered[];
  fallbackApplied: boolean;
  diagnostics: string[];
}
