import { CandidateWorkItem, validateCandidateWorkItem } from '../types/candidate-work.types';
import { Signal } from '../types/fixture.types';
import { ResearchSignal } from '../types/signal.types';

/**
 * Actionable intent patterns grounded in explicit phrases.
 * Strict regex matches ensure we only generate candidate work when
 * the source text explicitly expresses actionable intent.
 */
const ACTION_PATTERNS: Array<{
  regex: RegExp;
  prefixCleaner: RegExp;
  confidence: number;
}> = [
  {
    // "we should investigate...", "we need to review...", "we must evaluate..."
    regex: /\bwe\s+(?:should|need\s+to|must|ought\s+to|have\s+to)\s+([a-z][a-z0-9\s_\-/,.]+)/i,
    prefixCleaner: /^we\s+(?:should|need\s+to|must|ought\s+to|have\s+to)\s+/i,
    confidence: 0.9,
  },
  {
    // "action item: ...", "todo: ..."
    regex: /\b(?:action\s+item|todo|next\s+step):\s*([^\n.;]+)/i,
    prefixCleaner: /^(?:action\s+item|todo|next\s+step):\s*/i,
    confidence: 0.95,
  },
  {
    // "need to review...", "should compare...", "must update..."
    regex: /\b(?:need\s+to|should|must)\s+(?:investigate|review|evaluate|update|compare|audit|verify|assess|implement|check|test|analyze|refactor|fix|benchmark|migrate|integrate)\s+([a-z0-9\s_\-/,.]+)/i,
    prefixCleaner: /^(?:need\s+to|should|must)\s+/i,
    confidence: 0.85,
  },
  {
    // "follow up on ..."
    regex: /\bfollow\s+up\s+on\s+([a-z0-9\s_\-/,.]+)/i,
    prefixCleaner: /^follow\s+up\s+on\s+/i,
    confidence: 0.85,
  },
  {
    // Explicit imperative: "investigate ...", "evaluate ...", "review ...", "compare ..."
    regex: /^(?:please\s+)?(?:investigate|evaluate|audit|verify|assess|benchmark|compare)\s+([a-z0-9\s_\-/,.]+)/i,
    prefixCleaner: /^(?:please\s+)?/i,
    confidence: 0.8,
  },
];

/**
 * Splits raw source text into candidate sentences and bullet lines.
 */
function extractSourceSegments(text: string): string[] {
  if (!text || typeof text !== 'string') return [];

  // Split by line breaks first, then by sentence delimiters
  const lines = text.split(/\r?\n/);
  const segments: string[] = [];

  for (const line of lines) {
    const trimmedLine = line.trim().replace(/^[-*•\d.)\]]\s*/, '');
    if (!trimmedLine) continue;

    // Split line into sentences if multiple sentences exist
    const sentences = trimmedLine.split(/(?<=[.!?])\s+(?=[A-Z0-9])/);
    for (const s of sentences) {
      const trimmed = s.trim();
      if (trimmed.length > 5) {
        segments.push(trimmed);
      }
    }
  }

  return segments;
}

/**
 * Capitalizes the first letter of a string.
 */
function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Generates a clean, concise title from an actionable statement.
 */
function deriveActionableTitle(matchedSentence: string, prefixCleaner: RegExp): string {
  // Strip leading action helper phrases (e.g. "we should investigate" -> "Investigate...")
  let cleaned = matchedSentence.trim();

  // Strip trailing punctuation
  cleaned = cleaned.replace(/[.!?:;]+$/, '');

  // If match starts with "we should investigate...", rewrite to imperative "Investigate..."
  if (prefixCleaner.test(cleaned)) {
    cleaned = cleaned.replace(prefixCleaner, '');
  }

  cleaned = capitalize(cleaned);

  if (cleaned.length > 80) {
    const truncated = cleaned.slice(0, 77);
    const lastSpace = truncated.lastIndexOf(' ');
    cleaned = (lastSpace > 40 ? truncated.slice(0, lastSpace) : truncated) + '...';
  }

  return cleaned;
}

/**
 * Extracts and generates grounded CandidateWorkItem objects from a research signal.
 *
 * Requirements & Invariants:
 * 1. Strictly deterministic and grounded in signal source content.
 * 2. Status is ALWAYS 'DRAFT' (never APPROVED or REJECTED).
 * 3. References the original signal_id.
 * 4. Uses the signal's resolved project_id.
 * 5. Evidence is copied directly from original text (is_grounded=true).
 * 6. Returns [] if no clear actionable language is detected (never guesses or hallucinates).
 * 7. All generated candidates are validated through validateCandidateWorkItem.
 */
export function generateCandidateWorkItems(
  signal: ResearchSignal | Signal
): CandidateWorkItem[] {
  if (!signal || !signal.id) {
    return [];
  }

  // Aggregate all available source text content
  const sourceTexts: string[] = [];

  if (signal.sources?.content) {
    sourceTexts.push(signal.sources.content);
  }
  if (signal.notes) {
    sourceTexts.push(signal.notes);
  }
  if (signal.summary) {
    sourceTexts.push(signal.summary);
  }

  const combinedText = sourceTexts.join('\n\n').trim();
  if (!combinedText) {
    return [];
  }

  const segments = extractSourceSegments(combinedText);
  const candidates: CandidateWorkItem[] = [];
  const seenTitles = new Set<string>();

  const projectId =
    signal.projects && signal.projects.length > 0
      ? signal.projects[0]
      : 'internal_unsorted';

  let itemIndex = 1;

  for (const segment of segments) {
    for (const pattern of ACTION_PATTERNS) {
      if (pattern.regex.test(segment)) {
        // Grounding check: verify segment is directly in source text
        const isExactExcerpt = combinedText.includes(segment);
        if (!isExactExcerpt) {
          continue;
        }

        const title = deriveActionableTitle(segment, pattern.prefixCleaner);
        const normalizedTitle = title.toLowerCase();

        if (seenTitles.has(normalizedTitle)) {
          continue;
        }
        seenTitles.add(normalizedTitle);

        const candidateId = `cwi_${signal.id}_${String(itemIndex).padStart(2, '0')}`;
        itemIndex++;

        const candidate: CandidateWorkItem = {
          id: candidateId,
          signal_id: signal.id,
          title,
          description: segment,
          evidence: [segment],
          project_id: projectId,
          status: 'DRAFT',
          confidence: pattern.confidence,
          is_grounded: true,
          created_at: new Date().toISOString(),
          reviewer_notes: null,
        };

        // Validate CandidateWorkItem before adding
        const validation = validateCandidateWorkItem(candidate);
        if (validation.isValid) {
          candidates.push(candidate);
        }

        // Move to next segment once matched by highest priority pattern
        break;
      }
    }
  }

  return candidates;
}
