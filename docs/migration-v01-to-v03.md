# Migrating from Airlock v0.1 to v0.3

v0.3 is a major reframe — the contract is no longer a service-RPC manifest but a full AI-harness disclosure document. v0.2 was never published; the version number jumps to signal the reframe.

The good news: existing skills/authority/instant_failures stay valid. The only required change is the version string. Everything else is additive.

## TL;DR

1. Bump `airlock: "0.1"` → `airlock: "0.3"`.
2. (Optional) Add `agent.harness`, `tools`, `hooks`, `permissions`, `guardrails`, `mcp_servers`, `secrets`, `delegates_to` blocks if you want consumers to know about them.
3. Re-run `airlock validate`.

That's the entire migration for contracts that only used the v0.1 surface.

## Changes that may break v0.1 contracts

### `authority` rules: exactly one of `skill` or `tool`

In v0.1, every authority rule required `skill`. In v0.3, a rule may target either a `skill` or a `tool` (mutually exclusive). The validator's `oneOf` constraint rejects both-set and neither-set.

If your v0.1 contract already has `skill` on every rule, you're fine. The constraint only fires when you intentionally try to target a tool.

### Status codes — no change

The status code enum (`OUT_OF_SCOPE`, `ACCEPTED_BY_RULE`, etc.) is unchanged across the break. Consumers programming against the codes don't have to re-learn anything.

### `sla` keys

v0.1 SLA keys were bare skill ids: `sla: { confirm_po: { ... } }`. v0.3 supports both the bare form (back-compat shorthand for `skill:<id>`) and explicit prefixes:

```yaml
sla:
  confirm_po:        { respond_within: "5m" }   # bare — interpreted as skill:confirm_po
  "skill:confirm_po": { respond_within: "5m" }  # explicit
  "tool:bash":       { respond_within: "30s" }  # tool SLA (new in v0.3)
```

No change required.

## New blocks (all optional)

### `agent.harness` (informational)

Describe the runtime envelope serving the contract.

```yaml
agent:
  name: my-agent
  version: 0.3.0
  harness:
    framework: claude-code
    model: claude-opus-4-7
    runtime: node-24
    limits:
      max_tokens: 200000
      timeout: 5m
```

Per ADR 0004, this block is informational — you can swap framework/model/runtime in a minor version without breaking consumers.

### `tools`

Declare the capabilities your harness invokes internally. Distinct from skills (consumer-facing).

```yaml
tools:
  - id: bash
    description: Execute a shell command.
    input_schema:
      type: object
      required: [command]
      properties:
        command: { type: string }
    output_schema:
      type: object
      properties:
        exit_code: { type: integer }
        stdout: { type: string }
    side_effects: [shell, process]
    source: { kind: builtin }
```

Tools enable consumer pre-flight against tool invocations: `POST /preflight-tool/<tool_id>` runs the same authority pipeline scoped to tool-targeted rules.

### `hooks`

Declare lifecycle interception points. `mode` is binding.

```yaml
hooks:
  - event: pre_tool_use
    mode: block
    description: Authority rules evaluated before any tool call.
```

Events: `before_skill`, `after_skill`, `pre_tool_use`, `post_tool_use`, `on_error`, `on_stop`. Modes: `observe`, `mutate`, `block`.

### `permissions`

Static allow/disallow at typed-resource granularity.

```yaml
permissions:
  allowed:
    - "fs.read:./**"
    - "network:api.github.com"
  disallowed:
    - { resource: fs, op: write, scope: "/etc/**", reason: System config. }
    - "tool:bash:rm -rf *"
```

Resource enum: `fs`, `network`, `tool`, `mcp`, `env`, `secret`.

### `guardrails`

Categorical agent-level refusals.

```yaml
guardrails:
  refused_topics: [financial-advice, medical-diagnosis]
  refused_actions: [commit-secrets, force-push-main]
  required_authentication: false
```

### `mcp_servers`, `secrets`, `delegates_to`

Informational disclosure blocks. See [`docs/contract-schema.md`](./contract-schema.md) for the full shape.

## Sandbox behaviour changes

### Schema-derived response faker

In v0.1, the sandbox returned `undefined` for the `detail` payload when no example matched the computed verdict. In v0.3, the sandbox falls back to a deterministic schema-derived faker (ADR 0005). The response includes an `X-Airlock-Detail-Source` header set to `example` or `synthesized`.

If your CI asserted that `detail === undefined` for un-exampled verdicts, those assertions will need to change. Most users will not notice.

### New tool routes

`POST /tools/<tool_id>` and `POST /preflight-tool/<tool_id>` are new. They are only meaningful if your contract declares `tools[]`.

## Validation errors you may see

| Error | Cause | Fix |
|---|---|---|
| `contract declares airlock="0.1", but v0.3 is the current major. See docs/migration-v01-to-v03.md` | Version string still says 0.1 | Bump to `"0.3"` |
| `authority[N] (ID) must target either a skill or a tool` | A rule has neither `skill` nor `tool` | Add the appropriate target |
| `authority[N] (ID) references unknown tool "X"` | Tool-targeted rule references a tool not in `tools[]` | Declare the tool or fix the typo |
| `permissions.allowed[N] uses unknown resource "X"` (warning) | A short-form permission uses a resource outside the closed enum | Use one of `fs`/`network`/`tool`/`mcp`/`env`/`secret`, or accept the warning |

## A worked example

A minimal v0.1 contract:

```yaml
airlock: "0.1"
agent: { name: pinger, version: 0.1.0 }
skills:
  - id: ping
    input: { type: object }
    output: { type: object, properties: { pong: { type: boolean } } }
```

The v0.3 equivalent is exactly one character different:

```yaml
airlock: "0.3"
agent: { name: pinger, version: 0.1.0 }
skills:
  - id: ping
    input: { type: object }
    output: { type: object, properties: { pong: { type: boolean } } }
```

Adding harness disclosure is optional but recommended:

```yaml
airlock: "0.3"
agent:
  name: pinger
  version: 0.1.0
  harness:
    framework: custom
    runtime: node-24
skills:
  - id: ping
    input: { type: object }
    output: { type: object, properties: { pong: { type: boolean } } }
```

## Why not v0.2?

v0.2 was never published. The version bump to v0.3 signals to anyone holding a v0.1 contract that the reframe is intentional and that the migration note explains what's new.
