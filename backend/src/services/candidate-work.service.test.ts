import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateCandidateWorkItems } from './candidate-work.service';
import { ResearchSignal } from '../types/signal.types';
import { validateCandidateWorkItem } from '../types/candidate-work.types';

describe('Candidate Work Generation Service', () => {
  const baseSignal: ResearchSignal = {
    id: '2026-09-29_research_northwind_audit_412a',
    match_key: 'research_northwind_audit_412a',
    type: 'research',
    date: '2026-09-29',
    time: '14:30',
    title: 'Northwind Sync Log Audit',
    detected_on: '2026-09-29',
    attendees: [],
    projects: ['northwind'],
    summary: null,
    expected_files: [],
    notes: null,
    status: {},
    sources: {
      granola_note: null,
      transcript: null,
      recording: null,
      url: null,
      content: '',
      content_type: 'text/plain',
      fetched_at: '2026-09-29T14:30:00Z',
      final_url: null,
      input_kind: 'text',
    },
    routing_diagnostics: {
      outcome: 'MATCHED',
      matchMethod: 'project_keyword',
      isAmbiguous: false,
      candidateProjects: ['northwind'],
      diagnostics: [],
    },
  };

  it('1. creates a grounded DRAFT candidate from explicit actionable research notes', () => {
    const signal: ResearchSignal = {
      ...baseSignal,
      sources: {
        ...baseSignal.sources,
        content: 'During order sync, we noticed latency spikes. We should investigate the database index fragmentation on orders table.',
      },
    };

    const candidates = generateCandidateWorkItems(signal);
    assert.strictEqual(candidates.length, 1);

    const item = candidates[0];
    assert.strictEqual(item.status, 'DRAFT');
    assert.strictEqual(item.is_grounded, true);
    assert.strictEqual(item.title, 'Investigate the database index fragmentation on orders table');
    assert.strictEqual(
      item.description,
      'We should investigate the database index fragmentation on orders table.'
    );
  });

  it('2. candidate references the original signal ID', () => {
    const signal: ResearchSignal = {
      ...baseSignal,
      id: '2026-09-29_research_harborline_manifest_98bc',
      projects: ['harborline'],
      sources: {
        ...baseSignal.sources,
        content: 'We need to review the manifest ingestion pipeline before Friday.',
      },
    };

    const candidates = generateCandidateWorkItems(signal);
    assert.strictEqual(candidates.length, 1);
    assert.strictEqual(candidates[0].signal_id, '2026-09-29_research_harborline_manifest_98bc');
    assert.ok(candidates[0].id.includes('2026-09-29_research_harborline_manifest_98bc'));
  });

  it('3. evidence comes directly from the original signal text', () => {
    const originalText =
      'Initial import completed. We should evaluate alternative Redis caching policies for high-traffic sessions.';
    const signal: ResearchSignal = {
      ...baseSignal,
      sources: {
        ...baseSignal.sources,
        content: originalText,
      },
    };

    const candidates = generateCandidateWorkItems(signal);
    assert.strictEqual(candidates.length, 1);
    assert.strictEqual(candidates[0].evidence.length, 1);
    const evidenceSnippet = candidates[0].evidence[0];
    assert.ok(
      originalText.includes(evidenceSnippet),
      'Evidence must be a direct substring of original text'
    );
  });

  it('4. preserves the resolved project of the signal', () => {
    const signal: ResearchSignal = {
      ...baseSignal,
      projects: ['atlas'],
      sources: {
        ...baseSignal.sources,
        content: 'We need to update the environmental permit validation rules.',
      },
    };

    const candidates = generateCandidateWorkItems(signal);
    assert.strictEqual(candidates.length, 1);
    assert.strictEqual(candidates[0].project_id, 'atlas');
  });

  it('5. confidence score is strictly bounded within 0..1', () => {
    const signal: ResearchSignal = {
      ...baseSignal,
      sources: {
        ...baseSignal.sources,
        content:
          'Action item: audit auth token expiration intervals.\nWe should compare throughput metrics across regional clusters.',
      },
    };

    const candidates = generateCandidateWorkItems(signal);
    assert.ok(candidates.length >= 1);
    for (const item of candidates) {
      assert.ok(item.confidence >= 0 && item.confidence <= 1);
      assert.strictEqual(typeof item.confidence, 'number');
    }
  });

  it('6. non-actionable text produces no candidate work items', () => {
    const signal: ResearchSignal = {
      ...baseSignal,
      sources: {
        ...baseSignal.sources,
        content:
          'The weather in Seattle was clear today. The team attended a quarterly all-hands meeting and discussed roadmap milestones.',
      },
    };

    const candidates = generateCandidateWorkItems(signal);
    assert.strictEqual(candidates.length, 0);
  });

  it('7. service never creates APPROVED or REJECTED candidates (always DRAFT)', () => {
    const signal: ResearchSignal = {
      ...baseSignal,
      sources: {
        ...baseSignal.sources,
        content:
          'We should investigate the error rate on checkout.\nWe need to review vendor security questionnaires.\nTodo: update integration tests.',
      },
    };

    const candidates = generateCandidateWorkItems(signal);
    assert.ok(candidates.length > 0);
    for (const item of candidates) {
      assert.strictEqual(item.status, 'DRAFT');
      assert.notStrictEqual(item.status, 'APPROVED');
      assert.notStrictEqual(item.status, 'REJECTED');
    }
  });

  it('8. no invented evidence or hallucinated facts are produced', () => {
    const sourceContent = 'We should compare GraphQL and REST endpoint latencies.';
    const signal: ResearchSignal = {
      ...baseSignal,
      sources: {
        ...baseSignal.sources,
        content: sourceContent,
      },
    };

    const candidates = generateCandidateWorkItems(signal);
    assert.strictEqual(candidates.length, 1);
    for (const item of candidates) {
      for (const ev of item.evidence) {
        assert.ok(sourceContent.includes(ev), `Evidence "${ev}" was not found in source text`);
      }
    }
  });

  it('9. all generated candidates pass validateCandidateWorkItem', () => {
    const signal: ResearchSignal = {
      ...baseSignal,
      projects: ['quill'],
      sources: {
        ...baseSignal.sources,
        content:
          'We need to update the manuscript export format.\nWe should evaluate serverless cold starts.',
      },
    };

    const candidates = generateCandidateWorkItems(signal);
    assert.strictEqual(candidates.length, 2);
    for (const item of candidates) {
      const validation = validateCandidateWorkItem(item, ['quill', 'northwind', 'atlas']);
      assert.strictEqual(validation.isValid, true);
      assert.strictEqual(validation.errors.length, 0);
    }
  });

  it('10. handles signals with empty or missing content gracefully', () => {
    const signalEmpty: ResearchSignal = {
      ...baseSignal,
      sources: {
        ...baseSignal.sources,
        content: '',
      },
    };
    assert.deepStrictEqual(generateCandidateWorkItems(signalEmpty), []);

    const signalNull: any = {
      ...baseSignal,
      sources: null,
    };
    assert.deepStrictEqual(generateCandidateWorkItems(signalNull), []);
  });
});
