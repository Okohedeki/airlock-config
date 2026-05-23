# Trustworthy "in between" via per-verdict binding codes

**Status:** accepted

Pre-flight verdicts could be designed as **promises** (publisher is bound; consumers can plan multi-step workflows on the result) or as **estimates** (best-guess hints; real call required to confirm). Promise is much more valuable but requires bulletproof conformance; estimate is cheap but weak. We rejected the binary and instead made the binding level a **per-verdict field**. Every verdict carries `binding: PROMISE | ESTIMATE` along with its `code`. Phases 1–3 of the taxonomy (identification, input validation, deterministic rule evaluation) always return PROMISE codes. Phase 4 (soft outcomes that depend on model output or runtime state) always returns ESTIMATE codes. Authority rules in the contract self-classify as `deterministic` or `judgment`; the validator lints this — a rule marked deterministic that references runtime state is a validation error.

## Why

A binary "everything is a promise" forces conformance to be airtight before any feature ships and over-commits the publisher on outcomes that genuinely depend on judgment (counter-offer thresholds, human review bands, inventory). A binary "everything is an estimate" gives up the killer feature: consumers being able to plan a multi-step workflow knowing the deterministic refusals before paying for the call. The per-verdict binding gives consumers real information at no extra cost — the deterministic core is trustworthy, the judgment edges are honest about their uncertainty. Conformance (`airlock check`) only needs to enforce PROMISE codes, which is tractable; ESTIMATE codes are explicitly out of conformance's scope. This is also the design that makes A2O honest — long-running EDI/email flows often live in an estimate world for hours before resolving, and the model accommodates that without lying.

## Consequences

- Every consumer library and every documentation surface must explain the binding distinction. This adds a concept to teach but it is the concept that makes the contract trustworthy.
- The contract schema gains a required `binding_class: deterministic | judgment` field on every authority rule. The validator enforces it.
- `airlock check` runs every input that maps to a PROMISE code and asserts the real agent returns the same code. ESTIMATE codes are not conformance-tested.
- Signed / portable conformance attestations are deferred to v1.1. v1 ships with a green-check-in-CI honesty signal.
- This decision is hard to reverse — flipping to a single binding level later would break every consumer that reads the binding field.
