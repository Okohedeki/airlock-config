# MEMORY

State + roadmap snapshot for `Okohedeki/airlock`. Read this when picking up after a context gap. The README is the marketing surface; this is the engineer's working memory.

**Last updated:** 2026-05-23 (post v0.4.1 A2A interop MVP)

---

## What's there (quickly)

### The reframe arc

- **v0.1 → v0.3 (shipped earlier today, then ripped):** Tried framing Airlock as a Claude-Code-style harness disclosure manifest (tools/hooks/mcp_servers/secrets/agent.harness). Wrong audience. Stripped in v0.4.
- **v0.4 (shipped earlier today):** Anchored as a **B2B indexable capability format**. Schema centred on buyer questions: category, region, compliance, auth_model, pricing, data-access permissions, guardrails, authority rules with summary+keywords. Saved as memory `feedback_airlock_is_b2b_not_harness.md` so future sessions don't reach for hooks again.
- **v0.4.1 (this session):** Added **A2A v1.0 interop**. Airlock now composes with the Agent2Agent protocol (the dominant open agent-to-agent standard — 150+ orgs, Linux Foundation governed). The bank scenario works end-to-end: a bank publishes an Airlock contract, the build step also emits a valid A2A Agent Card, and the sandbox speaks A2A JSON-RPC. See ADR 0007 and `docs/a2a-bridge.md`.

### v0.4.1 — what changed

Purely additive over v0.4. Every v0.4 contract still validates. The new pieces:

- **Optional `a2a` block in the schema** — bridge hints for the derived Agent Card. Informational per ADR 0004.
- **New module `src/a2a/`** — `agent-card.ts` (pure derivation), `adapter.ts` (hand-rolled JSON-RPC 2.0 dispatcher), `tasks.ts` (in-memory task store), `index.ts`.
- **Sandbox grows two routes**: `GET /.well-known/agent-card.json` (the derived card) and `POST /a2a` (JSON-RPC). Existing REST routes unchanged.
- **`airlock build-site` emits `agent-card.json` alongside `airlock.yaml`** for every example.
- **New CLI command `airlock agent-card`** to derive a standalone card.
- **`airlock sandbox` gains `--channel <http|a2a|both>`** (informational; controls only what the index page advertises).
- **ADR 0007** — "compose with A2A; don't reinvent the wire". The derivation discipline (contract = source of truth, Agent Card = derived) is folded into 0007 as a paragraph; promotable to a standalone ADR 0008 when v0.5 lands.

### What's implemented (A2A side) and what's deferred

**Implemented (v0.4.1 MVP):**
- Agent Card derivation from contract
- JSON-RPC methods: `SendMessage`, `GetTask`, `CancelTask`
- Verdict → TaskState mapping (uses A2A v1.0's new `TASK_STATE_REJECTED` and `TASK_STATE_AUTH_REQUIRED`)

**Deferred to v0.5** (plan available in `/Users/edekiokoh/.claude/plans/`):
- Signed Agent Cards (A2A v1.0 `signature` block, ECDSA P-256, JWKS endpoint, `sign-card`/`verify-card`/`keygen` CLI, RFC 8785 canonicalization)
- Streaming (`SendStreamingMessage` + SSE)
- Push notifications (`CreateTaskPushNotificationConfig` and siblings)
- `ListTasks`, `GetExtendedAgentCard`
- Per-skill `a2a` overrides
- Fintech flagship example (`examples/bank-agent.airlock.yaml` with PCI_DSS + mTLS + signing)
- `@a2a-js/sdk` round-trip verification script
- Promoting derivation discipline to standalone ADR 0008

### Components shipped

| Component | Lives at | Status |
|---|---|---|
| Contract schema (v0.4.1) | `schema/airlock.schema.json` (optional `a2a` block) | ✅ |
| Validator | `src/validate/` (version gate accepts 0.4.x + 0.5) | ✅ |
| Pipeline (skill-only) | `src/pipeline/` (unchanged from v0.4) | ✅ |
| Schema-derived faker (ADR 0005) | `src/pipeline/faker.ts` (unchanged) | ✅ |
| Sandbox HTTP server | `src/sandbox/index.ts` — REST + A2A routes | ✅ |
| Pre-flight checker | `src/preflight/` | ✅ |
| Renderer | `src/render/` — B2B sections + binding badges | ✅ |
| **A2A module** | `src/a2a/` (agent-card + adapter + tasks + index) | ✅ NEW |
| Product home page | `src/home/index.ts` | ✅ |
| Site builder | `src/render/site.ts` — emits `agent-card.json` per example | ✅ updated |
| Registry helpers | `src/registry/` — `buildRegistryEntry`, `searchRegistry` | ✅ |
| Conformance runner | `src/conform/` | ✅ |
| CLI | `src/cli.ts` — validate, preflight, sandbox, check, build, build-site, agent-card, register-entry, search | ✅ |

### Other artifacts

| Thing | Location |
|---|---|
| ADRs | `docs/adr/0001..0007` |
| Bridge doc | `docs/a2a-bridge.md` — how Airlock + A2A compose, mapping tables |
| Canonical glossary | `CONTEXT.md` (adds Agent Card + A2A wire terms) |
| Examples | `examples/minimal.airlock.yaml`, `examples/supplier-agent.airlock.yaml` (both v0.4.1; supplier adds optional `a2a` block) |
| GitHub Pages workflow | `.github/workflows/pages.yml` (runs `build-site`) |
| Live demo | https://okohedeki.github.io/airlock/ (product home) + `/examples/acme-supplier-agent/.well-known/agent-card.json` (the demo Agent Card). **Needs republish for v0.4.1.** |
| Verification scripts | `scripts/verify-playground.mjs`, `scripts/verify-live.mjs` (asserts Agent Card live) |

### Tests + tooling

- **125 tests across 10 files** (was 91 in v0.4). New files: `agent-card.test.ts`, `a2a-adapter.test.ts`.
- TypeScript strict mode, NodeNext modules. Zero new runtime dependencies.

---

## What's next (in depth)

### 0. Republish the live demo (immediate)

Push to main → Pages workflow → live URL serves the v0.4.1 demo with Agent Card alongside the contract. Then `node scripts/verify-live.mjs`. **Pause to confirm with the user before pushing.**

### 1. v0.5 — signed Agent Cards + streaming + bank example

The full plan for v0.5 lives at `/Users/edekiokoh/.claude/plans/ok-now-let-s-read-whimsical-pancake.md` (overwritten with the v0.4.1 MVP cut; the v0.5 superset is documented inside as "Deferred"). Estimated ~1 week of additional work on top of v0.4.1.

### 2. Codegen — typed handler stubs

Unchanged from prior roadmap. ~1 day for a viable v1. Bridges sandbox-as-simulator to publisher-deployed business logic.

### 3. Actually stand up `Okohedeki/airlock-registry`

The registry repo doesn't exist yet. v0.4 shipped `register-entry` + `search`; the repo just needs to be created with one `registry.json` containing the supplier-agent demo entry. ~half a day.

### 4. Infrastructure cleanups (interleave)

- Bump GitHub Actions to Node 24 (Node 20 deprecation warnings).
- Add `LICENSE` file (Apache-2.0 in package.json but file missing).
- Add `CONTRIBUTING.md`.
- Publish to npm under a final name.

---

## How to use this file

1. Read this file. Get oriented in 2 minutes.
2. Skim `README.md` for the demo flow + CLI surface.
3. Skim ADRs 0004 + 0006 + 0007 for the schema reframe + A2A composition rationale.
4. Skim `docs/a2a-bridge.md` if touching A2A interop.
5. Pick a "What's next" item.
6. Update this file when the snapshot drifts.

Don't let this file drift more than a session out of date.
