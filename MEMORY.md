# MEMORY

State + roadmap snapshot for `Okohedeki/airlock`. Read this when picking up after a context gap. The README is the marketing surface; this is the engineer's working memory.

**Last updated:** 2026-05-23 (post v0.4 B2B reframe)

---

## What's there (quickly)

### The reframe — v0.3 → v0.4

v0.3 (shipped earlier today) framed Airlock as a Claude-Code-style AI-harness disclosure manifest with `tools`, `hooks`, `mcp_servers`, `secrets`, `delegates_to`, `agent.harness`. User flagged immediately: those are infrastructure-internal fields, not what a B2B buyer reads. A procurement officer cares about industry, region, compliance, pricing, and what the agent does — not which MCP servers are loaded.

v0.4 strips all the developer-shaped blocks and anchors the contract on **buyer-facing capability disclosure**:

- A business publishes their self-deployed agent's contract.
- A registry indexes it on closed-vocabulary fields (`category.industry`, `category.capability`, `region`, `compliance`, `auth_model`, `pricing`).
- Other businesses' AI agents query the registry, pre-filter, fetch the contract, and integrate.

ADR 0006 records the reframe. ADR 0004 is revised inline (the binding/informational split is right; the field list was wrong). The schema bumped 0.3 → 0.4; v0.1/v0.2/v0.3 all rejected with a pointer to `docs/migration-v03-to-v04.md`.

### Components shipped

| Component | Lives at | Status |
|---|---|---|
| Contract schema (v0.4) | `schema/airlock.schema.json` + `docs/contract-schema.md` | ✅ |
| Curated vocabularies | `docs/taxonomies.md` (industry, capability, region, compliance, auth, pricing, data classes) | ✅ |
| Migration note | `docs/migration-v03-to-v04.md` | ✅ |
| Validator (structural + lint + version gate) | `src/validate/` — including warnings for missing rule summary + non-recommended guardrails vocab | ✅ |
| Expression engine | `src/expr/` (unchanged across reframe) | ✅ |
| Pipeline (skill-only) | `src/pipeline/` — tool-targeted paths removed | ✅ |
| Schema-derived faker (ADR 0005) | `src/pipeline/faker.ts` (unchanged across reframe) | ✅ |
| Sandbox HTTP server | `src/sandbox/index.ts` — skill routes only; `/tools/...` removed | ✅ |
| Pre-flight checker | `src/preflight/` | ✅ |
| Renderer | `src/render/` — B2B sections (Category, Region, Compliance, Auth, Pricing, Data access, Guardrails); rule summary + keyword chips | ✅ |
| **Product home page** | `src/home/index.ts` — hand-authored marketing surface for B2B decision-makers | ✅ |
| **Site builder** | `src/render/site.ts` + `airlock build-site` CLI | ✅ |
| **Registry helpers** | `src/registry/` — `buildRegistryEntry`, `searchRegistry` | ✅ |
| In-browser playground | `src/playground/index.ts` — compiles against trimmed types | ✅ |
| Conformance runner | `src/conform/` | ✅ |
| CLI | `src/cli.ts` — validate, preflight, sandbox, check, build, build-site, register-entry, search | ✅ |

### Other artifacts

| Thing | Location |
|---|---|
| ADRs | `docs/adr/0001..0006` |
| Canonical glossary (v0.4 terms) | `CONTEXT.md` |
| Original design | `prompt.md` (pre-v0.3 framing; some terms stale) |
| Examples | `examples/minimal.airlock.yaml` (3 lines bigger than v0.3 because `category` is required), `examples/supplier-agent.airlock.yaml` (flagship; procurement supplier) |
| GitHub Pages workflow | `.github/workflows/pages.yml` — now runs `build-site` |
| Live demo URL | https://okohedeki.github.io/airlock/ (product home page) + https://okohedeki.github.io/airlock/examples/acme-supplier-agent/.well-known/airlock/ (demo contract). **Needs republish to see v0.4.** |
| Verification scripts | `scripts/verify-playground.mjs`, `scripts/verify-live.mjs` |

### Tests + tooling

- 91 tests across 8 files (vitest). Down from 92 at v0.3 because the tool-route tests are gone; up because of new registry tests + site build tests.
- TypeScript strict mode, NodeNext modules.
- `npm run build` → `dist/cli.js` + `dist/playground.bundle.js`.

---

## What's next (in depth)

### 0. Republish the live demo (immediate)

Push to main → Pages workflow → live URL serves the v0.4 product home page + the supplier-agent demo. Then `node scripts/verify-live.mjs`. **Pause to confirm with the user before pushing** — pushing to main triggers a public republish.

### 1. Codegen — typed handler stubs (unchanged from prior roadmap)

The sandbox is fully functional but a simulator. Publishers need typed handler stubs to wire actual backend logic. ~1 day for a viable v1. Design questions unchanged from the v0.1 plan (json-schema-to-typescript vs hand-roll, single vs multi-file, library vs framework, verdict envelope shape).

### 2. Actually stand up `Okohedeki/airlock-registry`

v0.4 ships the entry-builder (`airlock register-entry`) and the search command (`airlock search`), but the registry repo doesn't exist yet. Create it with one `registry.json` containing the supplier-agent demo entry; write a `CONTRIBUTING.md` for self-listing; later add a GitHub Actions workflow that validates submitted entries. ~half a day for the bare minimum.

### 3. A2A adapter (unchanged from prior roadmap)

HTTP-only is fine for v1. As soon as a real consumer wants to talk over A2A, build the adapter in `src/sandbox/adapters/a2a.ts`. ~2–3 days.

### 4. Fault / drift injection (unchanged)

Lower priority. ~half a day.

### 5. Sister project `airlock-deploy`

Don't start until codegen lands. See `docs/airlock-deploy-sister-project.md`.

### 6. Infrastructure cleanups (interleave)

- Bump GitHub Actions to Node 24 (Node 20 deprecation warnings on every Pages run).
- Add `LICENSE` file (Apache-2.0 referenced in package.json but the file is missing).
- Add `CONTRIBUTING.md`.
- Publish to npm under a final name.
- Consider `/llms.txt` at the site root in addition to the per-contract `/.well-known/airlock/llms.txt`.

### 7. Deferred to v0.5+

- An *operational profile* companion format (`airlock-operational.yaml`) covering the v0.3 fields that v0.4 stripped — tools, hooks, mcp_servers, secrets — for audit-pack / vendor-due-diligence use. Build only if real demand emerges. See ADR 0006.
- Opt-in BYOK LLM stub mode for the sandbox (richer faked responses).
- A `safety` / `defenses` block for prompt-injection-resistance self-attestation.

---

## Bigger questions, not on the build order

- **Real-world dogfood is more urgent than ever.** Point Claude Code or an SDK script at the live home page URL and ask "what is this? would my business publish here? if so, what would my contract look like?" — if the answer is wrong on first read, the home page copy is wrong and we iterate.
- **Curated vocabulary maintenance.** Closed enums for industry/capability/region/compliance/auth_model/pricing mean the project owns the vocabulary. Each new value needs an ADR-class decision. `tags: [string]` is the open escape hatch.
- **Indexability is asymmetric.** Publishers who write `summary` + `keywords` on every rule become searchable for substance; ones who don't, don't. The lint warns but can't force.

---

## How to use this file

1. **Read this file.** Get oriented in 2 minutes.
2. **Skim `README.md`** for the demo flow + CLI surface.
3. **Skim ADRs 0004 + 0006** for the v0.4 reframe rationale.
4. **Pick a "What's next" item.**
5. **Update this file** when the snapshot drifts.

Don't let this file drift more than a session out of date.
