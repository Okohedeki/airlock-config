# Airlock composes with A2A; we do not define a wire protocol

**Status:** accepted

A consuming agent talking to a publisher's agent needs (1) a way to *discover* what the publisher offers and (2) a wire protocol to *invoke* it. Airlock v0.4 owns the discovery surface for the buyer-facing capability story (category, region, compliance, pricing, authority rules with PROMISE/ESTIMATE bindings, data-access disclosure) but had no concrete answer for the wire protocol beyond "POST JSON to a skill endpoint." This ADR records that **Airlock does not define a wire protocol**. We adopt **A2A (Agent2Agent)** — the open protocol Google donated to the Linux Foundation in June 2025, now backed by 150+ organisations including AWS, Microsoft, Salesforce, SAP, ServiceNow, Workday, and IBM, with v1.0 (signed Agent Cards) shipped early 2026. A2A handles the wire (JSON-RPC 2.0 over HTTP + Server-Sent Events) and the minimum discovery card (`/.well-known/agent-card.json`). Airlock keeps the rich B2B capability surface. Both files live at well-known URLs; both are derived from the same Airlock contract.

## Why

Inventing a wire protocol is the wrong battle to pick. A2A has rough industry consensus — Microsoft's Agent Framework speaks it, Google's ADK and Gemini Enterprise speak it, the Linux Foundation governs the spec, the IBM/Workday/Salesforce/SAP/ServiceNow integration matrix uses it. A publisher who already exposes an A2A Agent Card should not have to learn a second wire format to be Airlock-published, and a consumer who already speaks A2A should not have to learn Airlock-specific REST envelopes to call an Airlock-published agent.

The composition is also clean at the schema level. A2A's Agent Card is intentionally thin — name, description, endpoint URL, skills, security schemes, and (in v1.0) a signature. It does *not* describe industry, region served, compliance certifications, pricing model, data-access posture, or business-rule semantics. Those are exactly what an Airlock contract carries. A buyer who needs an RFI-grade answer fetches the Airlock contract; a runtime that just needs to dispatch a call fetches the Agent Card. The two documents serve different audiences with different latency budgets.

Staying compositional keeps ADR 0001 honest. We still publish static files. We still don't hold traffic. The sandbox remains dev-time tooling. The A2A adapter in `src/sandbox/` is the same shape as our existing HTTP routes — Layer 2 tooling reading Layer 1 contracts, not a runtime gateway. The "gateway" word stays forbidden per CONTEXT.md.

## Derivation discipline (folded in here; promotable to a standalone ADR later)

The Airlock contract is the source of truth. The Agent Card is **derived**, never hand-authored. `airlock build-site` writes both files from one contract — `airlock.yaml` is the contract, `agent-card.json` is the derivation. If a published Agent Card disagrees with what would be derived from the contract, the renderer rebuilds and warns; the contract wins. An optional `a2a` block in the contract supplies the few fields the Agent Card needs but the contract cannot derive (capability flags like `streaming`, default media types).

This discipline matters because two-source-of-truth document pairs drift. A publisher who hand-authors both will eventually update one and forget the other; integrations break silently because the discovery card promises a skill the contract says is deprecated, or vice versa. Single-source-derivation removes that failure mode and makes the relationship between the two files unambiguous.

## Considered options

- **Define an Airlock-native wire protocol** (rejected). Treats A2A as one channel among many. Maximises control over verdict-envelope semantics on the wire. Loses to the network effect of a 150-org consortium and forces consumers to choose between speaking A2A and speaking Airlock for every integration.
- **Embed an Agent Card inside the Airlock contract** (rejected). Single file at one well-known URL, two surfaces. Subverts A2A clients that scan for `/.well-known/agent-card.json` directly — they get a 404 unless we also publish at that path, which means two files anyway.
- **Compose: contract is source of truth, Agent Card is derived, both at well-known URLs** (accepted). A2A-native clients discover and invoke without any Airlock-specific code. Buyers needing the deeper RFI surface fetch the contract. Same Layer 1+2 posture as ADR 0001.

## Consequences

- The schema gains an optional `a2a` block, **informational** under ADR 0004's binding/informational split. Changing `a2a.capabilities.streaming` does not require a major bump because it describes deployment posture, not a buyer-facing promise.
- The sandbox grows two new routes: `GET /.well-known/agent-card.json` (the derived card) and `POST /a2a` (the JSON-RPC dispatcher). Existing REST routes (`/skills/<id>`, `/preflight/<id>`) continue to work — both transports drive the same pipeline.
- `airlock build-site` emits `agent-card.json` next to `airlock.yaml` for every example. The static-bundle layout grows one file per agent.
- A2A's `TaskState` enum maps onto Airlock's existing lifecycle codes with one extension: Airlock's `OUT_OF_SCOPE` and `REFUSED_BY_POLICY` map to A2A v1.0's new `TASK_STATE_REJECTED`. `UNAUTHENTICATED` / `UNAUTHORIZED` map to `TASK_STATE_AUTH_REQUIRED`. The mapping table lives in `docs/a2a-bridge.md`.
- The verdict envelope (`{code, binding, reason, ref, action, detail}`) rides inside the A2A Task's `artifact` body. A consumer that only speaks A2A sees the envelope as opaque JSON; one that wants to honour PROMISE vs ESTIMATE bindings reads the artifact per the bridge doc.
- The "gateway" word remains forbidden. The A2A adapter is not a gateway. Every doc commit during this work cycles through a sanity check.

## Deferred to v0.5

This ADR records the MVP composition (v0.4.1). The following pieces are deferred to v0.5 and will get their own ADR(s) at that point:

- **Signed Agent Cards** (A2A v1.0 `signature` block, ECDSA P-256 over RFC 8785 canonicalisation, `node:crypto`-based signing/verification CLI, JWKS endpoint).
- **Streaming responses** (`SendStreamingMessage` over SSE).
- **Push notifications** (`CreateTaskPushNotificationConfig` and siblings).
- **Bank-specific flagship example** (fintech + PCI_DSS + mTLS — more compelling once signing lands).
- **Promoting the derivation-discipline paragraph above into its own ADR 0008** if the topic earns standalone weight.

## Pinned spec rev

We built v0.4.1 against the A2A v1.0 specification as published at https://a2a-protocol.org/latest/specification/ in May 2026. Re-verify before each subsequent release. The wire-protocol surface we implement is small (three JSON-RPC methods + the Agent Card derivation); upgrade cost to a v1.x revision is bounded.
