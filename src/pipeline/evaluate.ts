/**
 * The shared request-evaluation pipeline used by:
 *   - the sandbox (returns Verdict + synthesizes response)
 *   - pre-flight (returns Verdict only)
 *   - the conformance runner (compares Verdict to the real agent's response)
 *
 * Skill-call pipeline:
 *   1. Locate skill (WRONG_AGENT if missing)
 *   2. Validate input against skill's input schema (SCHEMA_INVALID / MISSING_INPUT)
 *   3. Evaluate instant_failures in declaration order (first match wins)
 *   4. Evaluate skill-targeted authority rules (first matching when fires)
 *   5. If no rule fires: ACCEPTED_LIKELY / ESTIMATE
 *
 * Tool-call pipeline (v0.3):
 *   1. Locate tool (WRONG_AGENT if missing)
 *   2. (Future) Validate input against tool's input_schema
 *   3. Evaluate tool-targeted authority rules (first matching when fires)
 *   4. If no rule fires: ACCEPTED_LIKELY / ESTIMATE
 */

import type {
  AirlockContract,
  AuthorityRule,
  InstantFailure,
} from "../validate/types.js";
import { parseExpression, evaluate as evalExpr, EvalError, ParseError } from "../expr/index.js";
import type { Verdict } from "./verdict.js";
import {
  buildInputValidators,
  findSkill,
  findTool,
  type InputValidator,
} from "./inputValidator.js";

export type PreparedContract = {
  contract: AirlockContract;
  inputValidators: Map<string, InputValidator>;
  /** Cached parsed expression ASTs, keyed by their source string. */
  exprCache: Map<string, ReturnType<typeof parseExpression>>;
};

export function prepareContract(contract: AirlockContract): PreparedContract {
  return {
    contract,
    inputValidators: buildInputValidators(contract),
    exprCache: new Map(),
  };
}

export type EvaluateInput = {
  skill: string;
  input: unknown;
};

export type EvaluateToolInput = {
  tool: string;
  input: unknown;
};

export function evaluateRequest(prepared: PreparedContract, req: EvaluateInput): Verdict {
  const { contract } = prepared;

  // 1. Locate skill
  const skill = findSkill(contract, req.skill);
  if (!skill) {
    return {
      code: "WRONG_AGENT",
      binding: "PROMISE",
      reason: `Skill "${req.skill}" is not declared in this contract.`,
      ref: "no-such-skill",
    };
  }

  // 2. Validate input schema
  const inputValidator = prepared.inputValidators.get(skill.id);
  if (inputValidator) {
    const result = inputValidator(req.input);
    if (!result.ok) {
      const message = result.errors
        .map((e) => `${e.path} ${e.message}`)
        .join("; ");
      // Heuristic: missing required field → MISSING_INPUT, else SCHEMA_INVALID
      const isMissing = result.errors.some(
        (e) => /required/i.test(e.message) || /must have required/i.test(e.message),
      );
      return {
        code: isMissing ? "MISSING_INPUT" : "SCHEMA_INVALID",
        binding: "PROMISE",
        reason: `Input does not satisfy "${skill.id}" schema: ${message}`,
        ref: `skill-input:${skill.id}`,
      };
    }
  }

  // 3. instant_failures
  for (const failure of contract.instant_failures ?? []) {
    if (failure.skill && failure.skill !== skill.id) continue;
    if (evalWhen(prepared, failure.when, { input: req.input }, `instant_failures:${failure.id}`)) {
      return {
        code: failure.code,
        binding: "PROMISE",
        reason: failure.message ?? `Instant failure: ${failure.id}`,
        ref: failure.id,
      };
    }
  }

  // 4. authority rules (skill-targeted only)
  for (const rule of contract.authority ?? []) {
    if (rule.skill !== skill.id) continue; // skips tool-targeted rules too
    const fired = evalWhen(prepared, rule.when, { input: req.input }, `authority:${rule.id}`);
    if (fired) return outcomeToVerdict(rule, "then");
    if (rule.else) return outcomeToVerdict(rule, "else");
  }

  // 5. Default
  return {
    code: "ACCEPTED_LIKELY",
    binding: "ESTIMATE",
    reason: "No authority rule fired; default estimate.",
    ref: "default",
  };
}

export function evaluateToolCall(prepared: PreparedContract, req: EvaluateToolInput): Verdict {
  const { contract } = prepared;

  const tool = findTool(contract, req.tool);
  if (!tool) {
    return {
      code: "WRONG_AGENT",
      binding: "PROMISE",
      reason: `Tool "${req.tool}" is not declared in this contract.`,
      ref: "no-such-tool",
    };
  }

  // Tool-targeted authority rules. Expression bindings expose the tool args
  // as both `input` and `tool` so authors can write whichever reads cleaner.
  const bindings = { input: req.input, tool: req.input };

  for (const rule of contract.authority ?? []) {
    if (rule.tool !== tool.id) continue;
    const fired = evalWhen(prepared, rule.when, bindings, `authority:${rule.id}`);
    if (fired) return outcomeToVerdict(rule, "then");
    if (rule.else) return outcomeToVerdict(rule, "else");
  }

  return {
    code: "ACCEPTED_LIKELY",
    binding: "ESTIMATE",
    reason: "No authority rule fired against this tool; default estimate.",
    ref: "default",
  };
}

function outcomeToVerdict(rule: AuthorityRule, branch: "then" | "else"): Verdict {
  const outcome = branch === "then" ? rule.then : rule.else!;
  return {
    code: outcome.code,
    binding: rule.binding_class === "deterministic" ? "PROMISE" : "ESTIMATE",
    reason: outcome.message ?? `Rule "${rule.id}" ${branch}-branch matched.`,
    ref: rule.id,
    ...(outcome.action ? { action: outcome.action } : {}),
  };
}

function evalWhen(
  prepared: PreparedContract,
  source: string,
  bindings: Record<string, unknown>,
  context: string,
): boolean {
  let ast = prepared.exprCache.get(source);
  if (!ast) {
    try {
      ast = parseExpression(source);
    } catch (err) {
      throw wrapEvalError(context, "parse", err);
    }
    prepared.exprCache.set(source, ast);
  }
  try {
    const result = evalExpr(ast, bindings);
    return Boolean(result);
  } catch (err) {
    throw wrapEvalError(context, "eval", err);
  }
}

function wrapEvalError(context: string, phase: "parse" | "eval", err: unknown): Error {
  const message = err instanceof Error ? err.message : String(err);
  const e = new Error(`[${context}] ${phase} failed: ${message}`);
  if (err instanceof ParseError || err instanceof EvalError) {
    e.cause = err;
  }
  return e;
}

export type { InstantFailure, AuthorityRule };
