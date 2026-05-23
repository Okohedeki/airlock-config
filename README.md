# Airlock

The disclosure manifest format for AI-agent harnesses. A publisher writes one contract describing **everything an external agent can know about their agent** — skills it exposes, tools it reaches for, hooks that fire around its work, permissions it operates under, guardrails it refuses to cross — then renders that file as a machine spec + human-readable docs + LLM-readable docs that other agents integrate against without prior coordination.

**v1 is Layer 1 (the schema) + Layer 2 (open-source tooling).** It is not a hosted gateway or a runtime — see [`docs/adr/0001-airlock-is-docs-not-runtime.md`](./docs/adr/0001-airlock-is-docs-not-runtime.md). The reframe in v0.3 is described in [`docs/adr/0004-harness-fields-are-informational.md`](./docs/adr/0004-harness-fields-are-informational.md).

## What's new in v0.3

The schema gains five binding capability blocks and four informational disclosure blocks:

- **Binding** (load-bearing promises consumers may rely on): `skills`, `tools`, `hooks`, `permissions`, `guardrails`, plus the existing `authority` / `instant_failures` / `actions` / `sla`.
- **Informational** (deployment facts; may change in minor versions per ADR 0004): `agent.harness` (framework, model, runtime, limits), `mcp_servers`, `secrets`, `delegates_to`.

The sandbox now falls back to a **deterministic schema-derived faker** when no authored example matches (ADR 0005), so consumers always get a schema-valid response body — same input always produces the same output.

The flagship example is now [`examples/agent-harness.airlock.yaml`](./examples/agent-harness.airlock.yaml): a Claude-Code-style coding agent published as an Airlock contract.

## End-to-end demo

```sh
git clone <this-repo> && cd AirlockAI
npm install
npm run build

# 1. Validate the contract (fail fast on schema or lint issues)
node dist/cli.js validate examples/agent-harness.airlock.yaml

# 2. Run the local sandbox agent
node dist/cli.js sandbox examples/agent-harness.airlock.yaml --port 8080
#   → http://127.0.0.1:8080
#   → POST /skills/<skill_id>
#   → POST /preflight/<skill_id>
#   → POST /tools/<tool_id>            (v0.3 — simulate a tool invocation)
#   → POST /preflight-tool/<tool_id>   (v0.3 — tool-call verdict only)
#   → GET  /.well-known/airlock.yaml
```

From a second terminal — talk to the local agent the way a consuming agent would:

```sh
# A skill call that fires a deterministic rule → PROMISE verdict, replayed example body
curl -i -X POST http://127.0.0.1:8080/skills/analyze_code \
  -H 'content-type: application/json' \
  -d '{"path":"src/expr/index.ts"}'
# HTTP 200
# X-Airlock-Detail-Source: example
# { "code":"ACCEPTED_BY_RULE", "binding":"PROMISE", "ref":"analyze-within-workspace",
#   "action":"UNILATERAL_COMMIT",
#   "detail":{ "path":"src/expr/index.ts", "summary":"...", "risks":[], "line_count":65 } }

# A skill call with no matching example → ESTIMATE verdict, schema-derived body (deterministic)
curl -i -X POST http://127.0.0.1:8080/skills/run_command \
  -H 'content-type: application/json' \
  -d '{"command":"echo hi"}'
# HTTP 202
# X-Airlock-Detail-Source: synthesized
# { "code":"DEPENDS_ON_STATE", "binding":"ESTIMATE", ..., "detail":{ "exit_code":..., "stdout":"sample-..." } }

# A tool-call pre-flight that hits a deterministic refusal → PROMISE
curl -i -X POST http://127.0.0.1:8080/preflight-tool/bash \
  -H 'content-type: application/json' \
  -d '{"command":"rm -rf /tmp/foo"}'
# HTTP 400
# { "code":"REFUSED_BY_POLICY", "binding":"PROMISE", "ref":"bash-refuse-rm-rf" }
```

Build the static bundle for GitHub Pages:

```sh
node dist/cli.js build examples/agent-harness.airlock.yaml --out ./dist-pages
ls dist-pages
#   .well-known/airlock.yaml          ← machine spec
#   .well-known/airlock/index.html    ← rendered human docs (sections for tools/hooks/permissions/guardrails)
#   .well-known/airlock/llms.txt      ← LLM-friendly bundle
#   index.html                        ← landing page
#   .nojekyll                         ← so GitHub serves .well-known/
```

Confirm the sandbox is conformant with the contract:

```sh
node dist/cli.js check examples/agent-harness.airlock.yaml --url http://127.0.0.1:8080
# Total: 2   Passed: 2   Failed: 0   Skipped: 0   OK
```

A green `check` is the "contract is honest right now" attestation. Conformance only asserts binding blocks; informational blocks (harness, mcp_servers, secrets, delegates_to) are not audited per ADR 0004.

## Publishing to GitHub Pages

`.github/workflows/pages.yml` is wired up. On push to `main`, it runs `npm test`, builds the static bundle from `examples/agent-harness.airlock.yaml`, and deploys to GitHub Pages.

1. Settings → Pages → Source: **GitHub Actions**
2. Push to `main` (or trigger the workflow manually)
3. Visit `https://<user>.github.io/<repo>/` for the landing page
4. Visit `https://<user>.github.io/<repo>/.well-known/airlock.yaml` for the machine spec

Random agents can be pointed at that URL — they fetch `llms.txt` to understand the contract and hit your sandbox (or your real backend) to make calls.

## CLI surface (v1)

```
airlock validate <contract>                                # JSON Schema + semantic lint
airlock preflight <contract> --skill <id> --input <json>   # skill-call verdict, no side effect
airlock sandbox <contract> --port 8080                     # local HTTP agent (skills + tools)
airlock check <contract> --url <live-agent-url>            # conformance
airlock build <contract> --out ./dist                      # static bundle for GitHub Pages
```

## Documentation

- [`CONTEXT.md`](./CONTEXT.md) — canonical glossary (with v0.3 terms: harness, tool, hook, permission, guardrail, MCP server, secret, delegation)
- [`docs/contract-schema.md`](./docs/contract-schema.md) — narrative guide to the v0.3 contract schema
- [`docs/migration-v01-to-v03.md`](./docs/migration-v01-to-v03.md) — migrating a v0.1 contract
- [`schema/airlock.schema.json`](./schema/airlock.schema.json) — JSON Schema (source of truth)
- [`docs/adr/`](./docs/adr/) — architectural decisions (0001–0005)
- [`docs/airlock-deploy-sister-project.md`](./docs/airlock-deploy-sister-project.md) — placeholder for the deploy sister project

## Development

```sh
npm install
npm run typecheck
npm test                # ~92 tests across 7 files
npm run build
```

## Build order (where we are)

1. ✅ Contract schema + validator (v0.3 — harness reframe)
2. ✅ Behavior / expression engine
3. ✅ Sandbox engine over HTTP (skills + tools + schema-derived faker)
4. ✅ Pre-flight checker (skill + tool)
5. ⬜ Codegen (typed handler stubs)
6. ✅ Renderer (HTML portal + `llms.txt` + landing page; all v0.3 sections)
7. ✅ Conformance runner
8. ⬜ Discovery + GitHub-list registry
9. ⬜ A2A adapter
10. ⬜ Fault/drift injection

## License

Apache-2.0
