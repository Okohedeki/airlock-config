# Harness fields are informational; only capability fields carry binding promises

**Status:** accepted

v0.3 expands a contract from "what skills a service accepts" to "what an AI harness can and can't do." The new blocks split cleanly into two categories. **Binding** blocks make load-bearing promises a consumer programs against: `skills`, `tools`, `permissions`, `guardrails`, `authority`, `instant_failures`, `actions`. **Informational** blocks describe the concrete deployment serving the contract: `agent.harness` (framework, model, runtime, limits), `mcp_servers`, `secrets`, `delegates_to`. Major version bumps are required when binding blocks change incompatibly; informational blocks may change in minor versions. The conformance runner asserts binding blocks only.

## Why

Without this line, the schema collapses into incoherence the moment a publisher swaps Claude Code for a custom harness with the same exposed skills. If `agent.harness.framework` is binding, every harness swap becomes a major version bump consumers must re-integrate against — contracts become churny and the version number stops meaning anything. If `agent.harness` is informational, then it must be acknowledged in the schema as documentation rather than commitment, otherwise readers (human and AI) will reasonably treat every field they see as a promise. The same tension applies to MCP server choice (an implementation detail of how tools are loaded) and to declared secrets (a disclosure for blast-radius reasoning, not a promise about what the agent will *do* with them).

The deeper principle: Airlock contracts are *capability surfaces*, not *deployment manifests*. A capability surface describes what the consumer can rely on. A deployment manifest describes how the publisher chose to implement it. Mixing them silently produces the worst of both — over-coupled contracts that pretend to be neutral.

## Considered options

- **Everything binding (rejected).** Simple to explain. Makes contracts useless: any internal change becomes a public breaking change.
- **Everything informational (rejected).** Frees the publisher entirely. Destroys the promise model that makes pre-flight and conformance worth anything.
- **Two-category split (accepted).** Each new block in v0.3 is explicitly tagged as binding or informational in the schema doc. The conformance runner reads only binding blocks. The validator lints major bumps that touch only informational fields as suspicious.

## Consequences

- Schema documentation for every block must state its category. `docs/contract-schema.md` carries a binding/informational badge per section. No exceptions.
- The conformance runner ignores `agent.harness`, `mcp_servers`, `secrets`, `delegates_to`. Drift in those fields is not a violation.
- Publishers can move from one model or framework to another without a major bump as long as the binding surface is unchanged. The validator warns if a major bump's diff is informational-only ("are you sure?") and warns if a minor bump touches a binding field ("you likely owe a major").
- The renderer visually separates binding from informational sections so consumers can tell at a glance which fields they may rely on.
- Future blocks added in v0.4+ must be classified at proposal time. Anything ambiguous (e.g., a `safety` block of self-attested defenses) defaults to informational unless the proposal demonstrates a conformance assertion that exercises it.
