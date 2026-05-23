# Airlock

A contract format and open-source tooling for agent-driven services. Airlock lets a publisher declare — in one file — what inbound agent traffic they accept, refuse, and escalate, then renders that file as a machine spec + human-readable docs + LLM-readable docs that consumers integrate against.

**v1 is Layer 1 (the schema) + Layer 2 (open-source tooling).** It is not a hosted gateway or a runtime — see [`docs/adr/0001-airlock-is-docs-not-runtime.md`](./docs/adr/0001-airlock-is-docs-not-runtime.md).

## End-to-end demo

The whole point of v1: write one contract, get a hosted docs page on GitHub Pages, run a local agent that responds per the contract, point real agents at the docs and have them integrate.

```sh
git clone <this-repo> && cd AirlockAI
npm install
npm run build

# 1. Validate the contract (fail fast on schema or lint issues)
node dist/cli.js validate examples/procurement.airlock.yaml

# 2. Run the local sandbox agent
node dist/cli.js sandbox examples/procurement.airlock.yaml --port 8080
#   → http://127.0.0.1:8080
#   → POST /skills/<skill_id>
#   → POST /preflight/<skill_id>
#   → GET  /.well-known/airlock.yaml
```

From a second terminal — talk to the local agent the way a consuming agent would:

```sh
# A request that fires a deterministic rule → PROMISE verdict
curl -X POST http://127.0.0.1:8080/skills/confirm_po \
  -H 'content-type: application/json' \
  -d '{"reference":"PO-1234","entity":"known-supplier-1","amount":100,"delivery_date_change_days":-2}'
# {
#   "code": "ACCEPTED_BY_RULE", "binding": "PROMISE",
#   "ref": "accept-small-date-changes", "action": "UNILATERAL_COMMIT",
#   "detail": { "confirmation_id": "C-9001", "confirmed_date": "2026-05-30" }
# }

# A request that lands in the judgment band → ESTIMATE verdict
curl -X POST http://127.0.0.1:8080/preflight/confirm_po \
  -H 'content-type: application/json' \
  -d '{"reference":"PO-9","entity":"known-supplier-1","amount":100,"delivery_date_change_days":14}'
# { "code": "HUMAN_REVIEW_LIKELY", "binding": "ESTIMATE", ... }

# A request that hits an instant_failure
curl -X POST http://127.0.0.1:8080/skills/confirm_po \
  -H 'content-type: application/json' \
  -d '{"reference":"PO-X","entity":"random-vendor","amount":10}'
# { "code": "OUT_OF_SCOPE", "binding": "PROMISE", "ref": "unknown-entity", ... }
```

Build the static bundle for GitHub Pages:

```sh
node dist/cli.js build examples/procurement.airlock.yaml --out ./dist-pages
ls dist-pages
#   .well-known/airlock.yaml          ← machine spec
#   .well-known/airlock/index.html    ← rendered human docs (with an interactive "try it" form)
#   .well-known/airlock/llms.txt      ← LLM-friendly bundle
#   index.html                        ← landing page
#   .nojekyll                         ← so GitHub serves .well-known/
```

Open `./dist-pages/index.html` in your browser; you'll see the contract rendered. The interactive form on each skill talks back to your local sandbox.

Confirm the sandbox is conformant with the contract:

```sh
node dist/cli.js check examples/procurement.airlock.yaml --url http://127.0.0.1:8080
#   ✓  confirm_po/happy-path-small-date-change  expected=ACCEPTED_BY_RULE
#   ✓  confirm_po/out-of-scope-entity           expected=OUT_OF_SCOPE
#   Total: 2   Passed: 2   Failed: 0   Skipped: 0   OK
```

A green `check` is the "contract is honest right now" attestation.

## Publishing to GitHub Pages

`.github/workflows/pages.yml` is wired up. On push to `main`, it runs `npm test`, builds the static bundle from `examples/procurement.airlock.yaml`, and deploys to GitHub Pages. To publish a different contract, trigger the workflow manually with the `contract` input set to your file.

Steps in your fork:

1. Settings → Pages → Source: **GitHub Actions**
2. Push to `main` (or trigger the workflow manually)
3. Visit `https://<user>.github.io/<repo>/` for the landing page
4. Visit `https://<user>.github.io/<repo>/.well-known/airlock.yaml` for the machine spec

Random agents can be pointed at that URL — they fetch `llms.txt` to understand the contract and hit your local sandbox (or your real backend, once you write one) to make calls.

## CLI surface (v1)

```
airlock validate <contract>                                # JSON Schema + semantic lint
airlock preflight <contract> --skill <id> --input <json>   # verdict only, no side effect
airlock sandbox <contract> --port 8080                     # local HTTP agent
airlock check <contract> --url <live-agent-url>            # conformance
airlock build <contract> --out ./dist                      # static bundle for GitHub Pages
```

## Documentation

- [`CONTEXT.md`](./CONTEXT.md) — canonical glossary
- [`prompt.md`](./prompt.md) — original technical design (annotated with pointers to refinements)
- [`docs/contract-schema.md`](./docs/contract-schema.md) — narrative guide to the contract schema
- [`schema/airlock.schema.json`](./schema/airlock.schema.json) — JSON Schema (source of truth for the format)
- [`docs/adr/`](./docs/adr/) — architectural decisions
- [`docs/airlock-deploy-sister-project.md`](./docs/airlock-deploy-sister-project.md) — placeholder for the deploy sister project

## Development

```sh
npm install
npm run typecheck
npm test                # ~60 tests across 6 files
npm run build
```

## Build order (where we are)

1. ✅ Contract schema + validator
2. ✅ Behavior / expression engine
3. ✅ Sandbox engine over HTTP
4. ✅ Pre-flight checker
5. ⬜ Codegen (typed handler stubs)
6. ✅ Renderer (HTML portal + `llms.txt` + landing page)
7. ✅ Conformance runner
8. ⬜ Discovery + GitHub-list registry
9. ⬜ A2A adapter
10. ⬜ Fault/drift injection

What's missing for "full v1": codegen (so publishers can wire real backends to the sandbox's authority rules), the GitHub-list registry (a JSON index publishers PR themselves into), an A2A adapter (HTTP-over-A2A protocol), and adversarial fault injection. None of these block the demo loop — the demo loop is already live.

## License

Apache-2.0
