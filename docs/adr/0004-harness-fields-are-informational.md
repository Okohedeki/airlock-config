# Binding vs informational blocks

**Status:** accepted (revised in v0.4 — see history below)

A contract carries two categories of fields. **Binding** blocks make load-bearing promises a consumer programs against; the conformance runner asserts them. **Informational** blocks describe deployment facts a consumer may want for blast-radius reasoning but cannot rely on; they may change in minor versions. The validator warns when a major version bump touches only informational fields and when a minor bump touches a binding field.

Current (v0.4) categorisation:

| Binding | Informational |
|---|---|
| `skills` | `pricing.price_url` |
| `category` *(industry, capability, subcategory)* | *(everything else under `agent` aside from `name`/`version` is descriptive but pinned to the contract version)* |
| `region` *(data_residency, serves_regions)* | |
| `compliance` *(certifications and attestations)* | |
| `auth_model` *(methods, enrollment)* | |
| `pricing.model` and `pricing.unit` | |
| `permissions` *(data-access disclosure)* | |
| `guardrails` *(refused topics/actions, required_authentication)* | |
| `authority` rules + `summary` + `keywords` | |
| `instant_failures` + `summary` + `keywords` | |
| `actions` | |
| `sla` | |
| `lifecycle` | |
| `deprecation` | |
| `tags` | |

## Why

Without this line the schema collapses into incoherence. If pricing's `price_url` is binding, every commercial-terms revision becomes a public breaking change. If pricing's `model` is informational, a buyer can't trust the contract enough to pre-filter on "give me subscription-only suppliers." The split lets the contract make the promises that drive integration and stay quiet about the facts that drive operations.

The deeper principle: Airlock contracts are **buyer-facing capability surfaces**. Anything a buyer would put in an RFI belongs in the binding spine. Anything that's deployment- or commercial-volatile belongs in the informational tail or out of the contract entirely.

## Considered options

- **Everything binding** (rejected). Simple. Makes contracts useless: every revision is breaking.
- **Everything informational** (rejected). Frees the publisher. Destroys the promise model that makes pre-flight, conformance, and indexing worth anything.
- **Two-category split** (accepted). Each block in the schema is tagged binding or informational. Conformance reads only the binding set. The validator lints version bumps against the diff.

## Consequences

- Every section in `docs/contract-schema.md` carries a binding/informational badge. No exceptions.
- The conformance runner ignores informational fields. Drift in those is not a violation.
- The renderer visually separates the two categories.
- Future blocks must be classified at proposal time. Ambiguous proposals default to informational unless the author demonstrates a conformance assertion that exercises the field.

## History

### v0.3 (superseded)

The original v0.3 categorisation listed `tools`, `hooks`, `permissions`, `guardrails` as binding and `agent.harness`, `mcp_servers`, `secrets`, `delegates_to` as informational. This decision was right in its abstract structure but wrong in its concrete field list — the binding blocks targeted developers (Claude-Code-style harness primitives) rather than business buyers. See ADR 0006 for the reframe; the binding-vs-informational distinction itself stands.

### v0.4 (current)

`tools`, `hooks`, `mcp_servers`, `secrets`, `delegates_to`, and `agent.harness` were removed from the schema entirely. The binding spine was repopulated with B2B fields (`category`, `region`, `compliance`, `auth_model`, `pricing`), `permissions` was reshaped from developer-permission-strings to data-access disclosure, and `guardrails` adopted curated topic/action vocabularies so registry indexers can categorise refusals.
