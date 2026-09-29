import { Signal, SignalSources, SignalStatus } from './fixture.types';
import { RoutingResult } from './routing.types';
import { FetchedSourceResult } from './fetcher.types';

export type ResearchInputKind = 'text' | 'url';

export interface CreateResearchSignalInput {
  kind?: ResearchInputKind;
  text?: string;
  url?: string;
  title?: string;
  notes?: string | null;
  // Disallowed client injection fields (for typing / rejection checks)
  id?: unknown;
  match_key?: unknown;
  status?: unknown;
  projects?: unknown;
  type?: unknown;
}

export interface ResearchSignalSources extends SignalSources {
  url?: string | null;
  content?: string | null;
  content_type?: string | null;
  fetched_at?: string | null;
  final_url?: string | null;
  input_kind: ResearchInputKind;
}

export interface ResearchSignalRoutingDiagnostics {
  outcome: string;
  matchMethod: string;
  isAmbiguous: boolean;
  candidateProjects: string[];
  invalidHints?: any[];
  diagnostics: string[];
}

export interface ResearchSignal extends Signal {
  type: 'research';
  sources: ResearchSignalSources;
  routing_diagnostics: ResearchSignalRoutingDiagnostics;
}

export interface ResearchSignalAuditEntry {
  event: 'research_signal_created';
  signal_id: string;
  timestamp: string;
  project: string;
  input_type: ResearchInputKind;
  routing_outcome: string;
  routing_method: string;
  title: string;
  source_url?: string | null;
  content_length: number;
}

export interface CreateResearchSignalResult {
  status: 'created' | 'error';
  signal?: ResearchSignal;
  routing?: RoutingResult;
  fetchedSource?: FetchedSourceResult;
  auditEntry?: ResearchSignalAuditEntry;
  error?: string;
}
