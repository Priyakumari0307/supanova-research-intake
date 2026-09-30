# Supanova Research Intake

A local-first research intake control plane that allows operators to intake URLs and research notes, evaluate deterministic project routing, commit signals through guarded persistence, generate grounded candidate work items from source evidence, and execute deliberate human review workflows with full audit trail logging.

---

## Core Workflow

```
Research URL / Note
       │
       ▼
Routing Preview (Stateless Evaluation)
       │
       ▼
Signal Creation (Guarded Server Write)
       │
       ▼
Inbox Control Plane (Dynamic Filtering & Sorters)
       │
       ▼
Candidate Work Generation (Evidence-Grounded Drafts)
       │
       ▼
Human Review (Explicit APPROVED / REJECTED Decision)
       │
       ▼
Audit Trail & Review Activity Ledger
```

---

## Architecture

- **Frontend Client**: Next.js 14 (React 18, TypeScript, Tailwind CSS, Lucide Icons) rendering an internal operations control plane. Communicates with the backend exclusively over HTTP REST endpoints.
- **Backend API**: Express 4 + TypeScript (`tsx`) service encapsulating input validation, safe content fetching, deterministic routing, guarded atomic writes, and review persistence.
- **Local Persistence Layer**: JSON-backed local ledger files (`fixture/signal-ledger.json`, `fixture/candidate-reviews.json`) and append-only audit log (`fixture/run-log.jsonl`).
- **Security & Integrity Boundary**: The browser client never reads or writes fixture files directly. All persistence actions pass through guarded backend validation paths that enforce server-owned identities, immutable timestamps, and audit logging.

---

## Project Structure

```
supanova-research-intake/
├── backend/                             # Express + TypeScript backend API
│   ├── src/
│   │   ├── routes/                      # REST API endpoint handlers
│   │   │   ├── candidate-review.router.ts
│   │   │   ├── candidate-work.router.ts
│   │   │   ├── config.router.ts
│   │   │   ├── projects.router.ts
│   │   │   ├── routing.router.ts
│   │   │   └── signals.router.ts
│   │   ├── services/                    # Core business logic & storage engines
│   │   │   ├── candidate-review-storage.service.ts
│   │   │   ├── candidate-work.service.ts
│   │   │   ├── fetcher.service.ts
│   │   │   ├── fixture.service.ts
│   │   │   ├── ledger-storage.service.ts
│   │   │   ├── research-signal.service.ts
│   │   │   ├── routing.service.ts
│   │   │   └── signal-validator.service.ts
│   │   ├── types/                       # TypeScript models & validation schemas
│   │   ├── app.ts                       # Express app configuration & middleware
│   │   └── index.ts                     # Server entrypoint (Port 4000)
│   ├── package.json
│   └── tsconfig.json
├── frontend/                            # Next.js 14 client application
│   ├── src/
│   │   ├── app/
│   │   │   ├── globals.css              # Design system tokens & base styles
│   │   │   ├── layout.tsx               # Root application layout
│   │   │   └── page.tsx                 # Main control plane view
│   │   ├── components/                  # UI components
│   │   │   ├── CandidateWorkPreview.tsx # Work suggestion drawer & review actions
│   │   │   ├── Header.tsx               # Global system header & status indicator
│   │   │   ├── RecentSignals.tsx        # Inbox stream with client-side filters
│   │   │   ├── ReviewActivity.tsx       # Persisted decision audit history
│   │   │   └── RoutingPreview.tsx       # Live routing evaluation & diagnostics
│   │   ├── lib/
│   │   │   └── api.ts                   # Type-safe HTTP API client
│   │   └── types/
│   │       └── api.types.ts             # Client-side data contracts
│   ├── package.json
│   ├── postcss.config.js
│   ├── tailwind.config.js
│   └── tsconfig.json
├── fixture/                             # Local offline persistence pack
│   ├── candidate-reviews.json           # Persisted human review decisions
│   ├── config.json                      # Project manifests, domains, and keywords
│   ├── routing-hints.json               # Explicit keyword/domain routing rules
│   ├── run-log.jsonl                    # Append-only audit trail
│   └── signal-ledger.json               # Primary signal storage
├── .gitignore
└── README.md
```

---

## Requirements

- **Node.js**: v18.x or v20.x+
- **npm**: v9.x or v10.x+
- **Offline / Local**: No cloud database, external AI API, API key, or third-party account is required.

---

## Local Setup

### 1. Start the Backend Service

In a terminal, navigate to the `backend` directory, install dependencies, and run the development server:

```bash
cd backend
npm install
npm run dev
```

The backend server starts at `http://localhost:4000`.
- Health check: `http://localhost:4000/api/health`

### 2. Start the Frontend Client

In a second terminal, navigate to the `frontend` directory, install dependencies, and start the development server:

```bash
cd frontend
npm install
npm run dev
```

The frontend client starts at `http://localhost:3000`. Open `http://localhost:3000` in your browser.

---

## Available Scripts

### Backend (`backend/package.json`)

| Command | Description |
|---|---|
| `npm run dev` | Starts the backend development server with file watching via `tsx watch` |
| `npm run build` | Compiles TypeScript source files to the `dist/` directory via `tsc` |
| `npm test` | Runs the automated test suite with the native Node.js test runner via `tsx --test` |
| `npm start` | Executes the compiled JavaScript server from `dist/index.js` |

### Frontend (`frontend/package.json`)

| Command | Description |
|---|---|
| `npm run dev` | Launches the Next.js development server on port 3000 |
| `npm run build` | Builds an optimized production bundle |
| `npm start` | Runs the production Next.js server on port 3000 |
| `npm run lint` | Runs ESLint validation across frontend source files |

---

## System Capabilities & Flow

### 1. Research Intake & Deterministic Routing
- **Input Modalities**: Accepts source links (URLs) or raw note excerpts with optional custom titles.
- **Stateless Routing Preview**: Users can evaluate how a signal will be routed *before* committing any data to disk.
- **Routing Rules Pipeline**:
  1. **Explicit Routing Hints**: Checks configured domain and keyword hints in `routing-hints.json`.
  2. **Project Domain & Keyword Matching**: Evaluates configured domains and whole-word keyword boundaries for active projects from `config.json`.
  3. **Ambiguity Surfacing**: If multiple projects match conflicting rules, the engine tags the result as `AMBIGUOUS` and routes to `internal_unsorted` rather than silently guessing.
  4. **Unrouted Fallback**: Signals with no matching rules safely route to `internal_unsorted`.

### 2. Safe Signal Creation & Guarded Writes
- **Server Validation**: The backend validates payload contents, verifies protocol safety, and extracts plain text content.
- **Server-Managed Identity**: The server generates immutable `id`, `match_key`, and `detected_on` fields. Client attempts to supply custom IDs or statuses are strictly rejected.
- **Atomic File Persistence**: Signal ledger updates write via temporary atomic replacement to prevent data corruption.
- **Audit Logging**: Successful writes append a `signal_created` event to `fixture/run-log.jsonl`.

### 3. Inbox Control Plane & Dynamic Filtering
- **Live Stream**: Displays latest recorded signals sorted newest first.
- **Dynamic Client-Side Filters**: Filters signals simultaneously by **Project**, **Status**, and **Type** using dynamically derived options present in the dataset.
- **Responsive Status**: Shows operational metadata (title, project tag, signal type, ledger status, timestamp).

### 4. Grounded Candidate Work Generation
- **Evidence-Based Extraction**: Deterministically scans signal source text for explicit actionable items (e.g., action items, investigation needs, implementation requests).
- **Grounded Excerpts**: Every candidate item includes verbatim evidence excerpts and confidence metrics.
- **Draft Status**: Candidate work begins in `DRAFT` status and cannot transition to committed work without explicit human review.

### 5. Human Review Workflow
- **Explicit Decisions**: Reviewers can review candidate work and submit either `APPROVED` or `REJECTED` with optional reviewer notes.
- **Client Payload Boundary**: The browser transmits *only* `{ decision, reviewer_notes }`. Candidate ID, signal ID, project, and timestamps are resolved and assigned server-side.
- **Single Decision Enforcement**: Enforces a strict one-review-per-candidate constraint. Subsequent review attempts on the same candidate return `409 Conflict`.
- **Review Persistence & Audit**: Persists decisions in `fixture/candidate-reviews.json` and logs a `candidate_review_decided` audit entry to `fixture/run-log.jsonl`.

---

## Safe URL Fetching Protections

When a user submits a URL for research intake, the backend fetcher service applies the following safeguards:
- **Protocol Whitelisting**: Accepts only `http:` and `https:` protocols (rejects `ftp:`, `file:`, `javascript:`, `data:`).
- **Timeouts**: Enforces request timeouts to prevent hung socket connections.
- **Redirect Limits**: Restricts the maximum number of HTTP redirects to prevent redirection loops.
- **Size Limits**: Caps maximum response body byte size to protect against unbounded memory growth.
- **Safe HTML Sanitization**: Strips executable scripts, stylesheets, iframes, and inline event handlers, extracting clean text and title content as passive data.
- **Network Fault Tolerance**: Gracefully handles non-2xx responses (e.g., 404, 500) and network failures without crashing.

---

## Automated Testing

Run the full backend test suite:

```bash
cd backend
npm test
```

### Test Coverage Summary (118 Tests Across 33 Suites)

1. **Safe URL Fetching & Source Handling** (`src/services/fetcher.service.test.ts`):
   - Protocol validation, timeout handling, redirect tracking, size limits, HTML sanitization.
2. **Deterministic Project Routing** (`src/services/routing.service.test.ts`):
   - Keyword matching, domain matching, manifest routing hints, ambiguous matches, fallback routing, invalid hint isolation.
3. **Research Signal Creation Pipeline** (`src/services/research-signal.service.test.ts`):
   - Input validation, server-managed identity, client injection rejection, atomic persistence, audit trail generation.
4. **Candidate Work Data Model & Generation** (`src/types/candidate-work.test.ts`, `src/services/candidate-work.service.test.ts`):
   - Schema validation, grounded evidence extraction, draft suggestion lifecycle.
5. **Candidate Review Validation & Guarded Storage** (`src/types/candidate-review.test.ts`, `src/services/candidate-review-storage.test.ts`, `src/routes/candidate-review.router.test.ts`):
   - Decision validation (`APPROVED` / `REJECTED`), guarded atomic writes, duplicate review rejection (`409 Conflict`), audit event creation.

---

## Core Product Decisions

1. **Deterministic Rules Before Judgement**: Routing rules and keyword bindings operate deterministically and transparently before any downstream work is generated.
2. **Ambiguity Is Surfaced, Never Guessed**: When a signal matches keywords or domains from multiple projects, the system flags it as `AMBIGUOUS` and routes it to `internal_unsorted` for human triage rather than making an arbitrary guess.
3. **Candidate Work Stays Draft Until Approved**: Generated work suggestions remain uncommitted drafts until a human reviewer explicitly approves or rejects them.
4. **Single Guarded Server-Side Write Path**: All file writes and audit trail logging are strictly owned and verified by the backend server.
