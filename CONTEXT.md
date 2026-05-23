# Airlock

Airlock is a contract format and open-source tooling for declaring how an agent-driven service handles inbound traffic from external (often untrusted) agents. This document defines the language used throughout the project so terms mean the same thing in code, in docs, and in conversation.

## Language

**Contract**:
A self-declared, machine-readable specification published by a receiving party describing what inbound agent-driven interactions it accepts, refuses, and escalates. Authored by the receiver; consumed by the sender. NOT a bilateral agreement — neutrality comes from the open schema, not from co-authorship. Analogue: OpenAPI.
_Avoid_: Spec, manifest, agreement, policy file

**Publisher**:
The party that authors and publishes a contract. The receiver of inbound traffic. Owns the agent or organizational system that the contract describes.
_Avoid_: Owner, vendor, host, server

**Consumer**:
The party that fetches a contract to interact with the publisher. May be an LLM-driven agent (A2A) or a non-AI organizational system (A2O).
_Avoid_: Caller, client, integrator, requester

**Untrusted agent**:
The default classification of any inbound consumer. The publisher has not vetted them and assumes nothing about their good behavior. Load-bearing — the whole pitch hinges on the receiver not trusting the sender.
_Avoid_: External agent, third party, unauthenticated caller

**A2A — Agent to Agent**:
Two agents communicate directly. Airlock standardizes the receiving side's expectations. Typically synchronous and fast.
_Avoid_: Agent-to-agent (no hyphen variant), bot-to-bot

**A2O — Agent to Organization**:
An external agent interacts with an organization. The receiving side may be agent-mediated or a non-AI system (ERP, EDI pipeline, email workflow). Often asynchronous.
_Avoid_: Agent-to-org, agent-to-business

**Channel**:
The transport over which a contract is served (HTTP, A2A, email, EDI). v1 ships only HTTP. The contract is channel-agnostic; channel adapters translate inbound transport into the canonical request.
_Avoid_: Transport, protocol, wire

**Adapter**:
The thin translation boundary between a channel and the canonical request/response. Adapters translate; they never hold behavior.
_Avoid_: Connector, driver, gateway

## Verdicts

**Verdict**:
The result of evaluating an input against a contract, returned by pre-flight (predicted) or by the real agent (actual). Carries a `code`, a `binding`, a `reason`, a `ref` to the producing rule, and optional `detail`.
_Avoid_: Result, response code, status

**Binding** (verdict field):
Whether the publisher is bound to the verdict. Two values: `PROMISE` or `ESTIMATE`. Set on pre-flight verdicts only; real-response codes don't carry a binding because they describe what actually happened.
_Avoid_: Strength, certainty, confidence

**Promise** (binding value):
The publisher is bound. If the real agent diverges from a PROMISE pre-flight verdict, that is a public conformance violation catchable by `airlock check`. Produced by deterministic rules (phases 1–3 of the taxonomy).
_Avoid_: Guarantee, commitment, contract verdict

**Estimate** (binding value):
The publisher's best prediction. The real agent may differ. Produced by judgment rules (phase 4: soft outcomes that depend on model output, real-time state, or external systems).
_Avoid_: Hint, suggestion, prediction

**Authority rule**:
A declarative rule in the contract that determines what the agent will do unilaterally vs. refuse vs. escalate. Each rule declares itself `deterministic` (→ PROMISE codes) or `judgment` (→ ESTIMATE codes).
_Avoid_: Permission, policy, ACL

**Instant failure**:
A condition the contract declares as rejected on sight, before any work is done. Always produces a PROMISE code (e.g., `OUT_OF_SCOPE`, `MISSING_INPUT`).
_Avoid_: Early refusal, pre-check failure

## Discovery and packaging

**Well-known contract URL**:
The canonical location of a published contract: `https://<host>/.well-known/airlock.yaml` for the machine spec, `/.well-known/airlock/` for the rendered human + LLM docs. RFC 8615 pattern.
_Avoid_: Contract endpoint, manifest URL

**Static bundle**:
The output of `airlock build`: a directory containing the machine spec (`.well-known/airlock.yaml`), the rendered HTML portal, and the LLM-friendly markdown (`llms.txt`). Served by any static host — the publisher's own infra, S3, GitHub Pages, or the sister deploy project.
_Avoid_: Build output, distribution, package

**Registry (GitHub-list)**:
The v1 directory: a public GitHub repo (`github.com/airlock/registry`) with a single JSON index. Publishers self-list by PR. Queried by `airlock search`. No accounts, no curation, no central authority. A hosted registry with accounts is a Layer 3 product, not v1.
_Avoid_: Directory, hub, marketplace

## Layers

**Layer 1**:
The contract schema itself — a JSON Schema specification plus the documented rules for what makes a contract valid. The standard. Just a file format.

**Layer 2**:
The open-source tooling that reads Layer 1 contracts. v1 scope. Includes the validator, behavior engine, sandbox, pre-flight checker, conformance runner, codegen, renderer, HTTP channel adapter, and registry client.

**Layer 3**:
Hosted, paid, and explicitly out of scope for v1. Includes a hosted always-on sandbox, a registry with accounts and curation, runtime enforcement across a live boundary, multi-contract management, and SSO/RBAC.

## Flagged ambiguities

**"Gateway"** is *not* an Airlock term. The doc and conversation have used it loosely. Airlock is not a runtime gateway; it never holds traffic. If "gateway" appears in code or docs, replace it with the precise term (e.g., "channel adapter," "static bundle," "self-hosted runtime" if referring to the future sister project's role).

**"Agent"** is overloaded across the industry. Inside this project: an agent is any system on either side of a contract — LLM-driven or otherwise. A non-AI ERP that consumes a contract is still "the consumer agent" in our language, even if it's pure code.

## Example dialogue

> **Dev:** I'm exposing our PO confirmation service to enterprise customers. Where do I start?
> **Domain expert:** You're the **publisher**. Write a **contract** describing what your service accepts. Drop it at your **well-known contract URL**. Your customers' agents — the **consumers** — discover it from there.
>
> **Dev:** What if a consumer sends garbage?
> **Domain expert:** That's why every consumer is treated as an **untrusted agent**. Your contract's **instant failures** reject obvious garbage on sight, and your **authority rules** define what's allowed without human review.
>
> **Dev:** How does the consumer know what'll succeed before calling?
> **Domain expert:** They run pre-flight. They get back a **verdict** with a `code` and a `binding`. If the binding is `PROMISE`, you're bound to honor it. If it's `ESTIMATE`, it's a best-guess hint.
>
> **Dev:** What's the difference?
> **Domain expert:** PROMISE comes from your **deterministic** rules — the math holds. ESTIMATE comes from your **judgment** rules — depends on model output or inventory or human review. `airlock check` will publicly fail your contract if you ever lie on a PROMISE.
>
> **Dev:** Some of our customers don't use AI agents — they integrate via EDI.
> **Domain expert:** Same contract, different **channel**. The schema is channel-agnostic. v1 ships only the HTTP **adapter**; the EDI adapter is later. The codes don't change — A2A and A2O return the same verdict shapes.
