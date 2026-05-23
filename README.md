# Airlock

The contract format for **self-deployed business agents** to be discoverable and integrable without prior coordination.

A business publishes one file describing what their agent does, who it serves, and on what terms. Other businesses' AI agents fetch that file, pre-filter on category / region / compliance / pricing, and integrate.

**v1 is Layer 1 (the schema) + Layer 2 (open-source tooling).** It is not a hosted gateway or a runtime — see [`docs/adr/0001`](./docs/adr/0001-airlock-is-docs-not-runtime.md). v0.4 anchors the schema around the buyer's RFI questions; see [`docs/adr/0006`](./docs/adr/0006-b2b-indexable-capability-format.md).

## What a contract looks like

```yaml
airlock: "0.4"

agent:
  name: acme-supplier-agent
  version: 1.0.0
  description: Confirms purchase orders, accepts cancellations, answers stock queries.

category:
  industry: procurement
  capability: transaction_processing

region:
  data_residency: [us-east, eu-west]
  serves_regions: [us-east, eu-west, uk]

compliance:
  - { standard: SOC2_TYPE_2, status: certified }
  - { standard: GDPR, status: self_attested }

auth_model:
  methods: [oauth2_client_credentials, mtls]
  enrollment: enterprise_only

pricing:
  model: enterprise
  price_url: https://example.com/pricing

permissions:
  pii: minimal
  data_classes: [business_confidential, financial]
  retention: 7y

skills:
  - id: confirm_po
    input:  { $ref: "#/schemas/PurchaseOrder" }
    output: { $ref: "#/schemas/Confirmation" }
    examples: [ ... ]

authority:
  - id: accept-small-date-changes
    summary: Auto-accept delivery date adjustments within ±3 days.
    keywords: [purchase_order, auto_accept, delivery_date]
    skill: confirm_po
    binding_class: deterministic
    when: "abs(input.delivery_date_change_days) <= 3"
    then: { code: ACCEPTED_BY_RULE, action: UNILATERAL_COMMIT }
```

A consuming business's agent reads this and knows, in one fetch: *yes this is procurement, yes it serves the EU, yes it's SOC 2 Type 2 certified, yes it auto-accepts small date changes — I can plan my integration.*

## End-to-end demo

```sh
git clone <this-repo> && cd AirlockAI
npm install
npm run build

# 1. Validate
node dist/cli.js validate examples/supplier-agent.airlock.yaml

# 2. Run the sandbox
node dist/cli.js sandbox examples/supplier-agent.airlock.yaml --port 8080
#   POST /skills/<skill_id>           — real call (synthesized response)
#   POST /preflight/<skill_id>        — verdict only, no side effect
#   GET  /.well-known/airlock.yaml    — the contract
```

From a second terminal:

```sh
# A deterministic-rule fire → PROMISE verdict, replayed authored example
curl -i -X POST http://127.0.0.1:8080/skills/confirm_po \
  -H 'content-type: application/json' \
  -d '{"reference":"PO-1234","entity":"known-supplier-1","amount":100,"delivery_date_change_days":-2}'
# HTTP 200
# X-Airlock-Detail-Source: example
# { "code":"ACCEPTED_BY_RULE", "binding":"PROMISE", "ref":"accept-small-date-changes",
#   "detail":{ "confirmation_id":"C-9001", "confirmed_date":"2026-05-30" } }

# A skill with no matching example → ESTIMATE + deterministic schema-derived body
curl -i -X POST http://127.0.0.1:8080/skills/query_inventory \
  -H 'content-type: application/json' \
  -d '{"sku":"SKU-42"}'
# HTTP 200
# X-Airlock-Detail-Source: synthesized
# { "code":"ACCEPTED_LIKELY", "binding":"ESTIMATE",
#   "detail":{ "sku":"SKU-42", "on_hand":..., "reserved":..., "warehouse":"..." } }
```

`X-Airlock-Detail-Source: synthesized` means the publisher hadn't authored an example for this verdict — the sandbox walked the output JSON Schema deterministically (see [ADR 0005](./docs/adr/0005-sandbox-falls-back-to-schema-derived-responses.md)). Same input always produces the same body.

Build the static bundle for hosting:

```sh
node dist/cli.js build examples/supplier-agent.airlock.yaml --out ./dist-pages
```

Verify the sandbox is honest with the contract:

```sh
node dist/cli.js check examples/supplier-agent.airlock.yaml --url http://127.0.0.1:8080
# Total: 2  Passed: 2  Failed: 0  OK
```

Conformance asserts PROMISE codes only (per ADR 0002).

## Registry indexing

A business publishes their contract, then emits a registry entry that another business's agent can find:

```sh
node dist/cli.js register-entry --contract examples/supplier-agent.airlock.yaml \
    --url https://example.com/.well-known/airlock.yaml
# → JSON ready to PR into github.com/Okohedeki/airlock-registry
```

A consumer searches:

```sh
node dist/cli.js search --industry procurement --region eu-west --compliance SOC2_TYPE_2
# → contracts matching the filter
```

The registry is the existing v1 GitHub-list plan (single JSON file in a public repo, no accounts). v0.4 ships the entry-builder + the search command; the registry repo itself is the next milestone.

## CLI surface

```
airlock validate <contract>                                # JSON Schema + semantic lint
airlock preflight <contract> --skill <id> --input <json>   # skill-call verdict, no side effect
airlock sandbox <contract> --port 8080                     # local HTTP agent
airlock check <contract> --url <live-agent-url>            # conformance
airlock build <contract> --out ./dist                      # static bundle for a single contract
airlock register-entry --contract <path> --url <url>       # emit a registry index entry
airlock search [filters]                                   # query the registry
```

## Documentation

- [`CONTEXT.md`](./CONTEXT.md) — canonical glossary
- [`docs/contract-schema.md`](./docs/contract-schema.md) — narrative guide to the v0.4 schema
- [`docs/taxonomies.md`](./docs/taxonomies.md) — the closed vocabularies the schema enforces
- [`docs/migration-v03-to-v04.md`](./docs/migration-v03-to-v04.md) — migrating a v0.3 contract
- [`schema/airlock.schema.json`](./schema/airlock.schema.json) — JSON Schema (source of truth)
- [`docs/adr/`](./docs/adr/) — architectural decisions (0001–0006)

## Development

```sh
npm install
npm run typecheck
npm test
npm run build
```

## License

Apache-2.0
