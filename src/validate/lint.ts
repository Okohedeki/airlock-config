/**
 * Semantic lint: pass 2 of the validator. Catches semantic problems that JSON
 * Schema cannot express. Assumes the input has already passed structural
 * validation, so types are sound.
 *
 * Still deferred (needs JSON-Schema-aware field resolution):
 *   - Check `when` field references resolve against the skill's input schema
 */

import type {
  AirlockContract,
  AuthorityRule,
  Example,
  RuleOutcome,
  StatusCode,
} from "./types.js";
import { ESTIMATE_CODES, PROMISE_CODES } from "./types.js";
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
  const declaredActions = new Set(contract.actions?.exposes ?? []);

  contract.authority?.forEach((rule, idx) => {
    findings.push(...lintAuthorityRule(rule, idx, skillIds, declaredActions));
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
      ),
    );
  });

  contract.skills.forEach((skill, sIdx) => {
    skill.examples?.forEach((example, eIdx) => {
      const finding = lintExample(example, sIdx, eIdx, skill.id);
      if (finding) findings.push(finding);
    });
  });

  const hasError = findings.some((f) => f.level === "error");
  return hasError ? { ok: false, findings } : { ok: true, findings };
}

function lintAuthorityRule(
  rule: AuthorityRule,
  idx: number,
  skillIds: ReadonlySet<string>,
  declaredActions: ReadonlySet<string>,
): LintFinding[] {
  const findings: LintFinding[] = [];
  const base = `/authority/${idx}`;

  if (!skillIds.has(rule.skill)) {
    findings.push({
      level: "error",
      path: `${base}/skill`,
      message: `authority[${idx}] (${rule.id}) references unknown skill "${rule.skill}"`,
      rule: "skill-ref",
    });
  }

  findings.push(
    ...lintOutcomeCode(rule, rule.then, idx, "then", declaredActions),
  );
  if (rule.else) {
    findings.push(
      ...lintOutcomeCode(rule, rule.else, idx, "else", declaredActions),
    );
  }

  findings.push(
    ...lintWhenExpression(
      rule.when,
      `${base}/when`,
      `authority[${idx}] (${rule.id})`,
      rule.binding_class === "deterministic",
    ),
  );

  return findings;
}

/**
 * Lint a `when` expression: must parse; must only call whitelisted helpers;
 * if `mustBeDeterministic`, must reference only `input.*` (no runtime state).
 */
function lintWhenExpression(
  source: string,
  path: string,
  label: string,
  mustBeDeterministic: boolean,
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
    const offending: string[] = [];
    for (const root of rootBindings(ast)) {
      if (root !== "input") offending.push(root);
    }
    if (offending.length > 0) {
      findings.push({
        level: "error",
        path,
        message:
          `${label} is deterministic but references runtime state: ${offending
            .map((r) => `"${r}"`)
            .join(", ")}. ` +
          `Deterministic expressions may reference only "input".`,
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

// Re-exported for callers that want to inspect the code sets directly.
export { PROMISE_CODES, ESTIMATE_CODES };
export type { StatusCode };
