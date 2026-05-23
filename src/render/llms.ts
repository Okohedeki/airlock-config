/**
 * Render an Airlock contract as a single LLM-friendly markdown bundle (llms.txt).
 *
 * Optimized for a consuming AI agent to read once and have everything it needs
 * to decide whether to integrate: category, region, compliance, auth, pricing,
 * skills, rules, codes.
 */

import type {
  AirlockContract,
  AuthorityRule,
  AuthModel,
  Category,
  ComplianceEntry,
  Guardrails,
  InstantFailure,
  Permissions,
  Pricing,
  Region,
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

  out.push(...renderCategory(contract.category, contract.tags));
  if (contract.region) out.push(...renderRegion(contract.region));
  if (contract.compliance && contract.compliance.length > 0) out.push(...renderCompliance(contract.compliance));
  if (contract.auth_model) out.push(...renderAuthModel(contract.auth_model));
  if (contract.pricing) out.push(...renderPricing(contract.pricing));
  if (contract.permissions) out.push(...renderPermissions(contract.permissions));
  if (contract.guardrails) out.push(...renderGuardrails(contract.guardrails));

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
  out.push("- **PROMISE** codes are bound by the publisher. Divergence is a public conformance violation.");
  out.push("- **ESTIMATE** codes are predictions.");
  out.push("");
  out.push("For a pre-flight verdict without side effects, use `POST /preflight/<skill_id>`.");
  out.push("Sandbox responses set `X-Airlock-Detail-Source` to `example` (authored example replay) or `synthesized` (deterministic schema-derived faker, ADR 0005).");
  out.push("");

  out.push("## Skills (binding)");
  out.push("");
  for (const skill of contract.skills) {
    out.push(...renderSkill(skill, contract));
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
  out.push("1. Pre-filter the registry on `category.industry` + `category.capability` + (if relevant) `region.serves_regions` and `compliance[].standard`.");
  out.push("2. Read this agent's `auth_model.enrollment` to know if you can self-serve or need approval.");
  out.push("3. Read `pricing.model` to pre-filter on commercial fit before hitting the price URL.");
  out.push("4. Before any real call, run pre-flight (`POST /preflight/<skill>`) to predict the outcome.");
  out.push("5. Treat PROMISE verdicts as bindable plan steps; treat ESTIMATE verdicts as best-guess hints to verify with the real call.");
  out.push("6. Read `guardrails.refused_topics` and `refused_actions` before integrating — anything listed will be refused statically.");

  return out.join("\n") + "\n";
}

function renderCategory(cat: Category, tags: string[] | undefined): string[] {
  const out: string[] = [];
  out.push("## Category (binding)");
  out.push("");
  out.push(`- Industry: \`${cat.industry}\``);
  out.push(`- Capability: \`${cat.capability}\``);
  if (cat.subcategory) out.push(`- Subcategory: \`${cat.subcategory}\``);
  if (tags && tags.length > 0) out.push(`- Tags: ${tags.map((t) => `\`${t}\``).join(", ")}`);
  out.push("");
  return out;
}

function renderRegion(r: Region): string[] {
  const out: string[] = [];
  out.push("## Region (binding)");
  out.push("");
  if (r.data_residency && r.data_residency.length > 0) {
    out.push(`- Data residency: ${r.data_residency.map((x) => `\`${x}\``).join(", ")}`);
  }
  if (r.serves_regions && r.serves_regions.length > 0) {
    out.push(`- Serves regions: ${r.serves_regions.map((x) => `\`${x}\``).join(", ")}`);
  }
  out.push("");
  return out;
}

function renderCompliance(entries: ComplianceEntry[]): string[] {
  const out: string[] = [];
  out.push("## Compliance (binding)");
  out.push("");
  out.push("| Standard | Status | Verified | Attestation |");
  out.push("|---|---|---|---|");
  for (const e of entries) {
    const att = e.attestation_url ? `[link](${e.attestation_url})` : "";
    out.push(`| \`${e.standard}\` | \`${e.status}\` | ${e.verified_at ?? ""} | ${att} |`);
  }
  out.push("");
  return out;
}

function renderAuthModel(a: AuthModel): string[] {
  const out: string[] = [];
  out.push("## Auth & enrolment (binding)");
  out.push("");
  out.push(`- Methods: ${a.methods.map((m) => `\`${m}\``).join(", ")}`);
  out.push(`- Enrolment: \`${a.enrollment}\``);
  if (a.support_url) out.push(`- Enrol here: ${a.support_url}`);
  out.push("");
  return out;
}

function renderPricing(p: Pricing): string[] {
  const out: string[] = [];
  out.push("## Pricing (binding model + unit; informational price_url)");
  out.push("");
  out.push(`- Model: \`${p.model}\``);
  if (p.unit) out.push(`- Unit: \`${p.unit}\``);
  if (p.currency) out.push(`- Currency: \`${p.currency}\``);
  if (p.price_url) out.push(`- Commercial terms: ${p.price_url}`);
  if (p.free_tier) {
    out.push(`- Free tier: ${p.free_tier.description ?? ""}${p.free_tier.limits ? ` (limits: ${p.free_tier.limits})` : ""}`);
  }
  out.push("");
  return out;
}

function renderPermissions(p: Permissions): string[] {
  const out: string[] = [];
  out.push("## Data access (binding)");
  out.push("");
  if (p.pii) out.push(`- PII exposure: \`${p.pii}\``);
  if (p.data_classes && p.data_classes.length > 0) out.push(`- Data classes: ${p.data_classes.map((c) => `\`${c}\``).join(", ")}`);
  if (p.retention) out.push(`- Retention: \`${p.retention}\``);
  if (p.third_party_sharing) out.push(`- Third-party sharing: \`${p.third_party_sharing}\``);
  out.push("");
  return out;
}

function renderGuardrails(g: Guardrails): string[] {
  const out: string[] = [];
  out.push("## Guardrails (binding)");
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
  out.push("");
  return out;
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
        out.push("  Synthesised response:");
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
  out.push(`- **\`${rule.id}\`** on skill \`${rule.skill}\` — *${rule.binding_class}* → ${bindingLabel}`);
  if (rule.summary) out.push(`  > ${rule.summary}`);
  if (rule.description) out.push(`  ${rule.description.split("\n").join("\n  ")}`);
  out.push(`  WHEN \`${rule.when}\` → \`${rule.then.code}\`${rule.then.action ? ` + ${rule.then.action}` : ""}`);
  if (rule.else) {
    out.push(`  ELSE → \`${rule.else.code}\`${rule.else.action ? ` + ${rule.else.action}` : ""}`);
  }
  if (rule.keywords && rule.keywords.length > 0) {
    out.push(`  keywords: ${rule.keywords.map((k) => `\`${k}\``).join(", ")}`);
  }
  return out;
}

function renderFailure(f: InstantFailure): string[] {
  const out: string[] = [];
  out.push(`- **\`${f.id}\`**${f.skill ? ` (on \`${f.skill}\`)` : ""}: WHEN \`${f.when}\` → \`${f.code}\``);
  if (f.summary) out.push(`  > ${f.summary}`);
  if (f.message) out.push(`  *${f.message}*`);
  if (f.keywords && f.keywords.length > 0) {
    out.push(`  keywords: ${f.keywords.map((k) => `\`${k}\``).join(", ")}`);
  }
  return out;
}
