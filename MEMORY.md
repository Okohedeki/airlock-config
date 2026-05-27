# MEMORY

State + roadmap snapshot for `Okohedeki/airlock-config`. Read this when picking up after a context gap. The README is the marketing surface; this is the engineer's working memory.

**Last updated:** 2026-05-24 (post v0.5 rename + paseo-style README refresh)

---

## What's there (quickly)

### The reframe arc

- **v0.1 → v0.3:** Tried framing Airlock as a Claude-Code-style harness disclosure manifest (tools/hooks/mcp_servers/secrets/agent.harness). Wrong audience. Stripped in v0.4.
- **v0.4:** Anchored as a **B2B indexable capability format**. Schema centred on buyer questions: category, region, compliance, auth_model, pricing, data-access permissions, guardrails, authority rules with summary+keywords. Saved as memory `feedback_airlock_is_b2b_not_harness.md` so future sessions don't reach for hooks again.
- **v0.4.1:** Added **A2A v1.0 interop**. Airlock composes with the Agent2Agent protocol (the dominant open agent-to-agent standard — 150+ orgs, Linux Foundation governed). The bank scenario works end-to-end: a publisher emits a contract + a derived A2A Agent Card; the sandbox speaks both REST and A2A JSON-RPC. See ADR 0007 and `docs/a2a-bridge.md`.
- **v0.5 (this session):** **Renamed the project to `airlock-config`.** Brand, repo, npm package, CLI, JSON Schema file, `.airlock-config.yaml` extension, `/.well-known/airlock-config.yaml` path, top-level `airlock_config:` YAML key, `X-Airlock-Config-*` HTTP headers, `airlock-config-contract` A2A extension URI — every externally observable surface. README rewritten to a paseo-style centered hero + badges + five-bullet selling points. See ADR 0008 and `docs/migration-v04-to-v05.md`. No backward-compat shim; the validator emits a friendly hint when it sees the legacy `airlock:` key and points at the migration doc.

### v0.5 — what changed (rename only; schema shape unchanged from v0.4)

Breaking on the wire, mechanical in the code. Every v0.4 contract migrates with one `sed` and a file rename. The schema field set, the closed vocabularies, the binding/PROMISE-vs-ESTIMATE model, the sandbox routing, the A2A bridge wire shape — all carry over unchanged.

| Surface | v0.4 | v0.5 |
|---|---|---|
| Brand / display | Airlock | Airlock Config |
| npm + CLI | `airlock` | `airlock-config` |
| TS type | `AirlockContract` | `AirlockConfig` |
| Schema file | `schema/airlock.schema.json` | `schema/airlock-config.schema.json` |
| Top-level YAML key | `airlock: "0.4"` | `airlock_config: "0.5"` |
| File extension | `.airlock.yaml` | `.airlock-config.yaml` |
| Well-known path | `/.well-known/airlock.yaml` (+ `/airlock/`) | `/.well-known/airlock-config.yaml` (+ `/airlock-config/`) |
| HTTP debug headers | `X-Airlock-Detail-Source/-Example` | `X-Airlock-Config-Detail-Source/-Example` |
| A2A extension URI | `airlock-contract` | `airlock-config-contract` |
| GitHub repo | `Okohedeki/airlock` | `Okohedeki/airlock-config` (after Phase 6 push) |
| Pages URL | `okohedeki.github.io/airlock` | `okohedeki.github.io/airlock-config` |

### Components shipped

| Component | Lives at | Status |
|---|---|---|
| Contract schema (v0.5) | `schema/airlock-config.schema.json` | ✅ |
| Validator | `src/validate/` (version gate accepts 0.5; emits migration hint for legacy `airlock:` key) | ✅ |
| Pipeline (skill-only) | `src/pipeline/` (unchanged from v0.4) | ✅ |
| Schema-derived faker (ADR 0005) | `src/pipeline/faker.ts` (unchanged) | ✅ |
| Sandbox HTTP server | `src/sandbox/index.ts` — REST + A2A routes | ✅ |
| Pre-flight checker | `src/preflight/` | ✅ |
| Renderer | `src/render/` — B2B sections + binding badges | ✅ |
| A2A module | `src/a2a/` (agent-card + adapter + tasks + index) | ✅ |
| Product home page | `src/home/index.ts` | ✅ |
| Site builder | `src/render/site.ts` — emits `agent-card.json` per example | ✅ |
| Registry helpers | `src/registry/` — `buildRegistryEntry`, `searchRegistry` | ✅ |
| Conformance runner | `src/conform/` | ✅ |
| CLI | `src/cli.ts` — `airlock-config validate / preflight / sandbox / check / build / build-site / agent-card / register-entry / search` | ✅ |
| Logo placeholder | `assets/logo.svg` | ✅ NEW |

### Other artifacts

| Thing | Location |
|---|---|
| ADRs | `docs/adr/0001..0008` (0008 = the rename) |
| Bridge doc | `docs/a2a-bridge.md` — how Airlock Config + A2A compose, mapping tables |
| Migration | `docs/migration-v03-to-v04.md`, `docs/migration-v04-to-v05.md` |
| Canonical glossary | `CONTEXT.md` |
| Examples | `examples/minimal.airlock-config.yaml`, `examples/supplier-agent.airlock-config.yaml` |
| GitHub Pages workflow | `.github/workflows/pages.yml` (runs `build-site`) |
| Live demo | https://okohedeki.github.io/airlock-config/ (product home) + `/examples/acme-supplier-agent/.well-known/agent-card.json` (the demo Agent Card). **Needs republish + repo rename for v0.5.** |
| Verification scripts | `scripts/verify-playground.mjs`, `scripts/verify-live.mjs` |

### Tests + tooling

- **127 tests across 10 files.** All passing after rename. New tests in `validate.test.ts` cover the legacy-`airlock:`-key migration hint.
- TypeScript strict mode, NodeNext modules. Zero new runtime dependencies.

---

## What's next (in depth)

### 0. Phase 6 — GitHub-side rebrand (immediate)

`gh repo rename airlock-config --repo Okohedeki/airlock`, update local remote, push, tag `v0.5.0`, verify Pages serves `okohedeki.github.io/airlock-config/`. **Pause to confirm with the user before running any of these.**

### 1. v0.6 — signed Agent Cards + streaming + bank example

Carried over from the prior v0.5 plan (now repositioned to v0.6 since v0.5 was consumed by the rename). Signed Agent Cards (A2A v1.0 `signature` block, ECDSA P-256, JWKS endpoint, `sign-card`/`verify-card`/`keygen` CLI, RFC 8785 canonicalization), streaming, push notifications, fintech flagship example. ~1 week.

### 2. Codegen — typed handler stubs

Unchanged from prior roadmap. ~1 day for a viable v1. Bridges sandbox-as-simulator to publisher-deployed business logic.

### 3. Actually stand up `Okohedeki/airlock-directory` (the searchable registry)

The registry repo doesn't exist yet. It's the **airlock-directory** project — the ecosystem's searchable "find" layer (aligned 2026-05-26; was provisionally called `airlock-config-registry`). v0.4 shipped `register-entry` + `search`; the repo just needs to be created with one `registry.json` containing the supplier-agent demo entry. ~half a day. (Naming: "registry" = the index concept; "airlock-directory" = the repo.)

### 4. Infrastructure cleanups (interleave)

- Bump GitHub Actions to Node 24 (Node 20 deprecation warnings).
- Add `LICENSE` file (Apache-2.0 in package.json but file missing).
- Add `CONTRIBUTING.md`.
- Publish to npm under `airlock-config`.

---

## How to use this file

1. Read this file. Get oriented in 2 minutes.
2. Skim `README.md` for the demo flow + CLI surface.
3. Skim ADRs 0004 + 0006 + 0007 + 0008 for the schema reframe, A2A composition, and v0.5 rename rationale.
4. Skim `docs/a2a-bridge.md` if touching A2A interop.
5. Pick a "What's next" item.
6. Update this file when the snapshot drifts.

Don't let this file drift more than a session out of date.
