export interface SignalStatus {
  state: 'analyzed' | 'pending' | string;
  analyzed_at: string | null;
  files_reviewed: string[];
  analysis_ref: string | null;
}

export interface SignalSources {
  granola_note?: string | null;
  transcript?: string | null;
  recording?: string | null;
  url?: string | null;
  content?: string | null;
  content_type?: string | null;
  fetched_at?: string | null;
  final_url?: string | null;
  input_kind?: 'text' | 'url' | string;
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

export type RoutingOutcome = 'MATCHED' | 'UNROUTED' | 'AMBIGUOUS';

export interface MatchEvidence {
  source: 'routing_hint' | 'project_config';
  matchType: 'domain' | 'keyword';
  matchedTerm: string;
  projectId: string;
}

export interface InvalidHintEncountered {
  hint: {
    type: string;
    match: string;
    project: string;
    note?: string;
  };
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
  projectId: string;
  matchedProjectId: string | null;
  candidateProjects: string[];
  isAmbiguous: boolean;
  matchMethod: string;
  evidence: MatchEvidence[];
  invalidHints: InvalidHintEncountered[];
  fallbackApplied: boolean;
  diagnostics: string[];
}

export interface CreateSignalInput {
  text?: string;
  url?: string;
  title?: string;
  notes?: string | null;
}

export interface CreateSignalResult {
  status: 'created' | 'error';
  signal?: Signal;
  routing?: RoutingResult;
  error?: string;
}

export type CandidateWorkItemStatus = 'DRAFT' | 'APPROVED' | 'REJECTED';

export interface CandidateWorkItem {
  id: string;
  signal_id: string;
  title: string;
  description: string;
  evidence: string[];
  project_id: string;
  status: CandidateWorkItemStatus;
  confidence: number;
  is_grounded: boolean;
  created_at?: string;
  updated_at?: string;
  reviewer_notes?: string | null;
}

export interface CandidateWorkPreviewResponse {
  status: 'preview';
  signal_id: string;
  candidates: CandidateWorkItem[];
}

export type ReviewDecision = 'APPROVED' | 'REJECTED';

export interface CandidateReviewDecision {
  id: string;
  candidate_work_id: string;
  signal_id: string;
  decision: ReviewDecision;
  reviewer_notes?: string | null;
  decided_at: string;
}

export type CandidateReviewResponse = CandidateReviewDecision;

