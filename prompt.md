# Airlock — Technical Design Doc
**Companion to:** `airlock-v1-feature-spec.md`
*(working name "Airlock" — placeholder)*

This doc is **how it's built**. The feature spec is **what it does**. Read that first.

> **Note (post grill-with-docs):** This document is the original high-level design. Several decisions have since been refined and are now authoritative in:
> - **[`CONTEXT.md`](./CONTEXT.md)** — canonical glossary (Contract, Publisher, Consumer, A2A/A2O, Promise/Estimate, etc.)
> - **[`docs/adr/0001-airlock-is-docs-not-runtime.md`](./docs/adr/0001-airlock-is-docs-not-runtime.md)** — v1 = Layer 1 + Layer 2 only; no hosted gateway.
> - **[`docs/adr/0002-trustworthy-in-between-via-binding-codes.md`](./docs/adr/0002-trustworthy-in-between-via-binding-codes.md)** — per-verdict PROMISE/ESTIMATE binding model resolves §9.2.
> - **[`docs/adr/0003-publish-a-file-deployment-model.md`](./docs/adr/0003-publish-a-file-deployment-model.md)** — contracts are static files at `/.well-known/airlock.yaml`.
> - **[`docs/airlock-deploy-sister-project.md`](./docs/airlock-deploy-sister-project.md)** — deployment is spun out as a sister project; not part of Airlock.
>
> Where this document and the docs above disagree, **the ADRs win**. The §9 open questions are mostly resolved in those files.

---

## 0. The one architectural decision everything hangs on

**Airlock is a contract *format* + tooling, NOT a wire protocol.**

- We do **not** invent how agents talk. They keep using A2A / MCP / email / EDI.
- We standardize a **declaration file** that describes what an agent will accept, refuse, and escalate — and ship the open-source tooling that reads it.
- Mental model: **OpenAPI, but for agent interactions.** OpenAPI didn't invent HTTP; it standardized a YAML file describing an HTTP API, and an ecosystem (mock servers, validators, codegen) grew on that one file. Same play.

If a feature requires both companies to adopt a new transport → cut it. If it works as "a file + a tool that reads the file" → keep it.

---

## 1. Three layers (only layer 1 must be a standard)

```
┌──────────────────────────────────────────────┐
│ LAYER 1 — THE CONTRACT SCHEMA  (open spec)     │  a documented JSON/YAML schema + validator
│   the standard. a file format. no network.     │
└──────────────────────────────────────────────┘
                      │ read by
┌──────────────────────────────────────────────┐
│ LAYER 2 — REFERENCE TOOLING  (open-source pkg) │  library + CLI: ordinary software
│   sandbox · pre-flight · conformance · adapters│
└──────────────────────────────────────────────┘
                      │ scaled by
┌──────────────────────────────────────────────┐
│ LAYER 3 — NETWORK  (hosted / paid / later)     │  hosted endpoints · directory · enforce
└──────────────────────────────────────────────┘
```

- **Layer 1** is a spec document + a parser. Buildable in days.
- **Layer 2** is the open-source package — the whole solo v1. Buildable by one person. Think Prism/Spectral (OpenAPI) or WireMock, **not** "build TCP."
- **Layer 3** needs scale + trust. Deferred. Not in the open-source package.

---

## 2. Component diagram (Layer 2 — the open-source package)

```
                         airlock-contract.yaml
                                  │
            ┌─────────────────────┼─────────────────────┐
            ▼                     ▼                     ▼
     ┌────────────┐       ┌──────────────┐      ┌──────────────┐
     │  Validator │       │  Sandbox     │      │  Conformance │
     │  (schema   │       │  Engine      │      │  Runner      │
     │   + lint)  │       │  (the mock)  │      │  (real agent │
     └────────────┘       └──────┬───────┘      │   vs spec)   │
            ▲                     │              └──────────────┘
            │              ┌──────┴───────┐
     ┌────────────┐        ▼              ▼
     │  Pre-flight│   ┌─────────┐   ┌──────────┐
     │  Checker   │   │ Behavior│   │ Channel  │
     │ (dry-run)  │   │ Engine  │   │ Adapters │
     └────────────┘   │ (rules) │   │ A2A/HTTP │
                      └─────────┘   └──────────┘
```

Everything reads the **same one file**. That's the design invariant: discovery, mock, pre-flight, conformance, and (later) enforcement are all *views over one contract*.

---

## 3. The contract file (Layer 1 — the heart)

A single declarative file. YAML for authoring, JSON canonical form for machines. **A2A Agent-Card–compatible** — it is a *superset*, not a competing island: the identity/skills block validates as a standard agent card, and Airlock adds the authority/failure/action sections on top.

### 3.1 Shape (illustrative)

```yaml
airlock: "0.1"                      # spec version
agent:
  name: "acme-supplier-agent"
  version: "2.3.0"
  description: "Handles PO confirmations and delivery changes"
  channels: [a2a, email]            # which adapters this contract is served over

skills:
  - id: confirm_po
    input:  { $ref: "#/schemas/PurchaseOrder" }
    output: { $ref: "#/schemas/Confirmation" }
    examples:
      - { in: {...}, out: {...} }

authority:                          # §4.3 — what may happen unilaterally
  - skill: confirm_po
    field: delivery_date_change
    auto_accept_if: "abs(days) <= 3"
    else: { action: REFUSED_POLICY, escalate: human }
  - skill: confirm_po
    field: quantity_change
    auto_accept_if: "pct <= 5"
    else: { action: COUNTER_OFFER }

instant_failures:                   # §4.4 — rejected on sight, before work
  - when: "po.entity != known_entity"
    code: OUT_OF_SCOPE
  - when: "po.reference == null"
    code: MISSING_INPUT

actions:                            # §4.5 — the catalog of foreign actions
  exposes: [UNILATERAL_COMMIT, COUNTER_OFFER, PARTIAL_FULFILLMENT, ESCALATE_TO_HUMAN]

sla:
  confirm_po: { respond_within: "5m", on_breach: ESCALATE_TO_HUMAN }

lifecycle:
  states: [submitted, working, input_required, completed, failed, canceled]
```

### 3.2 Why this is "a document, not a network stack"
- It's data. The hard parts (`authority`, `instant_failures`) are **declarative rules**, evaluated by a small expression engine — not running code, not a transport.
- The expression language is deliberately tiny and sandboxed (comparisons, arithmetic, field refs). No Turing-completeness, no arbitrary code. This keeps the validator simple and the contract safe to publish.

---

## 4. How each tool reads the file

### 4.1 Validator
- JSON-Schema-validate the contract, then **lint** semantics (e.g. an `authority` rule referencing a field absent from the skill's input schema → error).
- Ships as `airlock validate contract.yaml`. Pure function, no I/O. Easiest thing to build first; build it first.

### 4.2 Sandbox Engine (the mock)
- Loads the contract → stands up a server on the chosen channel.
- Request flow:
  1. parse incoming request (via channel adapter) into a canonical internal request
  2. run `instant_failures` → if hit, return the failure code immediately
  3. resolve skill + validate input schema
  4. evaluate `authority` rules → produces an *action* (accept / refuse / counter / escalate)
  5. shape the response from the matched `example` or rule output; fill with **synthetic, schema-true** data
  6. walk `lifecycle` states for multi-turn / async
- Deterministic by default. **Zero model calls, zero tokens** — responses come from rules + schema, not an LLM.
- Trigger inputs + sandbox headers force any specific action/error for testing.

### 4.3 Pre-flight Checker
- Same evaluation pipeline as the sandbox, but **stops after step 4 and returns the verdict without producing a response or side effect**: `WOULD_SUCCEED | WOULD_FAIL{code} | NEEDS_HUMAN_APPROVAL`.
- This is why pre-flight is nearly free to build: it's the sandbox pipeline truncated. Same code path, different exit.

### 4.4 Conformance Runner
- Generates test cases **from the contract** (one per skill, plus boundary cases at each `authority` threshold, plus each `instant_failure`).
- Runs them against a **real** agent endpoint and asserts the real responses match the declared contract.
- Answers "is the published contract a lie?" — the thing that keeps the whole system honest.

### 4.5 Channel Adapters
- A thin translation boundary. **Adapters translate; they never hold behavior** (the make-or-break from the feature spec).
- Adapter interface (conceptual):
  ```
  parse(raw_inbound)  -> CanonicalRequest
  render(CanonicalResponse) -> raw_outbound
  ```
- v1 ships **one** adapter. A2A first if you're betting the future; HTTP is the trivial fallback for early dev.
- A2O (email/EDI) adapters are bigger (parsing messy real-world docs) → deferred, and a natural paid/curated surface.

---

## 5. Open-source boundary (precise)

**In the open-source package:**
- the contract schema + JSON Schema definition
- `airlock` CLI + core library
- validator, sandbox engine, behavior/expression engine
- pre-flight checker, conformance runner
- A2A + HTTP adapters
- synthetic data generator, fault/drift injection
- self-hosted, single contract, runs on a laptop

**NOT in the package (Layer 3, hosted/paid/later):**
- hosted always-on sandbox endpoints
- the directory/registry
- shadow-model fallback
- curated email/EDI fixture corpora + those adapters
- runtime **enforcement** across a live boundary
- multi-contract management, SSO/RBAC, compliance exports

**Why open is structurally required** (not just GTM): the contract sits between two parties who don't fully trust each other. A closed neutral arbiter is a contradiction. Open source *is* the neutrality mechanism — and it's the position no platform giant can occupy.

---

## 6. Suggested stack (opinionated, change freely)

- **Language:** TypeScript. The agent ecosystem (A2A SDKs, MCP, most tooling) is JS/TS-heavy; contributors live there; one language for CLI + future web. (Python is the alternative — also fine, also well-supported. Pick the one you're faster in.)
- **Contract:** YAML authoring, JSON canonical, JSON Schema for validation, a tiny safe expression evaluator (e.g. a constrained, no-eval expression lib) for `authority`/`instant_failures`.
- **Sandbox server:** lightweight HTTP server; A2A adapter on top.
- **Distribution:** single npm package + `npx airlock` so trial is zero-install. This is the adoption on-ramp.
- **License:** Apache-2.0 (permissive → adoption; matches the neutrality story).

---

## 7. The cold-start truth (don't let the doc hide it)

A *format* becomes a *standard* only when others adopt it — an adoption problem, not a code problem. The defense is **single-player usefulness**: the open-source package must be valuable to one developer, alone, on day one — *"test my agent against a contract I wrote, no counterparty, no network, no signup."* Useful first, standard later, network last. If v1 isn't useful solo, nothing downstream happens.

---

## 8. Build order (dependency order, not a schedule)

Sequenced by what unblocks what — not a calendar.

1. **Contract schema + validator** — everything reads the file; define and validate it first.
2. **Behavior/expression engine** — evaluates authority + instant-failures. The brain.
3. **Sandbox engine over HTTP** — prove the loop end-to-end on the trivial channel.
4. **Pre-flight** — falls out of the sandbox pipeline (truncated exit).
5. **A2A adapter** — swap the channel; same brain.
6. **Conformance runner** — keeps contracts honest.
7. **Fault/drift injection** — adversarial mode.

Stop there for the open-source v1. Layer 3 (hosted, directory, enforce) only after real solo adoption.

---

## 9. Open design questions (carried from the feature spec)

1. First channel: A2A vs A2O (core is shared; the adapter is the bet).
2. Pre-flight semantics: is `WOULD_SUCCEED` a *promise* the real agent must honor, or an *estimate*? Promise = far more valuable, far harder, and requires conformance to be airtight.
3. Expression language scope: how much logic belongs in the contract before it stops being "a document" and becomes "code you have to trust"? Keep it tiny on purpose.
4. Authoring UX: raw file (developer-first) vs guided builder (vendor-first) → decides your first user.
5. Directory cold-start: who publishes the first contract, and why, into an empty registry?
