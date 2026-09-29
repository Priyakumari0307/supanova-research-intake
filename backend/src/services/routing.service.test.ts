import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  routeSignal,
  routeSignalDeterministic,
  matchesKeyword,
  matchesDomain,
  extractDomains,
} from './routing.service';
import { Project, RoutingHint, FallbacksConfig } from '../types/fixture.types';

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
    note: 'freight manifests',
    by: 'ops',
    on: '2026-07-20',
  },
  {
    type: 'domain',
    match: 'atlaspermits.example',
    project: 'atlas',
    note: '',
    by: 'ops',
    on: '2026-08-02',
  },
  {
    type: 'keyword',
    match: 'drafting',
    project: 'quil', // Intentional typo in fixture hint
    note: 'typo in project id - currently dropped silently',
    by: 'ops',
    on: '2026-08-11',
  },
];

const mockFallbacks: FallbacksConfig = {
  unrouted: 'internal_unsorted',
  unknown_project: 'unclassified',
};

describe('Deterministic Project Routing Engine', () => {
  describe('Requirement 1: Clear keyword match', () => {
    it('routes signal based on configured project keywords', () => {
      const result = routeSignalDeterministic('New update regarding supply portal invoice sync', {
        projects: mockProjects,
        hints: [],
        fallbacks: mockFallbacks,
      });

      assert.equal(result.outcome, 'MATCHED');
      assert.equal(result.projectId, 'northwind');
      assert.equal(result.matchedProjectId, 'northwind');
      assert.equal(result.isAmbiguous, false);
      assert.equal(result.matchMethod, 'project_keyword');
      assert.equal(result.fallbackApplied, false);
      assert.ok(result.evidence.length > 0);
      assert.equal(result.evidence[0].projectId, 'northwind');
    });

    it('routes single-word keyword cleanly without substring collisions', () => {
      const result = routeSignalDeterministic('Weekly team standup and retrospective', {
        projects: mockProjects,
        hints: [],
        fallbacks: mockFallbacks,
      });

      assert.equal(result.outcome, 'MATCHED');
      assert.equal(result.projectId, 'studio_ops');
      assert.equal(result.isAmbiguous, false);
      assert.equal(result.matchMethod, 'project_keyword');
    });
  });

  describe('Requirement 2: Clear domain match', () => {
    it('routes signal based on project domain in URL', () => {
      const result = routeSignalDeterministic('https://northwind.example/orders/294', {
        projects: mockProjects,
        hints: [],
        fallbacks: mockFallbacks,
      });

      assert.equal(result.outcome, 'MATCHED');
      assert.equal(result.projectId, 'northwind');
      assert.equal(result.matchedProjectId, 'northwind');
      assert.equal(result.isAmbiguous, false);
      assert.equal(result.matchMethod, 'project_domain');
      assert.equal(result.fallbackApplied, false);
      assert.equal(result.evidence[0].matchType, 'domain');
    });

    it('routes signal based on subdomain of configured domain', () => {
      const result = routeSignalDeterministic('https://portal.harborline.example/manifests', {
        projects: mockProjects,
        hints: [],
        fallbacks: mockFallbacks,
      });

      assert.equal(result.outcome, 'MATCHED');
      assert.equal(result.projectId, 'harborline');
      assert.equal(result.isAmbiguous, false);
      assert.equal(result.matchMethod, 'project_domain');
    });
  });

  describe('Requirement 3: Routing hint match', () => {
    it('routes signal matching keyword routing hint', () => {
      const result = routeSignalDeterministic('Urgent: cargo manifest received', {
        projects: mockProjects,
        hints: mockHints,
        fallbacks: mockFallbacks,
      });

      assert.equal(result.outcome, 'MATCHED');
      assert.equal(result.projectId, 'harborline');
      assert.equal(result.matchedProjectId, 'harborline');
      assert.equal(result.isAmbiguous, false);
      assert.equal(result.matchMethod, 'routing_hint_keyword');
      assert.equal(result.evidence[0].source, 'routing_hint');
      assert.equal(result.evidence[0].matchedTerm, 'manifest');
    });

    it('routes signal matching domain routing hint', () => {
      const result = routeSignalDeterministic('https://atlaspermits.example/permits/49', {
        projects: mockProjects,
        hints: mockHints,
        fallbacks: mockFallbacks,
      });

      assert.equal(result.outcome, 'MATCHED');
      assert.equal(result.projectId, 'atlas');
      assert.equal(result.matchedProjectId, 'atlas');
      assert.equal(result.isAmbiguous, false);
      assert.equal(result.matchMethod, 'routing_hint_domain');
      assert.equal(result.evidence[0].source, 'routing_hint');
    });
  });

  describe('Requirement 4: No match -> internal_unsorted', () => {
    it('falls back to configured unrouted fallback when no rules match', () => {
      const result = routeSignalDeterministic(
        'A comprehensive study on quantum computing and semiconductors',
        {
          projects: mockProjects,
          hints: mockHints,
          fallbacks: mockFallbacks,
        }
      );

      assert.equal(result.outcome, 'UNROUTED');
      assert.equal(result.projectId, 'internal_unsorted');
      assert.equal(result.matchedProjectId, null);
      assert.deepEqual(result.candidateProjects, []);
      assert.equal(result.isAmbiguous, false);
      assert.equal(result.matchMethod, 'fallback_unrouted');
      assert.equal(result.fallbackApplied, true);
      assert.ok(result.diagnostics.length > 0);
    });
  });

  describe('Requirement 5: Multiple possible matches -> ambiguous result', () => {
    it('identifies ambiguous match when keywords from multiple projects are present', () => {
      const result = routeSignalDeterministic(
        'Integration discussion between Northwind supply and Harborline freight shipping',
        {
          projects: mockProjects,
          hints: [],
          fallbacks: mockFallbacks,
        }
      );

      assert.equal(result.outcome, 'AMBIGUOUS');
      assert.equal(result.projectId, 'internal_unsorted');
      assert.equal(result.matchedProjectId, null);
      assert.equal(result.isAmbiguous, true);
      assert.equal(result.matchMethod, 'ambiguous');
      assert.equal(result.fallbackApplied, true);
      assert.ok(result.candidateProjects.includes('northwind'));
      assert.ok(result.candidateProjects.includes('harborline'));
      assert.ok(result.diagnostics.some((d) => d.includes('Ambiguous match')));
    });

    it('identifies ambiguous match when multiple routing hints match different projects', () => {
      const customHints: RoutingHint[] = [
        { type: 'keyword', match: 'alpha', project: 'northwind' },
        { type: 'keyword', match: 'beta', project: 'atlas' },
      ];

      const result = routeSignalDeterministic('Project alpha and beta review', {
        projects: mockProjects,
        hints: customHints,
        fallbacks: mockFallbacks,
      });

      assert.equal(result.outcome, 'AMBIGUOUS');
      assert.equal(result.projectId, 'internal_unsorted');
      assert.equal(result.isAmbiguous, true);
      assert.ok(result.candidateProjects.includes('northwind'));
      assert.ok(result.candidateProjects.includes('atlas'));
    });
  });

  describe('Requirement 6: Invalid "quil" routing hint safety and observability', () => {
    it('safely handles invalid "quil" routing hint without crashing or creating "quil"', () => {
      // Context where "drafting" only exists in an invalid routing hint, not in project keywords
      const projectsWithoutDraftingKeyword: Project[] = mockProjects.map((p) =>
        p.id === 'quill' ? { ...p, keywords: ['quill', 'editor'] } : p
      );

      const result = routeSignalDeterministic('Working on drafting tools for the team', {
        projects: projectsWithoutDraftingKeyword,
        hints: mockHints, // contains match: "drafting", project: "quil"
        fallbacks: mockFallbacks,
      });

      // 1. Did not crash
      assert.ok(result);
      // 2. Did not create or select "quil"
      assert.notEqual(result.projectId, 'quil');
      assert.ok(!result.candidateProjects.includes('quil'));
      // 3. Observable diagnostic / invalid hints tracking
      assert.equal(result.invalidHints.length, 1);
      assert.equal(result.invalidHints[0].referencedProjectId, 'quil');
      assert.equal(result.invalidHints[0].hint.match, 'drafting');
      assert.ok(
        result.diagnostics.some((d) => d.includes('quil') && d.includes('Invalid routing hint'))
      );
      // 4. Safely fell back to unrouted
      assert.equal(result.outcome, 'UNROUTED');
      assert.equal(result.projectId, 'internal_unsorted');
    });

    it('isolates invalid "quil" hint and resolves to valid "quill" project via valid keywords', () => {
      // In live fixtures, "drafting" matches invalid hint "quil" AND valid project keyword for "quill"
      const result = routeSignalDeterministic('Working on drafting improvements', {
        projects: mockProjects,
        hints: mockHints,
        fallbacks: mockFallbacks,
      });

      // Invalid hint is observed and reported
      assert.equal(result.invalidHints.length, 1);
      assert.equal(result.invalidHints[0].referencedProjectId, 'quil');
      // But project routes correctly to valid "quill" project via project keywords
      assert.equal(result.outcome, 'MATCHED');
      assert.equal(result.projectId, 'quill');
      assert.equal(result.matchedProjectId, 'quill');
      assert.equal(result.matchMethod, 'project_keyword');
      assert.notEqual(result.projectId, 'quil');
    });
  });

  describe('Requirement 7: Case-insensitive matching', () => {
    it('matches uppercase keyword', () => {
      const result = routeSignalDeterministic('NORTHWIND SUPPLY PORTAL INVOICE SYNC', {
        projects: mockProjects,
        hints: [],
        fallbacks: mockFallbacks,
      });

      assert.equal(result.outcome, 'MATCHED');
      assert.equal(result.projectId, 'northwind');
    });

    it('matches mixed-case URL domain', () => {
      const result = routeSignalDeterministic('HTTPS://HarborLine.Example/Shipment/100', {
        projects: mockProjects,
        hints: [],
        fallbacks: mockFallbacks,
      });

      assert.equal(result.outcome, 'MATCHED');
      assert.equal(result.projectId, 'harborline');
      assert.equal(result.matchMethod, 'project_domain');
    });

    it('matches mixed-case routing hint keyword', () => {
      const result = routeSignalDeterministic('Review the incoming MANIFEST', {
        projects: mockProjects,
        hints: mockHints,
        fallbacks: mockFallbacks,
      });

      assert.equal(result.outcome, 'MATCHED');
      assert.equal(result.projectId, 'harborline');
      assert.equal(result.matchMethod, 'routing_hint_keyword');
    });
  });

  describe('Helper logic and edge cases', () => {
    it('matches multi-word keywords with variable whitespace', () => {
      assert.ok(matchesKeyword('Please check the supply   portal soon', 'supply portal'));
      assert.ok(matchesKeyword('invoice\tsync update', 'invoice sync'));
    });

    it('avoids false substring matches on short keywords', () => {
      // "ops" should not match "synopsis" or "cooperation"
      assert.equal(matchesKeyword('A brief synopsis of the film', 'ops'), false);
      assert.equal(matchesKeyword('Inter-team cooperation is vital', 'ops'), false);
      assert.equal(matchesKeyword('Studio ops sync meeting', 'ops'), true);
    });

    it('extracts domains correctly from text and URLs', () => {
      const extracted = extractDomains(
        ['https://northwind.example/items'],
        'Check out https://atlaspermits.example/permits and studio.example'
      );
      assert.ok(extracted.includes('northwind.example'));
      assert.ok(extracted.includes('atlaspermits.example'));
      assert.ok(extracted.includes('studio.example'));
    });

    it('matches structured input object { text, url, title }', () => {
      const result = routeSignalDeterministic(
        {
          title: 'Permit Renewal Notification',
          text: 'Building inspection scheduled for next Tuesday',
          url: 'https://example.org/news',
        },
        {
          projects: mockProjects,
          hints: [],
          fallbacks: mockFallbacks,
        }
      );

      assert.equal(result.outcome, 'MATCHED');
      assert.equal(result.projectId, 'atlas');
      assert.equal(result.matchMethod, 'project_keyword');
    });

    it('ignores inactive projects', () => {
      const projectsWithInactive: Project[] = [
        {
          id: 'old_project',
          name: 'Old Decommissioned Project',
          type: 'client',
          keywords: ['legacy_tool'],
          domains: ['legacy.example'],
          emails: [],
          active: false,
        },
      ];

      const result = routeSignalDeterministic('Using the legacy_tool on legacy.example', {
        projects: projectsWithInactive,
        hints: [],
        fallbacks: mockFallbacks,
      });

      assert.equal(result.outcome, 'UNROUTED');
      assert.equal(result.projectId, 'internal_unsorted');
    });
  });

  describe('Live fixture integration via routeSignal()', () => {
    it('reads actual fixture files directly and routes northwind keyword', async () => {
      const result = await routeSignal('Northwind supply portal invoice sync');
      assert.equal(result.outcome, 'MATCHED');
      assert.equal(result.projectId, 'northwind');
    });

    it('reads actual fixture files directly and routes harborline manifest hint', async () => {
      const result = await routeSignal('Review freight manifest');
      assert.equal(result.outcome, 'MATCHED');
      assert.equal(result.projectId, 'harborline');
      assert.equal(result.matchMethod, 'routing_hint_keyword');
    });

    it('reads actual fixture files and safely observes invalid "quil" hint', async () => {
      const result = await routeSignal('Drafting new product notes');
      assert.equal(result.outcome, 'MATCHED');
      assert.equal(result.projectId, 'quill'); // Valid project matched via project keyword
      assert.equal(result.invalidHints.length, 1);
      assert.equal(result.invalidHints[0].referencedProjectId, 'quil');
    });

    it('routes unrouted signal to internal_unsorted with live fixtures', async () => {
      const result = await routeSignal('Completely unknown topic without keywords');
      assert.equal(result.outcome, 'UNROUTED');
      assert.equal(result.projectId, 'internal_unsorted');
    });
  });
});
