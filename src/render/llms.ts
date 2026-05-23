/**
 * Render an Airlock contract as a single LLM-friendly markdown bundle (llms.txt).
 *
 * Goal: a consuming LLM agent fetches this once and has everything it needs to
 * integrate — skill list, tools, hooks, permissions, guardrails, schemas,
 * codes, examples, authority rules, sample calls. Optimized for reading,
 * not for browsing.
 */

import type {
  AirlockContract,
  AuthorityRule,
  Guardrails,
  Hook,
  InstantFailure,
  MCPServer,
  PermissionEntry,
  Permissions,
  SecretDecl,
  Skill,
  Tool,
} from "../validate/types.js";

export function renderLLMs(contract: AirlockContract, opts: { contractURL?: string } = {}): string {
  const out: string[] = [];

  out.push(`# ${contract.agent.name}`);
  out.push("");
  out.push(`> ${contract.agent.description ?? "(no description)"}`);
  out.push("");
  out.push("## Metadata");
  out.push("");
  out.push(`- Contract version: \`${contract.agent.version}\``);
  out.push(`- Airlock spec: \`${contract.airlock}\``);
  if (contract.agent.channels) out.push(`- Channels: \`${contract.agent.channels.join(", ")}\``);
  if (contract.agent.homepage) out.push(`- Homepage: ${contract.agent.homepage}`);
  if (opts.contractURL) out.push(`- Machine spec: ${opts.contractURL}`);
  out.push("");

  if (contract.agent.harness) {
    const h = contract.agent.harness;
    out.push("## Harness (informational)");
    out.push("");
    out.push("This block describes the deployment serving the contract. Per ADR 0004 it is not load-bearing — the publisher may swap framework/model/runtime in a minor version.");
    out.push("");
    if (h.framework) out.push(`- Framework: \`${h.framework}\``);
    if (h.model) out.push(`- Model: \`${h.model}\``);
    if (h.runtime) out.push(`- Runtime: \`${h.runtime}\``);
    if (h.limits) {
      const l = h.limits;
      if (l.max_tokens !== undefined) out.push(`- limits.max_tokens: \`${l.max_tokens}\``);
      if (l.max_turns !== undefined) out.push(`- limits.max_turns: \`${l.max_turns}\``);
      if (l.max_tool_calls_per_turn !== undefined) out.push(`- limits.max_tool_calls_per_turn: \`${l.max_tool_calls_per_turn}\``);
      if (l.timeout) out.push(`- limits.timeout: \`${l.timeout}\``);
    }
    out.push("");
  }

  out.push("## How to call this agent");
  out.push("");
  out.push("Every skill accepts `POST` requests with a JSON body. Every response carries:");
  out.push("");
  out.push("```json");
  out.push("{");
  out.push('  "code": "ACCEPTED_BY_RULE | OUT_OF_SCOPE | COUNTER_OFFER_LIKELY | ...",');
  out.push('  "binding": "PROMISE | ESTIMATE",');
  out.push('  "reason": "human/agent-readable explanation",');
  out.push('  "ref": "the rule or instant_failure that produced this verdict",');
  out.push('  "action": "UNILATERAL_COMMIT | COUNTER_OFFER | ... (optional)",');
  out.push('  "detail": "<structured payload — synthesized response, counter terms, etc.>"');
  out.push("}");
  out.push("```");
  out.push("");
  out.push("- **PROMISE** codes are bound by the publisher. If the real agent ever diverges, that is a public conformance violation.");
  out.push("- **ESTIMATE** codes are predictions. The real response may differ.");
  out.push("");
  out.push("For a pre-flight verdict without side effects, use `POST /preflight/<skill_id>` with the same body.");
  out.push("");
  out.push("Sandbox responses set the `X-Airlock-Detail-Source` header to `example` (authored example replay) or `synthesized` (deterministic schema-derived faker — see ADR 0005).");
  out.push("");

  out.push("## Skills (binding)");
  out.push("");
  for (const skill of contract.skills) {
    out.push(...renderSkill(skill, contract));
    out.push("");
  }

  if (contract.tools && contract.tools.length > 0) {
    out.push("## Tools (binding)");
    out.push("");
    out.push("Capabilities the harness invokes internally. Differs from skills (external) — but consumers can pre-flight a tool invocation via `POST /preflight-tool/<tool_id>`.");
    out.push("");
    for (const tool of contract.tools) {
      out.push(...renderTool(tool));
      out.push("");
    }
  }

  if (contract.hooks && contract.hooks.length > 0) {
    out.push("## Hooks (binding)");
    out.push("");
    out.push("Lifecycle interception points. `mode` is load-bearing: `observe` is read-only, `mutate` may rewrite payloads, `block` may halt the action.");
    out.push("");
    for (const hook of contract.hooks) {
      out.push(renderHook(hook));
    }
    out.push("");
  }

  if (contract.permissions) {
    out.push(...renderPermissions(contract.permissions));
    out.push("");
  }

  if (contract.guardrails) {
    out.push(...renderGuardrails(contract.guardrails));
    out.push("");
  }

  if (contract.mcp_servers && contract.mcp_servers.length > 0) {
    out.push("## MCP servers (informational)");
    out.push("");
    for (const s of contract.mcp_servers) {
      out.push(renderMCPServer(s));
    }
    out.push("");
  }

  if (contract.secrets && contract.secrets.length > 0) {
    out.push("## Secrets (informational)");
    out.push("");
    out.push("Named env-vars or credentials the harness reads. Values are never disclosed.");
    out.push("");
    for (const s of contract.secrets) {
      out.push(renderSecret(s));
    }
    out.push("");
  }

  if (contract.delegates_to && contract.delegates_to.length > 0) {
    out.push("## Delegation (informational)");
    out.push("");
    out.push("This agent may dispatch sub-work to the following Airlock contracts. Consumers should fetch each and reason about the trust chain.");
    out.push("");
    for (const url of contract.delegates_to) {
      out.push(`- ${url}`);
    }
    out.push("");
  }

  if (contract.authority && contract.authority.length > 0) {
    out.push("## Authority rules (binding; evaluated in order; first match wins)");
    out.push("");
    for (const rule of contract.authority) {
      out.push(...renderRule(rule));
    }
    out.push("");
  }

  if (contract.instant_failures && contract.instant_failures.length > 0) {
    out.push("## Instant failures (binding; evaluated before authority rules)");
    out.push("");
    for (const failure of contract.instant_failures) {
      out.push(...renderFailure(failure));
    }
    out.push("");
  }

  out.push("## Status code reference");
  out.push("");
  out.push("| Phase | Codes | Binding |");
  out.push("|---|---|---|");
  out.push("| 1. Identification | OUT_OF_SCOPE, WRONG_AGENT, UNAUTHENTICATED, UNAUTHORIZED | PROMISE |");
  out.push("| 2. Input validation | SCHEMA_INVALID, MISSING_INPUT, MALFORMED_INPUT | PROMISE |");
  out.push("| 3. Deterministic rules | ACCEPTED_BY_RULE, REFUSED_BY_POLICY, RATE_LIMITED | PROMISE |");
  out.push("| 4. Soft outcomes | ACCEPTED_LIKELY, COUNTER_OFFER_LIKELY, HUMAN_REVIEW_LIKELY, DEPENDS_ON_STATE | ESTIMATE |");
  out.push("| 5. Lifecycle (real responses) | SUBMITTED, WORKING, INPUT_REQUIRED, COMPLETED, FAILED, CANCELED, ESCALATED | n/a |");
  out.push("| 6. Actions taken (real responses) | UNILATERAL_COMMIT, COUNTER_OFFER, PARTIAL_FULFILLMENT, ESCALATED_TO_HUMAN | n/a |");
  out.push("");

  out.push("## Integration tips for consuming agents");
  out.push("");
  out.push("1. Fetch the contract from `/.well-known/airlock.yaml` to get the machine spec.");
  out.push("2. Before any real call, run pre-flight (`POST /preflight/<skill>` or `POST /preflight-tool/<tool>`) to predict the outcome.");
  out.push("3. If pre-flight returns a PROMISE verdict, you can plan multi-step workflows on it.");
  out.push("4. If pre-flight returns an ESTIMATE verdict, treat it as a hint — verify with the real call.");
  out.push("5. Always pass the exact input schema declared by the skill. Use `MISSING_INPUT` / `SCHEMA_INVALID` errors to debug.");
  out.push("6. Read the permissions and guardrails blocks before integrating — anything in `disallowed` will be refused statically.");

  return out.join("\n") + "\n";
}

function renderSkill(skill: Skill, _contract: AirlockContract): string[] {
  const out: string[] = [];
  out.push(`### ${skill.id} — \`POST /skills/${skill.id}\``);
  out.push("");
  if (skill.description) {
    out.push(skill.description);
    out.push("");
  }
  out.push("**Input schema:**");
  out.push("");
  out.push("```json");
  out.push(JSON.stringify(skill.input, null, 2));
  out.push("```");
  out.push("");
  out.push("**Output schema (on success):**");
  out.push("");
  out.push("```json");
  out.push(JSON.stringify(skill.output, null, 2));
  out.push("```");
  if (skill.examples && skill.examples.length > 0) {
    out.push("");
    out.push("**Examples:**");
    out.push("");
    for (const ex of skill.examples) {
      out.push(`- **${ex.name ?? "example"}**${ex.description ? ` — ${ex.description}` : ""}`);
      out.push("  ```json");
      out.push(`  // input`);
      out.push("  " + JSON.stringify(ex.in, null, 2).split("\n").join("\n  "));
      out.push("  ```");
      if (ex.expected_verdict) {
        out.push(`  Expected verdict: \`${ex.expected_verdict.code}\`${ex.expected_verdict.binding ? ` (${ex.expected_verdict.binding})` : ""}${ex.expected_verdict.ref ? ` via rule \`${ex.expected_verdict.ref}\`` : ""}`);
      }
      if (ex.out !== undefined) {
        out.push("  Synthesized response:");
        out.push("  ```json");
        out.push("  " + JSON.stringify(ex.out, null, 2).split("\n").join("\n  "));
        out.push("  ```");
      }
    }
  }
  return out;
}

function renderTool(t: Tool): string[] {
  const out: string[] = [];
  out.push(`### ${t.id} — \`POST /tools/${t.id}\``);
  out.push("");
  if (t.description) {
    out.push(t.description);
    out.push("");
  }
  if (t.side_effects && t.side_effects.length > 0) {
    out.push(`- Side effects: ${t.side_effects.map((e) => `\`${e}\``).join(", ")}`);
  }
  if (t.source) {
    out.push(`- Source: \`${t.source.kind}\`${t.source.server ? ` (server \`${t.source.server}\`)` : ""}`);
  }
  if (t.limits) {
    const bits: string[] = [];
    if (t.limits.timeout) bits.push(`timeout \`${t.limits.timeout}\``);
    if (t.limits.max_calls_per_skill !== undefined) bits.push(`max \`${t.limits.max_calls_per_skill}\` calls/skill`);
    if (bits.length > 0) out.push(`- Limits: ${bits.join(", ")}`);
  }
  out.push("");
  out.push("**Input schema:**");
  out.push("");
  out.push("```json");
  out.push(JSON.stringify(t.input_schema, null, 2));
  out.push("```");
  if (t.output_schema) {
    out.push("");
    out.push("**Output schema:**");
    out.push("");
    out.push("```json");
    out.push(JSON.stringify(t.output_schema, null, 2));
    out.push("```");
  }
  return out;
}

function renderHook(h: Hook): string {
  const scope = h.skill ? ` (skill \`${h.skill}\`)` : h.tool ? ` (tool \`${h.tool}\`)` : "";
  return `- \`${h.event}\` — mode \`${h.mode}\`${scope}${h.description ? ` — ${h.description}` : ""}`;
}

function renderPermissions(p: Permissions): string[] {
  const out: string[] = [];
  out.push("## Permissions (binding)");
  out.push("");
  out.push("Static allow/disallow against typed resources. Resource taxonomy: `fs`, `network`, `tool`, `mcp`, `env`, `secret`.");
  out.push("");
  const bucket = (label: string, entries: PermissionEntry[] | undefined) => {
    if (!entries || entries.length === 0) return;
    out.push(`**${label}:**`);
    out.push("");
    for (const e of entries) {
      const formatted = typeof e === "string"
        ? e
        : `${e.op === "*" ? e.resource : `${e.resource}.${e.op}`}${e.scope ? `:${e.scope}` : ""}`;
      const reason = typeof e !== "string" && e.reason ? ` — ${e.reason}` : "";
      out.push(`- \`${formatted}\`${reason}`);
    }
    out.push("");
  };
  bucket("Allowed", p.allowed);
  bucket("Disallowed", p.disallowed);
  return out;
}

function renderGuardrails(g: Guardrails): string[] {
  const out: string[] = [];
  out.push("## Guardrails (binding)");
  out.push("");
  out.push("Categorical refusals at the agent level; coarser than authority rules.");
  out.push("");
  if (g.refused_topics && g.refused_topics.length > 0) {
    out.push(`- Refused topics: ${g.refused_topics.map((t) => `\`${t}\``).join(", ")}`);
  }
  if (g.refused_actions && g.refused_actions.length > 0) {
    out.push(`- Refused actions: ${g.refused_actions.map((t) => `\`${t}\``).join(", ")}`);
  }
  if (g.required_authentication !== undefined) {
    out.push(`- Requires authentication: \`${g.required_authentication}\``);
  }
  return out;
}

function renderMCPServer(s: MCPServer): string {
  const bits: string[] = [`\`${s.name}\``];
  if (s.endpoint) bits.push(`endpoint \`${s.endpoint}\``);
  if (s.auth_posture) bits.push(`auth \`${s.auth_posture}\``);
  if (s.allowed_tools && s.allowed_tools.length > 0) {
    bits.push(`exposes \`${s.allowed_tools.join(", ")}\``);
  } else {
    bits.push("exposes all tools");
  }
  return `- ${bits.join(" · ")}`;
}

function renderSecret(s: SecretDecl): string {
  return `- \`${s.name}\`${s.purpose ? ` — ${s.purpose}` : ""}`;
}

function renderRule(rule: AuthorityRule): string[] {
  const out: string[] = [];
  const bindingLabel = rule.binding_class === "deterministic" ? "PROMISE" : "ESTIMATE";
  const target = rule.skill
    ? `on skill \`${rule.skill}\``
    : rule.tool
      ? `on tool \`${rule.tool}\``
      : "(no target)";
  out.push(
    `- **\`${rule.id}\`** ${target} — *${rule.binding_class}* → ${bindingLabel}`,
  );
  if (rule.description) {
    out.push(`  ${rule.description.split("\n").join("\n  ")}`);
  }
  out.push(`  WHEN \`${rule.when}\` → \`${rule.then.code}\`${rule.then.action ? ` + ${rule.then.action}` : ""}`);
  if (rule.else) {
    out.push(`  ELSE → \`${rule.else.code}\`${rule.else.action ? ` + ${rule.else.action}` : ""}`);
  }
  return out;
}

function renderFailure(f: InstantFailure): string[] {
  const out: string[] = [];
  out.push(`- **\`${f.id}\`**${f.skill ? ` (on \`${f.skill}\`)` : ""}: WHEN \`${f.when}\` → \`${f.code}\``);
  if (f.message) out.push(`  *${f.message}*`);
  return out;
}
