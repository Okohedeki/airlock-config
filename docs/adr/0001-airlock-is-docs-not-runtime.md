# Airlock is docs and tooling, not a runtime

**Status:** accepted

The first instinct for "describe what untrusted agents can do" is to build a gateway — a network appliance that sits in front of the receiving agent and enforces the contract in real time. We rejected this. Airlock v1 is **strictly Layer 1 (the contract schema) + Layer 2 (open-source tooling that reads the schema).** It never holds traffic, never multi-tenants anything, never deploys agents. The contract is published as a static file at a well-known URL on the publisher's own infrastructure; consumers fetch it. The tooling (validator, sandbox, pre-flight checker, conformance runner, codegen, renderer) is all dev-time and CI-time.

## Why

A hosted gateway has three structural problems Airlock cannot accept. First, it requires us to operate live infrastructure on behalf of publishers — secrets management, scale, abuse handling, ops — which is a different company from "ship an open spec." Second, a closed neutral arbiter is a contradiction; the contract sits between two parties who don't fully trust each other, and a platform vendor running that boundary is a single point of capture. Third, the OpenAPI analogue we explicitly anchored to is a file + tooling pattern; OpenAPI didn't win because anyone hosts OpenAPI for you. By staying off the wire, Airlock preserves the neutrality that makes adoption possible and keeps v1 buildable by a single person.

## Considered options

- **Hosted gateway (rejected).** Multi-tenant runtime that enforces contracts. Becomes Layer 3 if it ever ships — separate product, paid, deferred until there is real adoption.
- **Self-hosted library / sidecar (rejected for v1).** A library publishers run in their own request path. Closer to the "untrusted agent defense" pitch, but still requires every publisher to operate Airlock-in-their-iron and tilts us toward platform thinking. Available later as the sister deploy project's runtime mode, not as part of Airlock proper.
- **Publish a file (accepted).** Contract lives as a static file at `/.well-known/airlock.yaml`. Tooling reads the file. v1 helps with coordination, not defense. Defense against malicious consumers is the publisher's existing problem; Airlock makes legitimate inter-agent commerce possible.

## Consequences

- v1 cannot defend against malicious agents at runtime. We must be explicit about this in marketing and docs to avoid overselling.
- Deployment is a separate project. Airlock generates a static bundle and handler stubs; a sister project (see `docs/airlock-deploy-sister-project.md`) scaffolds running agents on the publisher's own cloud.
- The "gateway" word is forbidden in our terminology. CONTEXT.md flags this explicitly.
- If a future enterprise customer demands a hosted enforcement layer, that is Layer 3 and a new product, not a feature of Airlock.
