/**
 * Semantic lint: pass 2 of the validator. Catches semantic problems that JSON
 * Schema cannot express. Assumes the input has already passed structural
 * validation, so types are sound.
 *
 * Still deferred (needs JSON-Schema-aware field resolution):
 *   - Check `when` field references resolve against the targeted skill/tool schema
 */

import type {
  AirlockContract,
  AuthorityRule,
  Example,
  PermissionEntry,
  PermissionResource,
  RuleOutcome,
  StatusCode,
} from "./types.js";
import {
  ESTIMATE_CODES,
  PERMISSION_RESOURCES,
  PROMISE_CODES,
} from "./types.js";
import {
  ParseError,
  calledFunctions,
  parseExpression,
  rootBindings,
  HELPERS,
} from "../expr/index.js";

export type LintFinding = {
  level: "error" | "warning";
  path: string;
  message: string;
  rule: string;
};

export type LintResult =
  | { ok: true; findings: LintFinding[] }
  | { ok: false; findings: LintFinding[] };

const ALLOWED_HELPERS = new Set(Object.keys(HELPERS));

export function lintContract(contract: AirlockContract): LintResult {
  const findings: LintFinding[] = [];

  const skillIds = new Set(contract.skills.map((s) => s.id));
  const toolIds = new Set((contract.tools ?? []).map((t) => t.id));
  const mcpServerNames = new Set((contract.mcp_servers ?? []).map((s) => s.name));
  const declaredActions = new Set(contract.actions?.exposes ?? []);

  contract.authority?.forEach((rule, idx) => {
    findings.push(
      ...lintAuthorityRule(rule, idx, skillIds, toolIds, declaredActions),
    );
  });

  contract.instant_failures?.forEach((failure, idx) => {
    if (failure.skill && !skillIds.has(failure.skill)) {
      findings.push({
        level: "error",
        path: `/instant_failures/${idx}/skill`,
        message: `instant_failures[${idx}] (${failure.id}) references unknown skill "${failure.skill}"`,
        rule: "skill-ref",
      });
    }
    findings.push(
      ...lintWhenExpression(
        failure.when,
        `/instant_failures/${idx}/when`,
        `instant_failures[${idx}] (${failure.id})`,
        true, // instant_failures must be deterministic by construction
        ["input"],
      ),
    );
  });

  contract.skills.forEach((skill, sIdx) => {
    skill.examples?.forEach((example, eIdx) => {
      const finding = lintExample(example, sIdx, eIdx, skill.id);
      if (finding) findings.push(finding);
    });
  });

  contract.hooks?.forEach((hook, idx) => {
    if (hook.skill && !skillIds.has(hook.skill)) {
      findings.push({
        level: "error",
        path: `/hooks/${idx}/skill`,
        message: `hooks[${idx}] (${hook.event}) references unknown skill "${hook.skill}"`,
        rule: "skill-ref",
      });
    }
    if (hook.tool && !toolIds.has(hook.tool)) {
      findings.push({
        level: "error",
        path: `/hooks/${idx}/tool`,
        message: `hooks[${idx}] (${hook.event}) references unknown tool "${hook.tool}"`,
        rule: "tool-ref",
      });
    }
  });

  contract.tools?.forEach((tool, idx) => {
    if (tool.source?.kind === "mcp") {
      if (!tool.source.server) {
        findings.push({
          level: "error",
          path: `/tools/${idx}/source/server`,
          message: `tools[${idx}] (${tool.id}) has source.kind=mcp but no source.server`,
          rule: "tool-source-mcp-server-missing",
        });
      } else if (!mcpServerNames.has(tool.source.server)) {
        findings.push({
          level: "error",
          path: `/tools/${idx}/source/server`,
          message: `tools[${idx}] (${tool.id}) references unknown mcp_server "${tool.source.server}"`,
          rule: "mcp-server-ref",
        });
      }
    }
  });

  contract.permissions?.allowed?.forEach((entry, idx) => {
    const f = lintPermissionEntry(entry, `/permissions/allowed/${idx}`, "allowed", idx);
    if (f) findings.push(f);
  });
  contract.permissions?.disallowed?.forEach((entry, idx) => {
    const f = lintPermissionEntry(entry, `/permissions/disallowed/${idx}`, "disallowed", idx);
    if (f) findings.push(f);
  });

  contract.sla &&
    Object.keys(contract.sla).forEach((key) => {
      const id = key.startsWith("skill:") || key.startsWith("tool:")
        ? key.slice(key.indexOf(":") + 1)
        : key;
      const kind = key.startsWith("tool:") ? "tool" : "skill";
      const lookup = kind === "tool" ? toolIds : skillIds;
      if (!lookup.has(id)) {
        findings.push({
          level: "error",
          path: `/sla/${key}`,
          message: `sla key "${key}" references unknown ${kind} "${id}"`,
          rule: "sla-ref",
        });
      }
    });

  const hasError = findings.some((f) => f.level === "error");
  return hasError ? { ok: false, findings } : { ok: true, findings };
}

function lintAuthorityRule(
  rule: AuthorityRule,
  idx: number,
  skillIds: ReadonlySet<string>,
  toolIds: ReadonlySet<string>,
  declaredActions: ReadonlySet<string>,
): LintFinding[] {
  const findings: LintFinding[] = [];
  const base = `/authority/${idx}`;

  const target = rule.skill ? { kind: "skill" as const, id: rule.skill }
    : rule.tool ? { kind: "tool" as const, id: rule.tool }
    : null;

  if (!target) {
    findings.push({
      level: "error",
      path: base,
      message: `authority[${idx}] (${rule.id}) must target either a skill or a tool`,
      rule: "target-missing",
    });
  } else {
    const lookup = target.kind === "skill" ? skillIds : toolIds;
    if (!lookup.has(target.id)) {
      findings.push({
        level: "error",
        path: `${base}/${target.kind}`,
        message: `authority[${idx}] (${rule.id}) references unknown ${target.kind} "${target.id}"`,
        rule: `${target.kind}-ref`,
      });
    }
  }

  findings.push(
    ...lintOutcomeCode(rule, rule.then, idx, "then", declaredActions),
  );
  if (rule.else) {
    findings.push(
      ...lintOutcomeCode(rule, rule.else, idx, "else", declaredActions),
    );
  }

  // Tool-targeted rules may reference `tool.<field>`; skill-targeted rules use `input.<field>`.
  const allowedRoots = target?.kind === "tool" ? ["input", "tool"] : ["input"];

  findings.push(
    ...lintWhenExpression(
      rule.when,
      `${base}/when`,
      `authority[${idx}] (${rule.id})`,
      rule.binding_class === "deterministic",
      allowedRoots,
    ),
  );

  return findings;
}

/**
 * Lint a `when` expression: must parse; must only call whitelisted helpers;
 * if `mustBeDeterministic`, may only reference roots in `allowedRoots` (no runtime state).
 */
function lintWhenExpression(
  source: string,
  path: string,
  label: string,
  mustBeDeterministic: boolean,
  allowedRoots: readonly string[],
): LintFinding[] {
  const findings: LintFinding[] = [];

  let ast;
  try {
    ast = parseExpression(source);
  } catch (err) {
    const message = err instanceof ParseError ? err.message : String(err);
    findings.push({
      level: "error",
      path,
      message: `${label} has an invalid when expression: ${message}`,
      rule: "when-parse",
    });
    return findings;
  }

  for (const fn of calledFunctions(ast)) {
    if (!ALLOWED_HELPERS.has(fn)) {
      findings.push({
        level: "error",
        path,
        message:
          `${label} calls unknown function "${fn}". ` +
          `Allowed: ${[...ALLOWED_HELPERS].sort().join(", ")}.`,
        rule: "when-unknown-helper",
      });
    }
  }

  if (mustBeDeterministic) {
    const allowed = new Set(allowedRoots);
    const offending: string[] = [];
    for (const root of rootBindings(ast)) {
      if (!allowed.has(root)) offending.push(root);
    }
    if (offending.length > 0) {
      findings.push({
        level: "error",
        path,
        message:
          `${label} is deterministic but references runtime state: ${offending
            .map((r) => `"${r}"`)
            .join(", ")}. ` +
          `Deterministic expressions may reference only ${allowedRoots
            .map((r) => `"${r}"`)
            .join(" / ")}.`,
        rule: "when-runtime-state",
      });
    }
  }

  return findings;
}

function lintOutcomeCode(
  rule: AuthorityRule,
  outcome: RuleOutcome,
  ruleIdx: number,
  branch: "then" | "else",
  declaredActions: ReadonlySet<string>,
): LintFinding[] {
  const findings: LintFinding[] = [];
  const path = `/authority/${ruleIdx}/${branch}/code`;

  const expectedSet =
    rule.binding_class === "deterministic" ? PROMISE_CODES : ESTIMATE_CODES;
  const expectedLabel =
    rule.binding_class === "deterministic" ? "PROMISE" : "ESTIMATE";

  if (!expectedSet.has(outcome.code)) {
    findings.push({
      level: "error",
      path,
      message:
        `authority[${ruleIdx}] (${rule.id}) is binding_class=${rule.binding_class} ` +
        `but ${branch}.code=${outcome.code} is not a ${expectedLabel} code. ` +
        `${expectedLabel} codes for this rule: ${[...expectedSet].sort().join(", ")}.`,
      rule: "binding-class-vs-code",
    });
  }

  if (outcome.action && !declaredActions.has(outcome.action)) {
    findings.push({
      level: "warning",
      path: `/authority/${ruleIdx}/${branch}/action`,
      message:
        `authority[${ruleIdx}] (${rule.id}) ${branch}.action=${outcome.action} is not declared in actions.exposes. ` +
        `Consider adding it so consumers know this outcome is possible.`,
      rule: "action-declared",
    });
  }

  return findings;
}

function lintExample(
  example: Example,
  skillIdx: number,
  exampleIdx: number,
  skillId: string,
): LintFinding | null {
  if (!example.expected_verdict) return null;

  const { code, binding } = example.expected_verdict;
  if (!binding) return null;

  const path = `/skills/${skillIdx}/examples/${exampleIdx}/expected_verdict`;
  const codeIsPromise = PROMISE_CODES.has(code);
  const codeIsEstimate = ESTIMATE_CODES.has(code);

  if (binding === "PROMISE" && !codeIsPromise) {
    return {
      level: "error",
      path,
      message:
        `skills[${skillIdx}] (${skillId}) example #${exampleIdx} declares binding=PROMISE ` +
        `but code=${code} is not a PROMISE code.`,
      rule: "example-binding-vs-code",
    };
  }
  if (binding === "ESTIMATE" && !codeIsEstimate) {
    return {
      level: "error",
      path,
      message:
        `skills[${skillIdx}] (${skillId}) example #${exampleIdx} declares binding=ESTIMATE ` +
        `but code=${code} is not an ESTIMATE code.`,
      rule: "example-binding-vs-code",
    };
  }

  return null;
}

/**
 * Validate a permission entry's resource is in the closed v0.3 enum. The
 * structural pass already validates object-form entries via the JSON Schema enum;
 * this pass parses the short-form string ("resource.op:scope") and warns on
 * unknown resources.
 */
function lintPermissionEntry(
  entry: PermissionEntry,
  path: string,
  bucket: "allowed" | "disallowed",
  idx: number,
): LintFinding | null {
  if (typeof entry !== "string") return null;

  const parsed = parsePermissionShortForm(entry);
  if (!parsed) {
    return {
      level: "error",
      path,
      message:
        `permissions.${bucket}[${idx}] short-form "${entry}" does not parse. ` +
        `Expected "<resource>.<op>:<scope>" or "<resource>:<scope>" (e.g. "fs.read:./src/**", "network:api.github.com").`,
      rule: "permission-short-form",
    };
  }
  if (!PERMISSION_RESOURCES.has(parsed.resource as PermissionResource)) {
    return {
      level: "warning",
      path,
      message:
        `permissions.${bucket}[${idx}] uses unknown resource "${parsed.resource}". ` +
        `Closed v0.3 enum: ${[...PERMISSION_RESOURCES].sort().join(", ")}. ` +
        `Unknown resources are tolerated but reduce the contract's audit value.`,
      rule: "permission-resource-unknown",
    };
  }
  return null;
}

/**
 * Parse the short-form permission string. Format:
 *   "<resource>.<op>:<scope>"   (e.g. "fs.read:./src/**")
 *   "<resource>:<scope>"         (e.g. "network:api.github.com")
 *   "<resource>"                 (bare, op="*", no scope)
 */
export function parsePermissionShortForm(
  source: string,
): { resource: string; op: string; scope?: string } | null {
  const colonAt = source.indexOf(":");
  const head = colonAt === -1 ? source : source.slice(0, colonAt);
  const scope = colonAt === -1 ? undefined : source.slice(colonAt + 1);

  if (!head) return null;

  const dotAt = head.indexOf(".");
  if (dotAt === -1) {
    return { resource: head, op: "*", scope };
  }
  const resource = head.slice(0, dotAt);
  const op = head.slice(dotAt + 1);
  if (!resource || !op) return null;
  return { resource, op, scope };
}

// Re-exported for callers that want to inspect the code sets directly.
export { PROMISE_CODES, ESTIMATE_CODES };
export type { StatusCode };
