<p align="center">
  <img src="assets/logo.svg" width="64" height="64" alt="Airlock Config logo">
</p>

<h1 align="center">Airlock Config</h1>

<p align="center">
  <a href="https://github.com/Okohedeki/airlock-config/stargazers"><img src="https://img.shields.io/github/stars/Okohedeki/airlock-config?style=flat&logo=github" alt="GitHub stars"></a>
  <a href="https://github.com/Okohedeki/airlock-config/releases"><img src="https://img.shields.io/github/v/release/Okohedeki/airlock-config?style=flat&logo=github" alt="Latest release"></a>
  <a href="https://www.npmjs.com/package/airlock-config"><img src="https://img.shields.io/npm/v/airlock-config?style=flat&logo=npm" alt="npm"></a>
  <a href="https://github.com/Okohedeki/airlock-config/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-555" alt="License: Apache-2.0"></a>
</p>

<p align="center">The config file that lets AI agents discover and integrate with your business — without prior coordination.</p>

```yaml
# airlock-config.yaml — one file. other businesses' agents fetch it.
airlock_config: "0.5"
agent:       { name: acme-supplier-agent, version: 1.0.0 }
category:    { industry: procurement, capability: transaction_processing }
region:      { data_residency: [us-east, eu-west], serves_regions: [us-east, eu-west, uk] }
compliance:  [{ standard: SOC2_TYPE_2, status: certified }]
auth_model:  { methods: [oauth2_client_credentials, mtls], enrollment: enterprise_only }
skills:      [{ id: confirm_po, input: {$ref: "#/schemas/PurchaseOrder"}, output: {$ref: "#/schemas/Confirmation"} }]
authority:
  - id: accept-small-date-changes
    summary: Auto-accept delivery date adjustments within ±3 days.
    skill: confirm_po
    binding_class: deterministic
    when: "abs(input.delivery_date_change_days) <= 3"
    then: { code: ACCEPTED_BY_RULE, action: UNILATERAL_COMMIT }
```

---

Publish one file. Other businesses' AI agents find it, pre-filter on category / region / compliance / pricing, and integrate. No onboarding call needed for the first 95% of integrations.

- **Buyer-facing schema:** Category, region, compliance, pricing, auth — the same fields a procurement officer puts on an RFI.
- **Searchable across publishers:** Closed taxonomies mean a registry can index and filter without human review.
- **Composes with A2A:** Derives an A2A v1.0 Agent Card from one source contract; both transports active in the sandbox. ([`docs/a2a-bridge.md`](./docs/a2a-bridge.md))
- **Synthesized sandbox:** Run a faithful local agent from the contract alone — deterministic schema-derived responses when no example was authored. ([ADR 0005](./docs/adr/0005-sandbox-falls-back-to-schema-derived-responses.md))
- **No runtime lock-in:** v1 is the schema + open-source toolchain. No hosted gateway, no accounts, no registry vendor. ([ADR 0001](./docs/adr/0001-airlock-is-docs-not-runtime.md))

## Getting Started

```sh
git clone https://github.com/Okohedeki/airlock-config && cd airlock-config
npm install && npm run build

# 1. Validate
node dist/cli.js validate examples/supplier-agent.airlock-config.yaml

# 2. Run the sandbox (REST + A2A on one port)
node dist/cli.js sandbox examples/supplier-agent.airlock-config.yaml --port 8080
```

From a second terminal:

```sh
# A deterministic rule fires → PROMISE verdict, replayed authored example
curl -i -X POST http://127.0.0.1:8080/skills/confirm_po \
  -H 'content-type: application/json' \
  -d '{"reference":"PO-1234","entity":"known-supplier-1","amount":100,"delivery_date_change_days":-2}'
# HTTP 200
# X-Airlock-Config-Detail-Source: example
# { "code":"ACCEPTED_BY_RULE", "binding":"PROMISE", "ref":"accept-small-date-changes",
#   "detail":{ "confirmation_id":"C-9001", "confirmed_date":"2026-05-30" } }

# A skill with no matching example → ESTIMATE + deterministic schema-derived body
curl -i -X POST http://127.0.0.1:8080/skills/query_inventory \
  -H 'content-type: application/json' \
  -d '{"sku":"SKU-42"}'
# HTTP 200
# X-Airlock-Config-Detail-Source: synthesized
# { "code":"ACCEPTED_LIKELY", "binding":"ESTIMATE",
#   "detail":{ "sku":"SKU-42", "on_hand":..., "reserved":..., "warehouse":"..." } }
```

Verify the running agent is honest with its contract:

```sh
node dist/cli.js check examples/supplier-agent.airlock-config.yaml --url http://127.0.0.1:8080
# Total: 2  Passed: 2  Failed: 0  OK
```

Conformance asserts PROMISE codes only ([ADR 0002](./docs/adr/0002-trustworthy-in-between-via-binding-codes.md)).

## CLI

```
airlock-config validate <contract>                                # JSON Schema + semantic lint
airlock-config preflight <contract> --skill <id> --input <json>   # skill-call verdict, no side effect
airlock-config sandbox <contract> --port 8080 --channel both      # local HTTP + A2A agent
airlock-config check <contract> --url <live-agent-url>            # conformance
airlock-config build <contract> --out ./dist                      # static bundle for a single contract
airlock-config build-site --out ./dist                            # product site + every example bundle
airlock-config agent-card --contract <path> --url <url>           # derive an A2A Agent Card
airlock-config register-entry --contract <path> --url <url>       # emit a registry index entry
airlock-config search [filters]                                   # query the registry
```

## How it works

Every binding field uses a closed vocabulary from [`docs/taxonomies.md`](./docs/taxonomies.md). A registry indexes the closed-vocabulary fields directly; consumers pre-filter on them.

**Skills** are the consumer-callable interactions. Each skill has an `id`, an input JSON Schema, an output JSON Schema, and optional `examples` that the sandbox replays and that conformance asserts against.

**Authority rules** declare what the agent will do unilaterally vs. refuse vs. escalate. Each rule self-classifies as `deterministic` (→ **PROMISE** verdict — the publisher is bound) or `judgment` (→ **ESTIMATE** verdict — best guess). PROMISE verdicts are the conformance surface — `airlock-config check` will publicly fail a contract that diverges from one. ESTIMATE verdicts are explicit hints; the real call may differ.

**Instant failures** reject on sight, before any work — always PROMISE.

Full schema reference: [`docs/contract-schema.md`](./docs/contract-schema.md). Domain language: [`CONTEXT.md`](./CONTEXT.md).

## A2A interop

Airlock Config composes with [A2A (Agent2Agent)](https://a2a-protocol.org/) — the open agent-to-agent protocol Google donated to the Linux Foundation, now backed by 150+ orgs. Airlock Config does **not** define its own wire protocol; A2A handles the wire (JSON-RPC 2.0 over HTTP) and the thin discovery card. Airlock Config handles the rich B2B capability surface.

```sh
# build-site emits BOTH files from one source contract:
node dist/cli.js build-site --out ./dist-pages
# → dist-pages/examples/acme-supplier-agent/.well-known/airlock-config.yaml          (the contract)
# → dist-pages/examples/acme-supplier-agent/.well-known/agent-card.json              (derived A2A v1.0 Agent Card)
```

A consumer that only speaks A2A discovers and integrates with no Airlock-Config-specific code:

```sh
curl http://127.0.0.1:8080/.well-known/agent-card.json

curl -X POST http://127.0.0.1:8080/a2a \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"SendMessage",
       "params":{"message":{"parts":[{"skill":"confirm_po",
         "data":{"reference":"PO-1234","entity":"known-supplier-1","amount":100,"delivery_date_change_days":-2}}]}}}'
```

The Airlock Config Verdict rides inside the A2A Task's `artifact.verdict` body, so an Airlock-Config-aware consumer still gets PROMISE/ESTIMATE binding semantics; an A2A-only consumer falls back to the `TaskState`.

Full mapping (auth methods, verdict→TaskState, etc.): [`docs/a2a-bridge.md`](./docs/a2a-bridge.md). Decision rationale: [ADR 0007](./docs/adr/0007-compose-with-a2a-do-not-reinvent-wire.md).

**MVP ships:** `SendMessage`, `GetTask`, `CancelTask`. Streaming, push notifications, and cryptographic Agent Card signing are deferred.

## Registry

A business publishes their contract, then emits a registry entry another business's agent can find:

```sh
node dist/cli.js register-entry --contract examples/supplier-agent.airlock-config.yaml \
    --url https://example.com/.well-known/airlock-config.yaml
# → JSON ready to PR into github.com/Okohedeki/airlock-config-registry

node dist/cli.js search --industry procurement --region eu-west --compliance SOC2_TYPE_2
# → contracts matching the filter
```

The registry is a single JSON file in a public GitHub repo. No accounts. No curation.

## Migrating from v0.4

v0.5 renames the project, the CLI, the file, the YAML key, the well-known path, the headers, and the A2A extension URI to use `airlock-config` / `airlock_config`. The schema *shape* is unchanged. One `sed` + one file rename per contract — full recipe in [`docs/migration-v04-to-v05.md`](./docs/migration-v04-to-v05.md). Rationale: [ADR 0008](./docs/adr/0008-rename-to-airlock-config.md).

## Documentation

- [`CONTEXT.md`](./CONTEXT.md) — canonical glossary
- [`docs/contract-schema.md`](./docs/contract-schema.md) — narrative guide to the v0.5 schema
- [`docs/taxonomies.md`](./docs/taxonomies.md) — the closed vocabularies the schema enforces
- [`docs/a2a-bridge.md`](./docs/a2a-bridge.md) — how Airlock Config + A2A compose, with mapping tables
- [`docs/migration-v04-to-v05.md`](./docs/migration-v04-to-v05.md) — migrating from v0.4
- [`docs/migration-v03-to-v04.md`](./docs/migration-v03-to-v04.md) — migrating from v0.3
- [`schema/airlock-config.schema.json`](./schema/airlock-config.schema.json) — JSON Schema (source of truth)
- [`docs/adr/`](./docs/adr/) — architectural decisions (0001–0008)

## Development

```sh
npm install
npm run typecheck
npm test
npm run build
```

---

<p align="center">
  <a href="https://star-history.com/#Okohedeki/airlock-config&Date">
    <img src="https://api.star-history.com/svg?repos=Okohedeki/airlock-config&type=Date" alt="Star history" width="600">
  </a>
</p>

## License

Apache-2.0
