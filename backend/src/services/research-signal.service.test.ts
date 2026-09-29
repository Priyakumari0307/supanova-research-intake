import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import { randomUUID } from 'crypto';
import { createResearchSignal } from './research-signal.service';
import { readLedger, writeSignalToLedgerGuarded } from './ledger-storage.service';
import { Project, RoutingHint, FallbacksConfig, SignalLedger } from '../types/fixture.types';
import { ResearchSignal, ResearchSignalAuditEntry } from '../types/signal.types';

const mockProjects: Project[] = [
  {
    id: 'northwind',
    name: 'Northwind Supply',
    type: 'client',
    keywords: ['northwind', 'supply portal', 'invoice sync'],
    domains: ['northwind.example'],
    emails: ['dana@northwind.example'],
    active: true,
  },
  {
    id: 'harborline',
    name: 'Harborline Freight',
    type: 'client',
    keywords: ['harborline', 'freight', 'manifest'],
    domains: ['harborline.example'],
    emails: ['ivo@harborline.example'],
    active: true,
  },
  {
    id: 'quill',
    name: 'Quill (internal product)',
    type: 'product',
    keywords: ['quill', 'editor', 'drafting'],
    domains: [],
    emails: [],
    active: true,
  },
  {
    id: 'atlas',
    name: 'Atlas Permits',
    type: 'client',
    keywords: ['atlas', 'permit', 'inspection'],
    domains: ['atlaspermits.example'],
    emails: ['rue@atlaspermits.example'],
    active: true,
  },
  {
    id: 'studio_ops',
    name: 'Studio Ops',
    type: 'internal',
    keywords: ['standup', 'retro', 'hiring', 'ops'],
    domains: [],
    emails: [],
    active: true,
  },
];

const mockHints: RoutingHint[] = [
  {
    type: 'keyword',
    match: 'manifest',
    project: 'harborline',
  },
  {
    type: 'domain',
    match: 'atlaspermits.example',
    project: 'atlas',
  },
  {
    type: 'keyword',
    match: 'drafting',
    project: 'quil', // Invalid project reference
  },
];

const mockFallbacks: FallbacksConfig = {
  unrouted: 'internal_unsorted',
  unknown_project: 'unclassified',
};

describe('Research Signal Creation & Guarded Write Pipeline', () => {
  let tempDir: string;
  let testLedgerPath: string;
  let testAuditPath: string;

  const initialLedger: SignalLedger = {
    version: 4,
    signals: [
      {
        id: '2026-07-06_existing_meeting',
        match_key: 'existing_meeting',
        type: 'meeting',
        date: '2026-07-06',
        time: '10:00',
        title: 'Existing meeting signal',
        detected_on: '2026-07-07',
        attendees: ['dana@northwind.example'],
        projects: ['northwind'],
        summary: null,
        expected_files: [],
        notes: null,
        status: {},
        sources: {
          granola_note: null,
          transcript: null,
          recording: null,
        },
      },
    ],
  };

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `test-signal-intake-${randomUUID()}`);
    await fs.mkdir(tempDir, { recursive: true });
    testLedgerPath = path.join(tempDir, 'signal-ledger.json');
    testAuditPath = path.join(tempDir, 'run-log.jsonl');

    await fs.writeFile(testLedgerPath, JSON.stringify(initialLedger, null, 2), 'utf-8');
    await fs.writeFile(testAuditPath, '', 'utf-8');
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  });

  describe('Requirement 1 & 2: Creation from paragraph and URL', () => {
    it('creates a research signal from paragraph text', async () => {
      const result = await createResearchSignal(
        {
          text: 'Investigating logistics optimization for Harborline freight manifests.',
          title: 'Freight Logistics Study',
          notes: 'Priority research item',
        },
        {
          routingContext: { projects: mockProjects, hints: mockHints, fallbacks: mockFallbacks },
          guardedWrite: { ledgerPath: testLedgerPath, auditPath: testAuditPath },
        }
      );

      assert.equal(result.status, 'created');
      assert.ok(result.signal);
      assert.equal(result.signal.type, 'research');
      assert.equal(result.signal.title, 'Freight Logistics Study');
      assert.equal(result.signal.notes, 'Priority research item');
      assert.equal(result.signal.sources.input_kind, 'text');
      assert.equal(
        result.signal.sources.content,
        'Investigating logistics optimization for Harborline freight manifests.'
      );
      assert.deepEqual(result.signal.status, {});
      assert.deepEqual(result.signal.projects, ['harborline']);
    });

    it('creates a research signal from a URL using the safe fetcher', async () => {
      const mockFetch: typeof fetch = async () => {
        return new Response(
          '<html><head><title>Northwind Supply Portal News</title></head><body><p>Article discussing invoice sync upgrades.</p></body></html>',
          { status: 200, headers: { 'Content-Type': 'text/html' } }
        );
      };

      const result = await createResearchSignal(
        {
          url: 'https://northwind.example/news/article-1',
        },
        {
          routingContext: { projects: mockProjects, hints: mockHints, fallbacks: mockFallbacks },
          fetchOptions: { fetchFn: mockFetch },
          guardedWrite: { ledgerPath: testLedgerPath, auditPath: testAuditPath },
        }
      );

      assert.equal(result.status, 'created');
      assert.ok(result.signal);
      assert.equal(result.signal.type, 'research');
      assert.equal(result.signal.title, 'Northwind Supply Portal News');
      assert.equal(result.signal.sources.input_kind, 'url');
      assert.equal(result.signal.sources.url, 'https://northwind.example/news/article-1');
      assert.ok(result.signal.sources.content?.includes('invoice sync upgrades'));
      assert.deepEqual(result.signal.projects, ['northwind']);
    });
  });

  describe('Requirement 3 & 4: Input validation & rejection', () => {
    it('rejects empty or whitespace-only paragraph input', async () => {
      await assert.rejects(
        async () => {
          await createResearchSignal(
            { text: '    ' },
            {
              routingContext: { projects: mockProjects, hints: mockHints, fallbacks: mockFallbacks },
              guardedWrite: { ledgerPath: testLedgerPath, auditPath: testAuditPath },
            }
          );
        },
        (err: any) => {
          assert.ok(err.message.includes('whitespace only') || err.message.includes('non-empty'));
          return true;
        }
      );
    });

    it('rejects invalid or unsupported URL protocols', async () => {
      await assert.rejects(
        async () => {
          await createResearchSignal(
            { url: 'ftp://files.example.com/archive.zip' },
            {
              routingContext: { projects: mockProjects, hints: mockHints, fallbacks: mockFallbacks },
              guardedWrite: { ledgerPath: testLedgerPath, auditPath: testAuditPath },
            }
          );
        },
        (err: any) => {
          assert.ok(err.message.includes('Invalid URL provided') || err.message.includes('Unsupported protocol'));
          return true;
        }
      );
    });
  });

  describe('Requirement 5, 6, 7 & 8: Server-side identity & client injection protection', () => {
    it('generates immutable server-managed id and match_key', async () => {
      const result = await createResearchSignal(
        { text: 'Sample standalone research notes.' },
        {
          routingContext: { projects: mockProjects, hints: mockHints, fallbacks: mockFallbacks },
          guardedWrite: { ledgerPath: testLedgerPath, auditPath: testAuditPath },
        }
      );

      assert.ok(result.signal);
      assert.match(result.signal.id, /^\d{4}-\d{2}-\d{2}_research_/);
      assert.match(result.signal.match_key, /^research_/);
      assert.ok(result.signal.id.includes(result.signal.match_key));
    });

    it('rejects client attempt to inject custom id', async () => {
      await assert.rejects(
        async () => {
          await createResearchSignal(
            {
              text: 'Valid content',
              id: 'client_injected_id',
            } as any,
            {
              routingContext: { projects: mockProjects, hints: mockHints, fallbacks: mockFallbacks },
              guardedWrite: { ledgerPath: testLedgerPath, auditPath: testAuditPath },
            }
          );
        },
        (err: any) => {
          assert.ok(err.message.includes('Client injection prohibited: "id"'));
          return true;
        }
      );
    });

    it('rejects client attempt to inject custom status or workflow state', async () => {
      await assert.rejects(
        async () => {
          await createResearchSignal(
            {
              text: 'Valid content',
              status: { atlas: { state: 'analyzed', analysis_ref: 'run-99' } },
            } as any,
            {
              routingContext: { projects: mockProjects, hints: mockHints, fallbacks: mockFallbacks },
              guardedWrite: { ledgerPath: testLedgerPath, auditPath: testAuditPath },
            }
          );
        },
        (err: any) => {
          assert.ok(err.message.includes('Client injection prohibited: "status"'));
          return true;
        }
      );
    });

    it('rejects client attempt to inject arbitrary project assignments', async () => {
      await assert.rejects(
        async () => {
          await createResearchSignal(
            {
              text: 'Valid content',
              projects: ['arbitrary_unrouted_project'],
            } as any,
            {
              routingContext: { projects: mockProjects, hints: mockHints, fallbacks: mockFallbacks },
              guardedWrite: { ledgerPath: testLedgerPath, auditPath: testAuditPath },
            }
          );
        },
        (err: any) => {
          assert.ok(err.message.includes('Client injection prohibited: "projects"'));
          return true;
        }
      );
    });
  });

  describe('Requirement 9, 10, 11 & 12: Routing behavior in signal creation', () => {
    it('assigns clear project match correctly', async () => {
      const result = await createResearchSignal(
        { text: 'Reviewing the building permit and inspection process on atlaspermits.example' },
        {
          routingContext: { projects: mockProjects, hints: mockHints, fallbacks: mockFallbacks },
          guardedWrite: { ledgerPath: testLedgerPath, auditPath: testAuditPath },
        }
      );

      assert.deepEqual(result.signal?.projects, ['atlas']);
      assert.equal(result.signal?.routing_diagnostics.outcome, 'MATCHED');
    });

    it('routes ambiguous matches to internal_unsorted and preserves diagnostics', async () => {
      const result = await createResearchSignal(
        { text: 'Joint coordination between Northwind supply portal and Harborline freight shipping' },
        {
          routingContext: { projects: mockProjects, hints: mockHints, fallbacks: mockFallbacks },
          guardedWrite: { ledgerPath: testLedgerPath, auditPath: testAuditPath },
        }
      );

      assert.deepEqual(result.signal?.projects, ['internal_unsorted']);
      assert.equal(result.signal?.routing_diagnostics.isAmbiguous, true);
      assert.equal(result.signal?.routing_diagnostics.outcome, 'AMBIGUOUS');
      assert.ok(result.signal?.routing_diagnostics.candidateProjects.includes('northwind'));
      assert.ok(result.signal?.routing_diagnostics.candidateProjects.includes('harborline'));
    });

    it('routes no-match inputs to internal_unsorted fallback', async () => {
      const result = await createResearchSignal(
        { text: 'Unrelated study on astronomy and astrophysics.' },
        {
          routingContext: { projects: mockProjects, hints: mockHints, fallbacks: mockFallbacks },
          guardedWrite: { ledgerPath: testLedgerPath, auditPath: testAuditPath },
        }
      );

      assert.deepEqual(result.signal?.projects, ['internal_unsorted']);
      assert.equal(result.signal?.routing_diagnostics.outcome, 'UNROUTED');
      assert.deepEqual(result.signal?.routing_diagnostics.candidateProjects, []);
    });

    it('never assigns invalid "quil" routing hint project', async () => {
      const projectsWithoutDrafting: Project[] = mockProjects.map((p) =>
        p.id === 'quill' ? { ...p, keywords: ['quill', 'editor'] } : p
      );

      const result = await createResearchSignal(
        { text: 'Drafting new notes' },
        {
          routingContext: { projects: projectsWithoutDrafting, hints: mockHints, fallbacks: mockFallbacks },
          guardedWrite: { ledgerPath: testLedgerPath, auditPath: testAuditPath },
        }
      );

      assert.notEqual(result.signal?.projects[0], 'quil');
      assert.deepEqual(result.signal?.projects, ['internal_unsorted']);
      assert.ok(
        result.signal?.routing_diagnostics.invalidHints?.some(
          (h: any) => h.referencedProjectId === 'quil'
        )
      );
    });
  });

  describe('Requirement 13, 14, 15 & 16: Guarded atomic persistence & audit trail', () => {
    it('preserves existing signals and appends new signal atomically', async () => {
      const beforeLedger = await readLedger(testLedgerPath);
      assert.equal(beforeLedger.signals.length, 1);

      const result = await createResearchSignal(
        { text: 'New incoming signal for studio retro standup meeting' },
        {
          routingContext: { projects: mockProjects, hints: mockHints, fallbacks: mockFallbacks },
          guardedWrite: { ledgerPath: testLedgerPath, auditPath: testAuditPath },
        }
      );

      const afterLedger = await readLedger(testLedgerPath);
      assert.equal(afterLedger.signals.length, 2);
      assert.equal(afterLedger.signals[0].id, '2026-07-06_existing_meeting');
      assert.equal(afterLedger.signals[1].id, result.signal?.id);
    });

    it('creates an audit log entry on successful creation', async () => {
      const result = await createResearchSignal(
        {
          text: 'Supply portal invoice sync review',
          title: 'Invoice Sync Task',
        },
        {
          routingContext: { projects: mockProjects, hints: mockHints, fallbacks: mockFallbacks },
          guardedWrite: { ledgerPath: testLedgerPath, auditPath: testAuditPath },
        }
      );

      const auditContent = await fs.readFile(testAuditPath, 'utf-8');
      const lines = auditContent.trim().split('\n').filter(Boolean);
      assert.equal(lines.length, 1);

      const auditEntry: ResearchSignalAuditEntry = JSON.parse(lines[0]);
      assert.equal(auditEntry.event, 'research_signal_created');
      assert.equal(auditEntry.signal_id, result.signal?.id);
      assert.equal(auditEntry.project, 'northwind');
      assert.equal(auditEntry.input_type, 'text');
      assert.equal(auditEntry.routing_outcome, 'MATCHED');
      assert.equal(auditEntry.title, 'Invoice Sync Task');
    });

    it('leaves ledger untouched if validation fails', async () => {
      const beforeContent = await fs.readFile(testLedgerPath, 'utf-8');

      try {
        await createResearchSignal(
          { text: '   ' },
          {
            routingContext: { projects: mockProjects, hints: mockHints, fallbacks: mockFallbacks },
            guardedWrite: { ledgerPath: testLedgerPath, auditPath: testAuditPath },
          }
        );
      } catch {
        // Expected rejection
      }

      const afterContent = await fs.readFile(testLedgerPath, 'utf-8');
      assert.equal(beforeContent, afterContent);
    });

    it('prevents duplicate ID collisions in guarded write path', async () => {
      const existingSignal = initialLedger.signals[0] as ResearchSignal;

      await assert.rejects(
        async () => {
          await writeSignalToLedgerGuarded(
            existingSignal,
            {
              event: 'research_signal_created',
              signal_id: existingSignal.id,
              timestamp: new Date().toISOString(),
              project: 'northwind',
              input_type: 'text',
              routing_outcome: 'MATCHED',
              routing_method: 'test',
              title: 'Duplicate',
              content_length: 10,
            },
            { ledgerPath: testLedgerPath, auditPath: testAuditPath }
          );
        },
        (err: any) => {
          assert.ok(err.message.includes('already exists in the ledger'));
          return true;
        }
      );
    });
  });
});
