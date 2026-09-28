export interface Project {
  id: string;
  name: string;
  type: 'client' | 'product' | 'internal' | string;
  keywords: string[];
  domains: string[];
  emails: string[];
  active: boolean;
}

export interface FallbacksConfig {
  unrouted: string;
  unknown_project: string;
}

export interface FixtureConfig {
  projects: Project[];
  internal_domains: string[];
  fallbacks: FallbacksConfig;
  feed_freshness_threshold_days: number;
}

export interface SignalStatus {
  state: 'analyzed' | 'pending' | string;
  analyzed_at: string | null;
  files_reviewed: string[];
  analysis_ref: string | null;
}

export interface SignalSources {
  granola_note: string | null;
  transcript: string | null;
  recording: string | null;
}

export interface Signal {
  id: string;
  match_key: string;
  type: string;
  date: string;
  time: string;
  title: string;
  detected_on: string;
  attendees: string[];
  projects: string[];
  summary: string | null;
  expected_files: string[];
  notes: string | null;
  status: Record<string, SignalStatus>;
  sources: SignalSources;
}

export interface SignalLedger {
  version: number;
  signals: Signal[];
}

export interface RoutingHint {
  type: 'keyword' | 'domain' | string;
  match: string;
  project: string;
  note?: string;
  by?: string;
  on?: string;
}

export interface RoutingConfigResponse {
  fallbacks: FallbacksConfig;
  internal_domains: string[];
  hints: RoutingHint[];
}
