# Airlock Contract Schema

The canonical JSON Schema lives at [`schema/airlock.schema.json`](../schema/airlock.schema.json). This document is the narrative companion — it explains the shape, the invariants, and the rationale. Where the two disagree, the JSON Schema wins.

For the underlying terminology and decisions, read these first:

- [`CONTEXT.md`](../CONTEXT.md) — canonical glossary
- [`docs/adr/0001-airlock-is-docs-not-runtime.md`](./adr/0001-airlock-is-docs-not-runtime.md) — why v1 is Layer 1+2 only
- [`docs/adr/0002-trustworthy-in-between-via-binding-codes.md`](./adr/0002-trustworthy-in-between-via-binding-codes.md) — PROMISE/ESTIMATE binding model
- [`docs/adr/0003-publish-a-file-deployment-model.md`](./adr/0003-publish-a-file-deployment-model.md) — contracts are static files at well-known URLs

## Top-level shape

```yaml
airlock: "0.1"          # spec version
agent: { ... }          # identity
schemas: { ... }        # reusable type defs (optional)
skills: [ ... ]         # at least one — the whole point of the contract
authority: [ ... ]      # rules — what happens when (optional)
instant_failures: [ ... ]  # reject-on-sight (optional)
actions: { ... }        # catalog of foreign actions this agent may take (optional)
sla: { ... }            # per-skill response-time commitments (optional)
lifecycle: { ... }      # states this agent uses (optional)
deprecation: { ... }    # set when this contract version is being phased out
```

YAML is the authoring format; JSON is the canonical machine form. The two are isomorphic — pick the one that fits your tooling.

## `agent`

```yaml
agent:
  name: acme-supplier-agent       # kebab-case, stable
  version: 2.3.0                  # SemVer
  description: |
    Handles PO confirmations, delivery date changes, and cancellations
    for inbound orders from enterprise customers.
  channels: [http]                # v1: http only
  homepage: https://acme.example.com/agents/supplier
  contact:
    name: Acme Supplier Ops
    email: agents@acme.example.com
```

The `name` is the identifier consumers see. The `version` follows SemVer; major bumps require a `deprecation` block on the prior major contract URL. `channels` is the list of adapters this contract is served over — v1 only ships HTTP, but the schema accepts `a2a`, `email`, `edi` for forward compatibility.

## `schemas` and `skills`

```yaml
schemas:
  PurchaseOrder:
    type: object
    required: [reference, entity, amount, delivery_date]
    properties:
      reference: { type: string, pattern: "^PO-[0-9]+$" }
      entity:    { type: string }
      amount:    { type: number, minimum: 0 }
      delivery_date: { type: string, format: date }

skills:
  - id: confirm_po
    description: Confirm a purchase order, with optional date or quantity adjustment.
    input:
      $ref: "#/schemas/PurchaseOrder"
    output:
      type: object
      properties:
        confirmation_id: { type: string }
        confirmed_date:  { type: string, format: date }
    examples:
      - name: happy-path
        in:  { reference: "PO-1234", entity: "known-supplier", amount: 100, delivery_date: "2026-06-01" }
        out: { confirmation_id: "C-9001", confirmed_date: "2026-06-01" }
        expected_verdict:
          code: ACCEPTED_BY_RULE
          binding: PROMISE
          ref: accept-small-date-changes
```

`schemas` is a bag of reusable JSON Schema types referenced by `$ref` from skills. The type system is plain JSON Schema 2020-12 — no Airlock-specific extensions.

Each skill has `id`, `input`, `output`, and zero or more `examples`. The examples are load-bearing — the renderer shows them, the sandbox uses them to generate synthetic responses, and the conformance runner asserts the `expected_verdict` matches the real agent for PROMISE codes.

## `authority` rules

Every authority rule self-classifies as `deterministic` or `judgment`. This classification controls which codes the rule may produce — PROMISE codes for deterministic rules, ESTIMATE codes for judgment rules.

```yaml
authority:
  - id: accept-small-date-changes
    skill: confirm_po
    field: delivery_date_change_days
    binding_class: deterministic           # → PROMISE codes only
    when: "abs(input.delivery_date_change_days) <= 3"
    then: { code: ACCEPTED_BY_RULE, action: UNILATERAL_COMMIT }

  - id: review-large-date-changes
    skill: confirm_po
    field: delivery_date_change_days
    binding_class: judgment                # → ESTIMATE codes only
    when: "abs(input.delivery_date_change_days) > 3"
    then: { code: HUMAN_REVIEW_LIKELY, action: ESCALATED_TO_HUMAN }
```

Express the "auto-accept band + escalation" pattern by **splitting it into two rules** — one deterministic for the safe range, one judgment for the rest. Authority rules are evaluated in declaration order; the first matching `when` produces the verdict. This separation keeps each rule honest about its binding.

The validator enforces these invariants on authority rules:

1. **`then.code` and `else.code` must match the rule's `binding_class`.** A deterministic rule producing an ESTIMATE code (or vice versa) fails the lint with rule `binding-class-vs-code`.
2. **`skill` must reference a declared skill id.** Cross-references are checked in pass 2 (lint rule `skill-ref`).
3. **Deterministic rules may not reference runtime state** *(deferred to step 2 — once the expression parser lands, the lint will reject expressions that reference anything outside the input)*.

The expression language is intentionally tiny — see [§ Expression language](#expression-language) below.

## `instant_failures`

Reject-on-sight conditions. By construction they produce PROMISE codes, and the schema constrains the allowed codes to Phase 1 and Phase 2 (identification + input validation).

```yaml
instant_failures:
  - id: unknown-entity
    when: "input.entity != 'known-supplier-1' and input.entity != 'known-supplier-2'"
    code: OUT_OF_SCOPE
    message: "We don't recognize that entity."
  - id: missing-reference
    when: "input.reference == null"
    code: MISSING_INPUT
    skill: confirm_po
```

Instant failures evaluate before any authority rule. They short-circuit the rest of the pipeline.

## `actions`

The catalog of action codes (Phase 6) this agent may take in real responses. Declaring an action here promises the consumer it's a possible outcome.

```yaml
actions:
  exposes:
    - UNILATERAL_COMMIT
    - COUNTER_OFFER
    - PARTIAL_FULFILLMENT
    - ESCALATED_TO_HUMAN
```

## `sla`

Per-skill response-time commitments. The "respond_within" is measured from pre-flight verdict to terminal lifecycle state (`COMPLETED` / `FAILED` / `CANCELED` / `ESCALATED`).

```yaml
sla:
  confirm_po:
    respond_within: "5m"
    on_breach: ESCALATED_TO_HUMAN
```

## `lifecycle`

Optional declaration of which Phase 5 states this agent uses. Useful for consumers planning poll/webhook handling for A2O long-running flows. If absent, consumers should assume any Phase 5 state is possible.

```yaml
lifecycle:
  states: [SUBMITTED, WORKING, COMPLETED, FAILED, ESCALATED]
```

## `deprecation`

Set when this contract version is being phased out. Pre-flight against a deprecated contract returns `OUT_OF_SCOPE` with the redirect in `detail`.

```yaml
deprecation:
  replaced_by_url: "https://acme.example.com/.well-known/airlock.yaml"   # the v3 contract
  sunset: "2026-12-31"
  reason: "Migrated to v3 with revised authority rules."
```

## Expression language

Used in `authority[].when` and `instant_failures[].when`. Intentionally tiny — the contract is a document, not code.

**Allowed:**

- Comparisons: `==`, `!=`, `<`, `<=`, `>`, `>=`
- Arithmetic: `+`, `-`, `*`, `/`, `%`
- Logical: `and`, `or`, `not`
- Field references: `input.<path>`, dot-notation
- Helpers: `abs(x)`, `min(a, b)`, `max(a, b)`, `len(x)`, `days(duration)`, `percent(ratio)`, `matches(string, regex)`
- Literal values: numbers, strings, booleans, `null`

**Forbidden:**

- Loops, function definitions, lambda
- String concatenation that could be used for injection
- Network or I/O calls
- Anything Turing-complete
- Any reference to state outside the input (this is what the `binding_class` lint enforces for deterministic rules)

The validator rejects any expression that parses to a construct outside this whitelist.

## Status code summary

The full taxonomy is documented in [`CONTEXT.md`](../CONTEXT.md) and [`docs/adr/0002`](./adr/0002-trustworthy-in-between-via-binding-codes.md). For schema reference:

| Phase | Codes | Where they appear in the contract |
|---|---|---|
| 1. Identification (PROMISE) | `OUT_OF_SCOPE`, `WRONG_AGENT`, `UNAUTHENTICATED`, `UNAUTHORIZED` | `instant_failures[].code` |
| 2. Input validation (PROMISE) | `SCHEMA_INVALID`, `MISSING_INPUT`, `MALFORMED_INPUT` | `instant_failures[].code` |
| 3. Deterministic rules (PROMISE) | `ACCEPTED_BY_RULE`, `REFUSED_BY_POLICY`, `RATE_LIMITED` | `authority[].then.code` / `else.code` (when `binding_class: deterministic`) |
| 4. Soft outcomes (ESTIMATE) | `ACCEPTED_LIKELY`, `COUNTER_OFFER_LIKELY`, `HUMAN_REVIEW_LIKELY`, `DEPENDS_ON_STATE` | `authority[].then.code` / `else.code` (when `binding_class: judgment`) |
| 5. Lifecycle (real responses) | `SUBMITTED`, `WORKING`, `INPUT_REQUIRED`, `COMPLETED`, `FAILED`, `CANCELED`, `ESCALATED` | `lifecycle.states` |
| 6. Actions taken (real responses) | `UNILATERAL_COMMIT`, `COUNTER_OFFER`, `PARTIAL_FULFILLMENT`, `ESCALATED_TO_HUMAN` | `actions.exposes`, `authority[].then.action` |

## Minimal valid contract

The smallest legal Airlock contract:

```yaml
airlock: "0.1"
agent:
  name: hello-agent
  version: 0.1.0
skills:
  - id: ping
    input:  { type: object }
    output: { type: object, properties: { pong: { type: boolean } } }
```

No authority rules, no instant failures — just a skill with input and output. Useful as the `airlock init` starter and as the smoke test for the validator.

## Validator semantics (preview — step 1 of build order)

The validator runs two passes:

1. **Structural** — JSON Schema validation against `schema/airlock.schema.json`. Catches missing required fields, type errors, illegal codes.
2. **Semantic lint** — additional checks that JSON Schema can't express:
   - Every `authority[].skill` and `instant_failures[].skill` references an existing skill `id`.
   - Every `then.code` / `else.code` matches its rule's `binding_class` (deterministic → PROMISE-only codes; judgment → ESTIMATE-only codes).
   - Every `when` expression parses successfully against the input's JSON Schema (every field reference resolves).
   - Every `when` expression in a deterministic rule references only the input (no runtime state).
   - Every example's `expected_verdict.code` is producible by some rule, or is a phase 1/2 instant-failure code, or is implied by the schema.
   - If `deprecation` is set, the contract is otherwise valid (a sunset contract still has to be a valid contract).

A passing validation is the first "this is a real Airlock contract" signal. Conformance against a real agent comes later.
