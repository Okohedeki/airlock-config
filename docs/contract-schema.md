# Airlock Config Contract Schema (v0.5)

The canonical JSON Schema lives at [`schema/airlock-config.schema.json`](../schema/airlock-config.schema.json). This document is the narrative companion. Where the two disagree, the JSON Schema wins.

For terminology and decisions, read these first:

- [`CONTEXT.md`](../CONTEXT.md) — canonical glossary
- [`docs/taxonomies.md`](./taxonomies.md) — the closed vocabularies the schema enforces
- [`docs/adr/0001`](./adr/0001-airlock-is-docs-not-runtime.md) — Layer 1+2 only, never a runtime gateway
- [`docs/adr/0002`](./adr/0002-trustworthy-in-between-via-binding-codes.md) — PROMISE/ESTIMATE binding model
- [`docs/adr/0003`](./adr/0003-publish-a-file-deployment-model.md) — static files at well-known URLs
- [`docs/adr/0004`](./adr/0004-harness-fields-are-informational.md) — binding vs informational categories
- [`docs/adr/0005`](./adr/0005-sandbox-falls-back-to-schema-derived-responses.md) — the schema-derived faker
- [`docs/adr/0006`](./adr/0006-b2b-indexable-capability-format.md) — the v0.4 reframe
- [`docs/adr/0008`](./adr/0008-rename-to-airlock-config.md) — the v0.5 rename to `airlock-config`

## What a contract is

An Airlock Config contract is a B2B disclosure document. A self-deployed business agent publishes it so other businesses' AI agents can discover and integrate without prior coordination. The contract answers a buyer's five questions:

1. **What does it do?** — `skills`, `authority`, `instant_failures`, `actions`, `sla`, `lifecycle`.
2. **How is it categorised?** — `category` (industry + capability), `tags`.
3. **Where does it operate?** — `region` (data residency + served regions).
4. **What rules does it operate under?** — `compliance`, `guardrails`, `permissions`.
5. **How do I engage?** — `auth_model`, `pricing`.

Every binding field uses a closed vocabulary from `docs/taxonomies.md`. The registry indexes the closed-vocabulary fields directly; consumers pre-filter on them.

## Top-level shape

```yaml
airlock_config: "0.5"   # spec version (v0.1/v0.2/v0.3/v0.4 rejected)
agent: { ... }          # identity
category: { ... }       # BINDING — required
region: { ... }         # BINDING
compliance: [ ... ]     # BINDING
auth_model: { ... }     # BINDING
pricing: { ... }        # BINDING (model + unit); price_url is informational
permissions: { ... }    # BINDING — data-access disclosure
guardrails: { ... }     # BINDING — categorical refusals
tags: [ ... ]           # BINDING — open vocabulary indexing hints
schemas: { ... }        # reusable type defs (optional)
skills: [ ... ]         # BINDING — at least one required
authority: [ ... ]      # BINDING — rules with summary + keywords
instant_failures: [ ... ]  # BINDING — reject on sight
actions: { ... }        # BINDING — action catalog
sla: { ... }            # BINDING — per-skill response times
lifecycle: { ... }      # BINDING — states this agent uses
deprecation: { ... }    # BINDING — set when version is being phased out
```

Only `airlock_config`, `agent`, `category`, and `skills` are required.

## `a2a` (INFORMATIONAL)

Optional bridge hints for the derived A2A v1.0 Agent Card ([ADR 0007](./adr/0007-compose-with-a2a-do-not-reinvent-wire.md), [docs/a2a-bridge.md](./a2a-bridge.md)). Every field is optional; defaults derive from existing Airlock Config fields. The contract is the source of truth; `airlock-config build-site` derives `agent-card.json` next to `airlock-config.yaml`.

```yaml
a2a:
  endpoint_url: https://example.com/agents/acme-supplier/a2a
  documentation_url: https://example.com/agents/acme-supplier
  capabilities:
    streaming: false                   # SendStreamingMessage support (deferred)
    push_notifications: false          # webhook callbacks (deferred)
    state_transition_history: false
  default_input_modes: [application/json]
  default_output_modes: [application/json]
```

Per ADR 0004 this block is informational: changes never require a major version bump.

## `agent`

```yaml
agent:
  name: acme-supplier-agent       # kebab-case, stable
  version: 1.0.0                  # SemVer
  description: |                  # the most important free-text field for indexing relevance
    Confirms purchase orders ...
  channels: [http]
  homepage: https://example.com/agents/acme-supplier
  contact:
    name: Acme Supplies Partner Ops
    email: partner-ops@example.com
    url: https://example.com/support
```

## `category` (BINDING, required)

```yaml
category:
  industry: procurement
  capability: transaction_processing
  subcategory: po-confirmation-and-fulfillment   # optional free-form refinement
```

`industry` and `capability` are required and use closed vocabularies (see [`docs/taxonomies.md`](./taxonomies.md)). `subcategory` is free-form.

## `region` (BINDING)

```yaml
region:
  data_residency: [us-east, eu-west]
  serves_regions: [us-east, us-west, ca, eu-west, eu-central, uk]
```

`data_residency` is where the agent's own data lives. `serves_regions` is which regions consumers may successfully transact from. Both use the closed `RegionCode` vocabulary.

## `compliance` (BINDING)

```yaml
compliance:
  - standard: SOC2_TYPE_2
    status: certified
    attestation_url: https://example.com/trust/soc2-2026.pdf
    verified_at: "2026-02-14"
  - standard: GDPR
    status: self_attested
```

`status` is one of `certified` / `self_attested` / `in_progress`. Buyers weight `certified` claims (verifiable via `attestation_url`) more than self-attested ones.

## `auth_model` (BINDING)

```yaml
auth_model:
  methods: [oauth2_client_credentials, mtls]
  enrollment: enterprise_only
  support_url: https://example.com/agents/acme-supplier/enrol
```

`methods` and `enrollment` use closed vocabularies. `enrollment` posture matters: an `open` agent can be integrated against in minutes; an `enterprise_only` agent requires a sales conversation.

## `pricing` (BINDING for model + unit; INFORMATIONAL for price_url)

```yaml
pricing:
  model: enterprise          # free | metered | subscription | enterprise | usage_tiered
  unit: per_call             # optional
  currency: USD              # optional, ISO 4217
  price_url: https://example.com/pricing   # canonical commercial-terms link
  free_tier:                 # optional
    description: 100 calls/month for evaluation accounts
    limits: 100/month
```

`model` and `unit` are binding because buyers pre-filter on the *shape* of the pricing model. Actual numbers live behind `price_url` — they change too fast to live in the schema, and pinning them would force minor version churn.

## `permissions` (BINDING) — data-access disclosure

```yaml
permissions:
  pii: minimal               # none | minimal | moderate | extensive
  data_classes: [business_confidential, financial]
  retention: 7y              # 0s | <n><s|m|h|d|y> | indefinite
  third_party_sharing: subprocessors_only   # none | subprocessors_only | broad
```

This is what a buyer's risk-management process actually wants to know: *what data does this agent see and what happens to it?* The closed vocabularies live in [`docs/taxonomies.md`](./taxonomies.md).

> v0.3 used `permissions` to declare a developer-facing allow/disallow grammar (`fs.read:./src/**`, `tool:bash:rm *`). That format is gone — it was the wrong audience.

## `guardrails` (BINDING)

```yaml
guardrails:
  refused_topics: [financial_advice, investment_recommendation]
  refused_actions: [transfer_funds_to_new_payee, share_pii_outside_jurisdiction]
  required_authentication: true
```

Free-form strings, but the lint warns on values outside the recommended vocabulary. Use the curated terms so registry searches across publishers work — "find me agents that refuse `transfer_funds_to_new_payee`" only works if publishers agree on the spelling.

## `tags` (BINDING, open vocabulary)

```yaml
tags: [purchase-order, po-confirmation, cold-chain-capable]
```

Free-form keywords. Indexed by the registry alongside the curated `category` block. Use for finer-grained discovery (a sub-region code, an industry niche, a positioning term).

## `schemas` and `skills` (BINDING)

```yaml
schemas:
  PurchaseOrder:
    type: object
    required: [reference, entity, amount]
    properties:
      reference: { type: string, pattern: "^PO-[0-9]+$" }
      entity:    { type: string }
      amount:    { type: number, minimum: 0 }

skills:
  - id: confirm_po
    description: Confirm a purchase order, with optional date or quantity adjustment.
    input:  { $ref: "#/schemas/PurchaseOrder" }
    output:
      type: object
      properties:
        confirmation_id: { type: string }
        confirmed_date:  { type: string, format: date }
    examples:
      - name: happy-path
        in: { reference: "PO-1234", entity: "known-supplier-1", amount: 100, delivery_date_change_days: -2 }
        out: { confirmation_id: "C-9001", confirmed_date: "2026-05-30" }
        expected_verdict:
          code: ACCEPTED_BY_RULE
          binding: PROMISE
          ref: accept-small-date-changes
```

Each skill has `id`, `input`, `output`, and optional `examples`. Examples are load-bearing: renderer shows them, sandbox replays them, conformance asserts the expected verdict. When no example matches a verdict, the sandbox falls back to a deterministic schema-derived faker (ADR 0005).

## `authority` rules (BINDING) with `summary` + `keywords`

```yaml
authority:
  - id: accept-small-date-changes
    summary: Auto-accept delivery date adjustments within ±3 days.
    keywords: [purchase_order, auto_accept, delivery_date, small_change]
    skill: confirm_po
    field: delivery_date_change_days
    binding_class: deterministic            # → PROMISE codes
    when: "abs(input.delivery_date_change_days) <= 3"
    then: { code: ACCEPTED_BY_RULE, action: UNILATERAL_COMMIT }

  - id: review-large-date-changes
    summary: Route large delivery date adjustments (>±3 days) to a human reviewer.
    keywords: [purchase_order, human_review, delivery_date, large_change]
    skill: confirm_po
    binding_class: judgment                 # → ESTIMATE codes
    when: "abs(input.delivery_date_change_days) > 3"
    then: { code: HUMAN_REVIEW_LIKELY, action: ESCALATED_TO_HUMAN }
```

`summary` is a one-line description of what the rule does *in business terms*. `keywords` are indexing terms a registry uses to surface rules across publishers ("show me agents that auto-accept POs under a threshold"). Both are optional but the lint warns when absent — un-summarised rules are invisible to substance-search.

Each rule targets a `skill` (required) and self-classifies as `deterministic` (→ PROMISE) or `judgment` (→ ESTIMATE). Rules evaluate in declaration order; the first matching `when` produces the verdict.

The validator enforces:

1. **`then.code` and `else.code` match the rule's `binding_class`.** Deterministic + ESTIMATE code → lint error `binding-class-vs-code`.
2. **`skill` references a declared skill id.** Lint error `skill-ref`.
3. **Deterministic rules reference only `input.*`** — no runtime state. Lint error `when-runtime-state`.

## `instant_failures` (BINDING)

Reject-on-sight conditions. Always PROMISE; codes constrained to Phase 1 + Phase 2.

```yaml
instant_failures:
  - id: unknown-entity
    summary: Refuse purchase orders from entities not on our partner roster.
    keywords: [purchase_order, allowlist, unknown_buyer]
    when: "input.entity != 'known-supplier-1' and input.entity != 'known-supplier-2'"
    code: OUT_OF_SCOPE
    message: We don't recognise that entity.
```

Instant failures evaluate before any authority rule.

## `actions`, `sla`, `lifecycle`, `deprecation`

```yaml
actions:
  exposes: [UNILATERAL_COMMIT, COUNTER_OFFER, PARTIAL_FULFILLMENT, ESCALATED_TO_HUMAN]

sla:
  confirm_po:       { respond_within: "5m",  on_breach: ESCALATED_TO_HUMAN }
  query_inventory:  { respond_within: "30s", on_breach: FAILED }

lifecycle:
  states: [SUBMITTED, WORKING, COMPLETED, FAILED, ESCALATED]

deprecation:
  replaced_by_url: https://example.com/.well-known/airlock-config.yaml
  sunset: "2026-12-31"
  reason: Migrated to v2 with revised authority rules.
```

`sla` keys are skill ids only (the v0.3 `tool:<id>` form is gone).

## Expression language

Used in `authority[].when` and `instant_failures[].when`. Intentionally tiny — the contract is a document, not code.

**Allowed:** comparisons (`==`, `!=`, `<`, `<=`, `>`, `>=`), arithmetic (`+`, `-`, `*`, `/`, `%`), logical (`and`, `or`, `not`), field references (`input.<path>`), helpers (`abs`, `min`, `max`, `len`, `matches`), literals (numbers, strings, booleans, `null`).

**Forbidden:** loops, function definitions, I/O calls, anything Turing-complete.

`matches()` uses JavaScript `RegExp` — use `\s+`, not POSIX `[[:space:]]`. In YAML, single-quoted outer + double-quoted inner avoids escape ambiguity: `'matches(input.command, "rm\\s+-rf")'`.

## Sandbox response semantics

`POST /skills/<id>` returns the verdict envelope plus a `detail` body via one of two paths:

1. **Example replay** — `X-Airlock-Config-Detail-Source: example`. First authored example whose `expected_verdict.code` matches the verdict.
2. **Schema-derived faker** — `X-Airlock-Config-Detail-Source: synthesized`. Walks the output JSON Schema seeded by a hash of the input, echoes same-named input fields. Same input → same body. ADR 0005.

`POST /preflight/<id>` skips synthesis and returns the verdict only.

## Status code summary

| Phase | Codes | Where they appear |
|---|---|---|
| 1. Identification (PROMISE) | `OUT_OF_SCOPE`, `WRONG_AGENT`, `UNAUTHENTICATED`, `UNAUTHORIZED` | `instant_failures[].code` |
| 2. Input validation (PROMISE) | `SCHEMA_INVALID`, `MISSING_INPUT`, `MALFORMED_INPUT` | `instant_failures[].code` |
| 3. Deterministic rules (PROMISE) | `ACCEPTED_BY_RULE`, `REFUSED_BY_POLICY`, `RATE_LIMITED` | `authority[].then.code` (binding_class: deterministic) |
| 4. Soft outcomes (ESTIMATE) | `ACCEPTED_LIKELY`, `COUNTER_OFFER_LIKELY`, `HUMAN_REVIEW_LIKELY`, `DEPENDS_ON_STATE` | `authority[].then.code` (binding_class: judgment) |
| 5. Lifecycle (real responses) | `SUBMITTED`, `WORKING`, `INPUT_REQUIRED`, `COMPLETED`, `FAILED`, `CANCELED`, `ESCALATED` | `lifecycle.states` |
| 6. Actions taken (real responses) | `UNILATERAL_COMMIT`, `COUNTER_OFFER`, `PARTIAL_FULFILLMENT`, `ESCALATED_TO_HUMAN` | `actions.exposes`, `authority[].then.action` |

## Minimal valid contract

```yaml
airlock_config: "0.5"
agent:
  name: hello-agent
  version: 0.1.0
category:
  industry: other
  capability: other
skills:
  - id: ping
    input:  { type: object }
    output: { type: object, properties: { pong: { type: boolean } } }
```

## Validator semantics

Three passes:

1. **Version gate** — `airlock: "0.1"`/`"0.2"`/`"0.3"` rejected with pointer to [docs/migration-v03-to-v04.md](./migration-v03-to-v04.md). The legacy `airlock:` top-level key (used by v0.4) is also rejected with a pointer to [docs/migration-v04-to-v05.md](./migration-v04-to-v05.md).
2. **Structural** — JSON Schema. Catches missing required fields, type errors, illegal codes, unknown enum values in closed vocabularies.
3. **Semantic lint** — additional checks:
   - Skill refs in `authority`, `instant_failures`, `sla` keys resolve.
   - Rule `binding_class` matches outcome `code` phase.
   - `actions[].action` referenced by rules is declared in `actions.exposes`.
   - Deterministic `when` expressions reference only `input.*`.
   - Example `binding` matches example `code` phase.
   - Guardrails terms warned against the recommended vocabulary.
   - Rules and instant_failures without `summary` warned (indexability).

Passing validation is the first "this is a real Airlock Config contract" signal. Conformance against a real endpoint comes later and asserts binding blocks only.
