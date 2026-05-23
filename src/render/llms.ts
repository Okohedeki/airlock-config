/**
 * Render an Airlock contract as a single LLM-friendly markdown bundle (llms.txt).
 *
 * Goal: a consuming LLM agent fetches this once and has everything it needs to
 * integrate — skill list, schemas, codes, examples, authority rules, sample
 * calls. Optimized for reading, not for browsing.
 */

import type {
  AirlockContract,
  AuthorityRule,
  InstantFailure,
  Skill,
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

  out.push("## Skills");
  out.push("");
  for (const skill of contract.skills) {
    out.push(...renderSkill(skill, contract));
    out.push("");
  }

  if (contract.authority && contract.authority.length > 0) {
    out.push("## Authority rules (evaluated in order; first match wins)");
    out.push("");
    for (const rule of contract.authority) {
      out.push(...renderRule(rule));
    }
    out.push("");
  }

  if (contract.instant_failures && contract.instant_failures.length > 0) {
    out.push("## Instant failures (evaluated before authority rules)");
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
  out.push("2. Before any real call, run pre-flight (`POST /preflight/<skill>`) to predict the outcome.");
  out.push("3. If pre-flight returns a PROMISE verdict, you can plan multi-step workflows on it.");
  out.push("4. If pre-flight returns an ESTIMATE verdict, treat it as a hint — verify with the real call.");
  out.push("5. Always pass the exact input schema declared by the skill. Use `MISSING_INPUT` / `SCHEMA_INVALID` errors to debug.");

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

function renderRule(rule: AuthorityRule): string[] {
  const out: string[] = [];
  const bindingLabel = rule.binding_class === "deterministic" ? "PROMISE" : "ESTIMATE";
  out.push(
    `- **\`${rule.id}\`** on \`${rule.skill}\` — *${rule.binding_class}* → ${bindingLabel}`,
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
