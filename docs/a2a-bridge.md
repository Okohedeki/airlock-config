# Airlock Config + A2A bridge

This doc explains how Airlock Config contracts compose with the A2A (Agent2Agent) protocol. Background and rationale: [ADR 0007](./adr/0007-compose-with-a2a-do-not-reinvent-wire.md). A2A v1.0 reference: https://a2a-protocol.org/latest/specification/

## The composition

A2A handles the **wire** (JSON-RPC 2.0 over HTTP + Server-Sent Events) and the **discovery card** (a thin manifest at `/.well-known/agent-card.json`). Airlock Config handles the **rich B2B capability surface** (category, region, compliance, pricing, authority rules with PROMISE/ESTIMATE bindings, data-access disclosure).

Two files at well-known URLs, both derived from one source-of-truth Airlock Config contract:

```
/.well-known/airlock-config.yaml   ← the full Airlock Config contract (source of truth)
/.well-known/agent-card.json       ← A2A v1.0 Agent Card (derived)
```

A consumer that only speaks A2A discovers the agent natively and dispatches calls without any Airlock-Config-specific code. A consumer that needs the deeper RFI surface (industry, compliance certifications, pricing posture, data-access disclosure) fetches the Airlock Config contract.

## What gets derived

The publisher authors only the Airlock Config contract. `airlock-config build-site` derives the Agent Card. The mapping:

| Agent Card field | Source in the Airlock contract |
|---|---|
| `id` | `<agent.name>@<agent.version>` |
| `name` | `agent.name` |
| `description` | `agent.description` |
| `url` | `a2a.endpoint_url` if set; else derived from the contract URL host + `/a2a` |
| `provider` | `agent.contact` (name, url, email) |
| `capabilities` | `a2a.capabilities` if set; else `{streaming: false, push_notifications: false, state_transition_history: false}` |
| `skills[].name` | `skills[].id` |
| `skills[].description` | `skills[].description` |
| `skills[].inputSchema` | `skills[].input` (already JSON Schema) |
| `skills[].outputSchema` | `skills[].output` |
| `skills[].mediaTypes` | `a2a.default_input_modes` / `a2a.default_output_modes`; defaults to `["application/json"]` |
| `securitySchemes` | derived from `auth_model.methods` per the table in the next section |
| `security` | one alternative per declared `auth_model` method |
| `extensions[]` | `[{uri: "airlock-config-contract", value: <contract URL>}]` — back-pointer |
| `signature` | currently unsigned (deferred to a later release) |

The `a2a` block in the Airlock Config contract is purely informational ([ADR 0004](./adr/0004-harness-fields-are-informational.md)): changes to it never require a major version bump.

## auth_model → securitySchemes

| Airlock `auth_model.methods` | A2A `securitySchemes` entry |
|---|---|
| `none` | (no scheme; `security: [{}]` — auth optional) |
| `api_key` | `{type: "apiKey", in: "header", name: "X-API-Key"}` |
| `oauth2_client_credentials` | `{type: "oauth2", flows: {clientCredentials: {tokenUrl, scopes}}}` |
| `oauth2_auth_code` | `{type: "oauth2", flows: {authorizationCode: {authorizationUrl, tokenUrl, scopes}}}` |
| `mtls` | `{type: "mutualTLS"}` |
| `signed_jwt` | `{type: "http", scheme: "bearer"}` (caller carries a self-issued JWT) |
| `webauthn` | `{type: "http", scheme: "bearer"}` (caller carries a passkey-derived bearer) |

The derived OAuth token / authorization URLs default to placeholders; publishers override them via the `a2a.documentation_url` plus their own well-known endpoints. A future release adds proper OAuth/JWKS overrides.

## Verdict → A2A TaskState

The A2A adapter wraps each Airlock Config Verdict in an A2A `Task`. The `TaskState` derives from the Verdict's `code`:

| Airlock `code` | A2A `TaskState` |
|---|---|
| `ACCEPTED_BY_RULE`, `ACCEPTED_LIKELY`, `COMPLETED`, `COUNTER_OFFER_LIKELY`, `HUMAN_REVIEW_LIKELY`, `DEPENDS_ON_STATE` | `TASK_STATE_COMPLETED` |
| `OUT_OF_SCOPE`, `REFUSED_BY_POLICY`, `WRONG_AGENT` | `TASK_STATE_REJECTED` |
| `UNAUTHENTICATED`, `UNAUTHORIZED` | `TASK_STATE_AUTH_REQUIRED` |
| `MISSING_INPUT`, `SCHEMA_INVALID`, `MALFORMED_INPUT`, `RATE_LIMITED`, `FAILED`, `ESCALATED` | `TASK_STATE_FAILED` |
| `INPUT_REQUIRED` | `TASK_STATE_INPUT_REQUIRED` |
| `SUBMITTED`, `WORKING` | matching A2A state |
| `CANCELED` | `TASK_STATE_CANCELED` |

The full Verdict (including the PROMISE/ESTIMATE `binding`) lives in the Task's `artifact.verdict` body so an Airlock-Config-aware consumer can still reason about it. An A2A-only consumer that doesn't know about Airlock Config can fall back to the `TaskState` alone.

## What the consumer sees

A consumer using only A2A:

```sh
# Discover
curl https://bank.example.com/.well-known/agent-card.json

# Invoke
curl -X POST https://bank.example.com/a2a \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"SendMessage","params":{"message":{"parts":[{"skill":"confirm_transfer","data":{...}}]}}}'
# → { "jsonrpc":"2.0", "id":1, "result": { "id":"<task-id>", "state":"TASK_STATE_COMPLETED", "artifact": {...} } }
```

An Airlock-Config-aware consumer additionally reads `artifact.verdict.binding` to distinguish PROMISE from ESTIMATE outcomes (per [ADR 0002](./adr/0002-trustworthy-in-between-via-binding-codes.md)) and can fetch `/.well-known/airlock-config.yaml` to read the full contract before deciding whether to integrate at all.

## What's implemented (MVP)

JSON-RPC methods on `POST /a2a`:

- `SendMessage` — invokes a skill, returns a Task.
- `GetTask` — looks up a stored task by id.
- `CancelTask` — marks a non-terminal task canceled.

Everything else returns JSON-RPC `-32601` (method not found) with a clean message pointing at the deferred milestone:

- `SendStreamingMessage` (SSE) — deferred.
- `ListTasks`, `SubscribeToTask` — deferred.
- Push-notification config methods — deferred.
- `GetExtendedAgentCard` — deferred.
- Signed Agent Cards (the `signature` block) — deferred.

The task store is in-memory and single-process. The sandbox remains dev-time tooling; nothing here turns Airlock Config into a runtime, and the "gateway" term remains banned per [CONTEXT.md](../CONTEXT.md).

## What the next milestone adds

- Cryptographic signing of the Agent Card per A2A v1.0 (`signature` block, JWKS endpoint, `airlock-config sign-card` / `verify-card` / `keygen` CLI).
- Streaming responses (`SendStreamingMessage` over SSE) for long-running skills.
- Push notification config so consumers can register webhooks.
- A fintech flagship example demonstrating signed cards + mTLS + PCI_DSS compliance.
