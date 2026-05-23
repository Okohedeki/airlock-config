# MEMORY

State + roadmap snapshot for `Okohedeki/airlock`. Read this when you (or future-you, or a contributor) needs to pick up where the last session left off. The README is the marketing surface; this is the engineer's working memory.

**Last updated:** 2026-05-23 (post v0.3 harness-disclosure reframe)

---

## What's there (quickly)

### v0.3 reframe — what changed

Airlock is no longer a service-RPC contract format; it is now a **full disclosure manifest for AI-agent harnesses**. A foreign AI fetching `/.well-known/airlock.yaml` can know everything the target agent will and won't do — skills, tools, hooks, permissions, guardrails, harness internals — before sending a single command. The sandbox now produces a real-feeling response for every call (schema-derived faker fallback, see ADR 0005) so consumers never see an empty body.

The decision line that prevents the schema from collapsing into incoherence: per ADR 0004, blocks are tagged **binding** (load-bearing promises, conformance asserts these) or **informational** (deployment facts, may change in minor versions). The publisher can swap framework/model/runtime/MCP servers without bumping the major.

Schema went `0.1` → `0.3`. v0.2 was reserved/never published. v0.1 contracts are rejected with a pointer to `docs/migration-v01-to-v03.md`.

Flagship example pivoted from `examples/procurement.airlock.yaml` (B2B-coded) to `examples/agent-harness.airlock.yaml` (a fictional Claude-Code-style AI coding agent). Procurement was deleted; minimal stayed.

### Components shipped

| Component | Lives at | Status |
|---|---|---|
| Contract schema (v0.3) | `schema/airlock.schema.json` + `docs/contract-schema.md` | ✅ |
| Migration note | `docs/migration-v01-to-v03.md` | ✅ |
| Validator (structural + lint + version gate) | `src/validate/` | ✅ |
| Expression engine (parser + evaluator) | `src/expr/` | ✅ |
| Pipeline (skill + tool evaluation) | `src/pipeline/` | ✅ |
| Schema-derived faker | `src/pipeline/faker.ts` | ✅ |
| Sandbox HTTP server (skills + tools) | `src/sandbox/` | ✅ |
| Pre-flight checker | `src/preflight/` | ✅ |
| Renderer (HTML + llms.txt + landing; v0.3 sections) | `src/render/` | ✅ |
| In-browser playground bundle (envelope shape) | `src/playground/` | ✅ |
| Conformance runner | `src/conform/` | ✅ |
| CLI | `src/cli.ts` | ✅ (validate, preflight, sandbox, check, build) |

### Other artifacts

| Thing | Location |
|---|---|
| ADRs | `docs/adr/0001..0005` |
| Canonical glossary (with v0.3 terms) | `CONTEXT.md` |
| Original design | `prompt.md` (older — pre-v0.3 framing) |
| Examples | `examples/minimal.airlock.yaml`, `examples/agent-harness.airlock.yaml` |
| GitHub Pages workflow | `.github/workflows/pages.yml` (now points at agent-harness example) |
| Live demo | https://okohedeki.github.io/airlock/.well-known/airlock/ — **needs republish to see v0.3** |
| Sister project marker | `docs/airlock-deploy-sister-project.md` |
| Verification scripts | `scripts/verify-playground.mjs` (updated), `scripts/verify-live.mjs` |

### Tests + tooling

- 92 tests across 7 files (vitest) — was 59 in v0.1
- TypeScript strict mode, NodeNext modules
- `npm run build` → `dist/cli.js` + `dist/playground.bundle.js` (esbuild, ~152KB minified)
- `npm test` builds the playground first so tests stay in sync with what ships

---

## What's next (in depth)

The build order has 10 steps; 7 are complete (same as before v0.3, but on a richer schema). The three unticked items are still real work, ordered here by how much they unblock vs. effort.

### 0. Republish the live demo (immediate)

Push to main → GitHub Pages workflow → live URL serves the v0.3 harness contract. Then run `node scripts/verify-live.mjs` to confirm. **Pause to confirm with the user before pushing** (shared-state action per the harness contract for *this* repo).

### 1. Codegen — typed handler stubs (step 5 of build order)

**Why it matters next:** the sandbox is fully functional but a *simulator* — its example replay + schema faker can substitute for a real backend, but eventually publishers need to wire actual business logic. Codegen is the bridge from "demo loop" to "production". This is also the natural input for the airlock-deploy sister project.

**What's different from the pre-v0.3 plan:** codegen must now emit types for tools, hooks, and the harness block alongside skills. The TypeScript output should make every binding block a typed structure the publisher implements; informational blocks become metadata constants.

Design questions to resolve before writing code are unchanged from the v0.1 notes (library vs hand-roll, single vs multi-file, library vs framework, verdict envelope shape).

**Estimate:** ~1 day for a viable v1, ~3 days for polish + tests.

### 2. Discovery — GitHub-list registry (step 8 of build order)

Unchanged from v0.1 plan. v0.3 entries should include a `harness.framework` field in the registry index for filtering ("show me only Claude-Code-published agents"). Otherwise the design is identical.

**Estimate:** ~half a day for the bare minimum.

### 3. A2A adapter (step 9 of build order)

Unchanged from v0.1 plan. v0.3's hooks/permissions/guardrails will need translating into the Agent Card equivalents — that's interesting work but doesn't change the adapter shape.

**Estimate:** ~2-3 days.

### 4. Fault / drift injection (step 10 of build order)

Unchanged. Lower priority.

### 5. The sister project (`airlock-deploy`)

**See:** `docs/airlock-deploy-sister-project.md`. Don't start until codegen lands.

### 6. Infrastructure cleanups (interleave)

- **Bump GitHub Actions to Node 24.** Deprecation warnings on Node 20.
- **LICENSE file.** Repo says Apache-2.0 in `package.json` but has no LICENSE file at root.
- **CONTRIBUTING.md.** Before accepting external PRs.
- **Publish to npm.** Pick a name (`airlock` is likely taken — try `@okohedeki/airlock`).
- **`/llms.txt` at root.** Convention puts it at `/llms.txt`, not `/.well-known/airlock/llms.txt`. Decide symlink or move.

### 7. Deferred to v0.4+

- A `safety` / `defenses` block for prompt-injection-resistance self-attestation (Plan agent flagged this; deferred to keep v0.3 scoped).
- An opt-in BYOK LLM stub mode on the sandbox (richer faked responses, consumer pays). ADR 0005 documents the deferral.

---

## Bigger questions, not on the build order

- **Real-world dogfood.** Even more pressing now. Point Claude Code, a Vercel AI SDK example, and a LangChain agent at the live URL and ask "what can this agent do and not do?" — if any of them can't answer, a v0.3 field is mis-named or under-described. This was the v12 verification step in the original plan.
- **Marketing positioning.** The reframe is from "AI docs for agents" to "disclosure manifest for AI agent harnesses". Test the new pitch on first adopters.
- **Layer 3.** Still deferred per ADR 0001. Don't bring up unless an enterprise asks.

---

## How to use this file

When you (or anyone) opens this repo for the first time after a context gap:

1. **Read this file.** Get oriented in 2 minutes.
2. **Skim `README.md`** for the end-to-end demo flow + the current CLI surface.
3. **Skim ADRs 0004 + 0005** if you're touching the schema or sandbox.
4. **Pick a "What's next" item.** Each one has the design questions enumerated.
5. **Update this file** when the snapshot drifts.

Don't let this file drift more than a session out of date. If it's wrong, it's worse than having no memory at all.
