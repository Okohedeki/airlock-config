# Airlock Contract Schema (v0.3)

The canonical JSON Schema lives at [`schema/airlock.schema.json`](../schema/airlock.schema.json). This document is the narrative companion — it explains the shape, the invariants, and the rationale. Where the two disagree, the JSON Schema wins.

For terminology and decisions, read these first:

- [`CONTEXT.md`](../CONTEXT.md) — canonical glossary
- [`docs/adr/0001-airlock-is-docs-not-runtime.md`](./adr/0001-airlock-is-docs-not-runtime.md) — Layer 1+2 only
- [`docs/adr/0002-trustworthy-in-between-via-binding-codes.md`](./adr/0002-trustworthy-in-between-via-binding-codes.md) — PROMISE/ESTIMATE binding model
- [`docs/adr/0003-publish-a-file-deployment-model.md`](./adr/0003-publish-a-file-deployment-model.md) — contracts as static files
- [`docs/adr/0004-harness-fields-are-informational.md`](./adr/0004-harness-fields-are-informational.md) — binding vs informational
- [`docs/adr/0005-sandbox-falls-back-to-schema-derived-responses.md`](./adr/0005-sandbox-falls-back-to-schema-derived-responses.md) — the faker

## Binding vs informational

Per ADR 0004, every top-level block falls into one of two categories. Each section heading below carries its category.

- **BINDING**: load-bearing promises. Conformance asserts these. Incompatible changes require a major version bump.
- **INFORMATIONAL**: deployment facts. Stated for consumer blast-radius reasoning. May change in minor versions without breaking integrations.

## Top-level shape

```yaml
airlock: "0.3"                # spec version (v0.1/v0.2 are rejected)
agent: { ... }                # identity + harness (informational)
schemas: { ... }              # reusable type defs (optional)
skills: [ ... ]               # BINDING — what consumers call
tools: [ ... ]                # BINDING — what the harness reaches for
hooks: [ ... ]                # BINDING — lifecycle interception points
mcp_servers: [ ... ]          # INFORMATIONAL — tool provenance
permissions: { ... }          # BINDING — allowed/disallowed
guardrails: { ... }           # BINDING — categorical refusals
secrets: [ ... ]              # INFORMATIONAL — named env-vars/credentials
delegates_to: [ ... ]         # INFORMATIONAL — transitive trust surface
authority: [ ... ]            # BINDING — rules
instant_failures: [ ... ]     # BINDING — reject-on-sight
actions: { ... }              # BINDING — action catalog
sla: { ... }                  # BINDING — per-skill/per-tool response times
lifecycle: { ... }            # BINDING — lifecycle states this agent uses
deprecation: { ... }          # BINDING — set when this version is phased out
```

YAML is the authoring format; JSON is the canonical machine form. The two are isomorphic.

## `agent` (identity + harness)

```yaml
agent:
  name: airlock-codegen-agent
  version: 0.3.0
  description: A coding agent published as an Airlock contract.
  channels: [http]
  homepage: https://example.com/agents/codegen
  contact:
    name: Example Inc
    email: agents@example.com

  # INFORMATIONAL block — describes the runtime envelope. May change in minor versions.
  harness:
    framework: claude-code
    model: claude-opus-4-7
    runtime: node-24
    limits:
      max_tokens: 200000
      max_turns: 100
      max_tool_calls_per_turn: 25
      timeout: 5m
```

The `harness` block is informational per ADR 0004 — the publisher may swap `framework: claude-code` for `framework: custom` without bumping the contract major as long as the binding surface (skills/tools/permissions/guardrails/etc.) is unchanged.

## `schemas` and `skills` (BINDING)

```yaml
schemas:
  CodeRef:
    type: object
    required: [path]
    properties:
      path: { type: string }
      line: { type: integer, minimum: 1 }

skills:
  - id: analyze_code
    description: Read a file, return a structured summary.
    input:  { $ref: "#/schemas/CodeRef" }
    output:
      type: object
      required: [summary, risks]
      properties:
        path:        { type: string }
        summary:     { type: string }
        risks:       { type: array, items: { type: string } }
        line_count:  { type: integer }
    examples:
      - name: analyze-known-file
        in:  { path: src/expr/index.ts }
        out:
          path: src/expr/index.ts
          summary: "Public surface of the expression engine."
          risks: []
          line_count: 65
        expected_verdict:
          code: ACCEPTED_BY_RULE
          binding: PROMISE
          ref: analyze-within-workspace
```

Each skill has `id`, `input`, `output`, and zero or more `examples`. Examples are load-bearing: the renderer shows them, the sandbox replays them, and the conformance runner asserts the `expected_verdict` matches the real agent for PROMISE codes. When no example matches a verdict, the sandbox falls back to a deterministic schema-derived faker (ADR 0005).

## `tools` (BINDING, v0.3)

Tools differ from skills: skills are what external consumers call, tools are what the harness reaches for internally. Each tool entry declares an `input_schema`, an optional `output_schema`, declared `side_effects`, and optionally a `source` discriminator pointing at an MCP server.

```yaml
tools:
  - id: read_file
    description: Read a file from the workspace.
    input_schema:
      type: object
      required: [path]
      properties:
        path: { type: string }
    output_schema:
      type: object
      properties:
        path:    { type: string }
        content: { type: string }
        bytes:   { type: integer }
    side_effects: [fs.read]
    source: { kind: builtin }

  - id: bash
    description: Execute a shell command. Heavily restricted.
    input_schema:
      type: object
      required: [command]
      properties:
        command: { type: string }
    output_schema:
      type: object
      properties:
        exit_code: { type: integer }
        stdout:    { type: string }
        stderr:    { type: string }
    side_effects: [shell, fs.read, fs.write, process]
    source: { kind: builtin }
    limits:
      timeout: 30s
      max_calls_per_skill: 10
```

Consumers can pre-flight a tool invocation directly via the sandbox: `POST /preflight-tool/<tool_id>` returns a verdict (the same authority pipeline runs, scoped to tool-targeted rules).

The `side_effects` enum is closed in v0.3: `fs.read`, `fs.write`, `network`, `shell`, `process`, `compute-only`.

## `hooks` (BINDING, v0.3)

```yaml
hooks:
  - event: pre_tool_use
    mode: block
    description: Authority rules + permissions are evaluated before any tool call.
  - event: post_tool_use
    mode: observe
    description: Read-only audit log.
  - event: before_skill
    mode: mutate
    skill: analyze_code
    description: Canonicalises workspace-relative paths.
```

`mode` is binding: a consumer reasoning about request safety needs to know whether a hook silently observes, may rewrite the payload, or may halt the action. The events are a closed enum: `before_skill`, `after_skill`, `pre_tool_use`, `post_tool_use`, `on_error`, `on_stop`.

## `permissions` (BINDING, v0.3)

Static allow/disallow against typed resources. Each entry is either a structured object or its short-form string `"<resource>.<op>:<scope>"`. The loader canonicalizes both forms; the resource enum is closed in v0.3.

```yaml
permissions:
  allowed:
    - "fs.read:./**"
    - "network:api.github.com"
    - "env:GITHUB_TOKEN"
  disallowed:
    - { resource: fs, op: write, scope: "/etc/**", reason: System config off-limits. }
    - { resource: tool, op: bash, scope: "rm -rf *", reason: No recursive deletes. }
    - "network:*.internal"
```

Resource enum: `fs`, `network`, `tool`, `mcp`, `env`, `secret`. Unknown resources are tolerated but produce a lint warning (the closed enum is what makes permissions audit-friendly).

`permissions` expresses blanket policy. Conditional behavior (e.g. "the bash tool may not run `rm` *when invoked from the refactor skill*") belongs in an authority rule that targets the tool.

## `guardrails` (BINDING, v0.3)

Categorical refusals at the agent level — coarser than authority rules.

```yaml
guardrails:
  refused_topics:
    - financial-advice
    - medical-diagnosis
  refused_actions:
    - commit-secrets
    - force-push-main
  required_authentication: false
```

Consumers read guardrails to decide whether to integrate at all.

## `mcp_servers` (INFORMATIONAL, v0.3)

```yaml
mcp_servers:
  - name: figma
    endpoint: https://mcp.figma.com
    auth_posture: oauth
    allowed_tools: [get_design_context, get_screenshot]
```

Each entry describes one MCP server the harness loads. Tools sourced from MCP servers carry `source: { kind: mcp, server: <name> }` so provenance is auditable. Per ADR 0004, swapping MCP servers does not require a major bump as long as the `tools[]` surface is preserved.

## `secrets` (INFORMATIONAL, v0.3)

```yaml
secrets:
  - name: GITHUB_TOKEN
    purpose: Read repo metadata when web_fetch hits the github API.
```

The publisher discloses *which* env-vars and credentials the harness reads — never their values. Lets consumers reason about blast radius ("this agent reads `GITHUB_TOKEN`, so a successful prompt injection could exfiltrate repo metadata").

## `delegates_to` (INFORMATIONAL, v0.3)

```yaml
delegates_to:
  - https://other.example.com/.well-known/airlock.yaml
```

A transitive trust surface — this agent may dispatch sub-work to the listed Airlock contracts. Consumers who accept this agent's promises implicitly accept the delegates' promises too; they should fetch the linked contracts and reason about the chain.

## `authority` rules (BINDING)

Every authority rule self-classifies as `deterministic` or `judgment`. The classification controls which codes the rule may produce — PROMISE codes for deterministic rules, ESTIMATE codes for judgment rules. Each rule targets **exactly one** of `skill` or `tool`.

```yaml
authority:
  # Skill-targeted (existing pattern):
  - id: analyze-within-workspace
    skill: analyze_code
    binding_class: deterministic
    when: "matches(input.path, '^[^/]')"
    then:
      code: ACCEPTED_BY_RULE
      action: UNILATERAL_COMMIT
    else:
      code: OUT_OF_SCOPE

  # Tool-targeted (v0.3):
  - id: bash-refuse-rm-rf
    tool: bash
    binding_class: deterministic
    when: 'matches(tool.command, "rm\\s+-rf")'
    then:
      code: REFUSED_BY_POLICY
      message: bash tool will not execute recursive deletes.
```

For tool-targeted rules, the expression bindings expose the tool args as both `input` and `tool` (authors can use whichever reads cleaner).

Express the "auto-accept band + escalation" pattern by **splitting it into two rules** — one deterministic for the safe range, one judgment for the rest. Authority rules are evaluated in declaration order; the first matching `when` produces the verdict.

The validator enforces these invariants:

1. **`then.code` and `else.code` must match the rule's `binding_class`.** Deterministic rule producing an ESTIMATE code (or vice versa) fails the lint with rule `binding-class-vs-code`.
2. **Exactly one of `skill` or `tool` must be set.** Structural validation rejects both-set and neither-set.
3. **`skill`/`tool` must reference a declared id.** Lint rules `skill-ref` / `tool-ref`.
4. **Deterministic rules may not reference runtime state.** Skill-targeted rules may only reference `input.*`; tool-targeted rules may reference `input.*` or `tool.*`.

## `instant_failures` (BINDING)

Reject-on-sight conditions. By construction they produce PROMISE codes (Phase 1 / Phase 2 only).

```yaml
instant_failures:
  - id: missing-path
    when: "input.path == null"
    code: MISSING_INPUT
    skill: analyze_code
```

Instant failures evaluate before any authority rule and short-circuit the rest of the pipeline.

## `actions` (BINDING)

Catalog of action codes (Phase 6) this agent may take in real responses.

```yaml
actions:
  exposes:
    - UNILATERAL_COMMIT
    - ESCALATED_TO_HUMAN
```

## `sla` (BINDING)

Per-skill or per-tool response-time commitments. Keys may be bare (back-compat shorthand for `skill:<id>`), `skill:<id>`, or `tool:<id>`.

```yaml
sla:
  analyze_code:        { respond_within: "30s", on_breach: ESCALATED_TO_HUMAN }
  "tool:bash":         { respond_within: "30s", on_breach: FAILED }
```

## `lifecycle` (BINDING)

```yaml
lifecycle:
  states: [SUBMITTED, WORKING, COMPLETED, FAILED]
```

## `deprecation` (BINDING)

Set when this contract version is being phased out. Pre-flight against a deprecated contract returns `OUT_OF_SCOPE` with the redirect in `detail`.

```yaml
deprecation:
  replaced_by_url: "https://example.com/.well-known/airlock.yaml"
  sunset: "2026-12-31"
  reason: "Migrated to v0.4 with revised authority rules."
```

## Expression language

Used in `authority[].when` and `instant_failures[].when`.

**Allowed:**

- Comparisons: `==`, `!=`, `<`, `<=`, `>`, `>=`
- Arithmetic: `+`, `-`, `*`, `/`, `%`
- Logical: `and`, `or`, `not`
- Field references: `input.<path>` (always); `tool.<path>` (tool-targeted rules only)
- Helpers: `abs(x)`, `min(a, b)`, `max(a, b)`, `len(x)`, `matches(string, regex)`
- Literal values: numbers, strings, booleans, `null`

**Forbidden:**

- Loops, function definitions, lambda
- Network or I/O calls
- Anything Turing-complete

Regex in `matches()` is JavaScript `RegExp` — use `\s+`, `\d+`, etc., not POSIX `[[:space:]]`. In YAML, single-quoted outer strings with double-quoted inner regex (`'matches(tool.command, "rm\\s+-rf")'`) avoids escape ambiguity.

## Sandbox response semantics

Every sandbox response carries the standard verdict envelope. For `POST /skills/<id>` and `POST /tools/<id>`, the response also includes a `detail` payload synthesized by one of two paths:

1. **Example replay** — `X-Airlock-Detail-Source: example`. The first authored example whose `expected_verdict.code` matches the computed verdict provides the body verbatim.
2. **Schema-derived faker** — `X-Airlock-Detail-Source: synthesized`. When no example matches, the faker walks the output JSON Schema, seeded by a hash of the input, and echoes same-named input fields. Same input → same body. See ADR 0005.

`POST /preflight/<id>` and `POST /preflight-tool/<id>` skip the synthesis and return only the verdict.

## Status code summary

| Phase | Codes | Where they appear in the contract |
|---|---|---|
| 1. Identification (PROMISE) | `OUT_OF_SCOPE`, `WRONG_AGENT`, `UNAUTHENTICATED`, `UNAUTHORIZED` | `instant_failures[].code` |
| 2. Input validation (PROMISE) | `SCHEMA_INVALID`, `MISSING_INPUT`, `MALFORMED_INPUT` | `instant_failures[].code` |
| 3. Deterministic rules (PROMISE) | `ACCEPTED_BY_RULE`, `REFUSED_BY_POLICY`, `RATE_LIMITED` | `authority[].then.code` / `else.code` (when `binding_class: deterministic`) |
| 4. Soft outcomes (ESTIMATE) | `ACCEPTED_LIKELY`, `COUNTER_OFFER_LIKELY`, `HUMAN_REVIEW_LIKELY`, `DEPENDS_ON_STATE` | `authority[].then.code` / `else.code` (when `binding_class: judgment`) |
| 5. Lifecycle (real responses) | `SUBMITTED`, `WORKING`, `INPUT_REQUIRED`, `COMPLETED`, `FAILED`, `CANCELED`, `ESCALATED` | `lifecycle.states` |
| 6. Actions taken (real responses) | `UNILATERAL_COMMIT`, `COUNTER_OFFER`, `PARTIAL_FULFILLMENT`, `ESCALATED_TO_HUMAN` | `actions.exposes`, `authority[].then.action` |

## Minimal valid contract

```yaml
airlock: "0.3"
agent:
  name: hello-agent
  version: 0.1.0
skills:
  - id: ping
    input:  { type: object }
    output: { type: object, properties: { pong: { type: boolean } } }
```

No tools, no permissions, no harness block. The minimal contract is still legal in v0.3 — none of the new blocks are required.

## Validator semantics

The validator runs three passes:

1. **Version gate** — `airlock: "0.1"` or `"0.2"` is rejected with a pointer to [`docs/migration-v01-to-v03.md`](./migration-v01-to-v03.md).
2. **Structural** — JSON Schema validation against `schema/airlock.schema.json`. Catches missing required fields, type errors, illegal codes, mutually-exclusive constraints (e.g. an authority rule with both `skill` and `tool`).
3. **Semantic lint** — additional checks JSON Schema can't express:
   - Every `authority[].skill`/`tool`, `instant_failures[].skill`, `hooks[].skill`/`tool`, `tools[].source.server`, and `sla` key references something that exists.
   - Every `then.code`/`else.code` matches its rule's `binding_class`.
   - Every `when` expression parses and only calls whitelisted helpers.
   - Every `when` expression in a deterministic rule references only `input.*` (skill-targeted) or `input.*`/`tool.*` (tool-targeted).
   - Permission short-form strings parse and use a known resource (unknown resources are warnings).
   - Example `binding` matches its `code` phase.

A passing validation is the first "this is a real Airlock contract" signal. Conformance against a real agent comes later, and asserts binding blocks only.
