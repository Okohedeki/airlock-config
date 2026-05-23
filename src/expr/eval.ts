/**
 * Tree-walking evaluator for the tiny safe expression language.
 *
 * Never uses eval, Function constructor, or any host capability beyond the
 * whitelisted helper functions. Pure computation over the input bindings.
 */

import type { Expr } from "./types.js";

export class EvalError extends Error {
  constructor(message: string) {
    super(`expr: ${message}`);
    this.name = "EvalError";
  }
}

export type Bindings = Record<string, unknown>;

export type Helper = (...args: unknown[]) => unknown;

const DEFAULT_HELPERS: Record<string, Helper> = {
  abs(x: unknown): unknown {
    if (isNullish(x)) return null;
    return Math.abs(num(x, "abs"));
  },
  min(...args: unknown[]): unknown {
    if (args.length === 0) throw new EvalError("min: needs at least one argument");
    const nums = args.filter((a) => !isNullish(a)).map((a) => num(a, "min"));
    if (nums.length === 0) return null;
    return Math.min(...nums);
  },
  max(...args: unknown[]): unknown {
    if (args.length === 0) throw new EvalError("max: needs at least one argument");
    const nums = args.filter((a) => !isNullish(a)).map((a) => num(a, "max"));
    if (nums.length === 0) return null;
    return Math.max(...nums);
  },
  len(x: unknown): unknown {
    if (isNullish(x)) return null;
    if (typeof x === "string") return x.length;
    if (Array.isArray(x)) return x.length;
    if (x && typeof x === "object") return Object.keys(x).length;
    throw new EvalError(`len: cannot take length of ${describe(x)}`);
  },
  matches(s: unknown, pattern: unknown): unknown {
    if (isNullish(s) || isNullish(pattern)) return false;
    if (typeof s !== "string") throw new EvalError(`matches: first arg must be string`);
    if (typeof pattern !== "string") throw new EvalError(`matches: second arg must be string`);
    return new RegExp(pattern).test(s);
  },
};

export function evaluate(expr: Expr, bindings: Bindings, helpers: Record<string, Helper> = DEFAULT_HELPERS): unknown {
  switch (expr.kind) {
    case "lit":
      return expr.value;
    case "neg": {
      const v = evaluate(expr.expr, bindings, helpers);
      if (isNullish(v)) return null;
      return -num(v, "unary -");
    }
    case "not":
      return !truthy(evaluate(expr.expr, bindings, helpers));
    case "field":
      return resolveField(expr.path, bindings);
    case "call": {
      const helper = helpers[expr.name];
      if (!helper) {
        throw new EvalError(`unknown function "${expr.name}"`);
      }
      const args = expr.args.map((a) => evaluate(a, bindings, helpers));
      return helper(...args);
    }
    case "bin":
      return evalBin(expr, bindings, helpers);
  }
}

function evalBin(expr: Extract<Expr, { kind: "bin" }>, b: Bindings, h: Record<string, Helper>): unknown {
  // Short-circuit
  if (expr.op === "and") {
    const left = evaluate(expr.left, b, h);
    if (!truthy(left)) return false;
    return truthy(evaluate(expr.right, b, h));
  }
  if (expr.op === "or") {
    const left = evaluate(expr.left, b, h);
    if (truthy(left)) return true;
    return truthy(evaluate(expr.right, b, h));
  }

  const left = evaluate(expr.left, b, h);
  const right = evaluate(expr.right, b, h);

  switch (expr.op) {
    case "==":
      return eq(left, right);
    case "!=":
      return !eq(left, right);
    // Comparisons short-circuit to false on null/undefined operands —
    // "this rule doesn't apply if the field isn't there."
    case "<":
      if (isNullish(left) || isNullish(right)) return false;
      return cmp(left, right) < 0;
    case "<=":
      if (isNullish(left) || isNullish(right)) return false;
      return cmp(left, right) <= 0;
    case ">":
      if (isNullish(left) || isNullish(right)) return false;
      return cmp(left, right) > 0;
    case ">=":
      if (isNullish(left) || isNullish(right)) return false;
      return cmp(left, right) >= 0;
    // Arithmetic propagates null — `null + 5` → null
    case "+":
      if (isNullish(left) || isNullish(right)) return null;
      return num(left, "+") + num(right, "+");
    case "-":
      if (isNullish(left) || isNullish(right)) return null;
      return num(left, "-") - num(right, "-");
    case "*":
      if (isNullish(left) || isNullish(right)) return null;
      return num(left, "*") * num(right, "*");
    case "/": {
      if (isNullish(left) || isNullish(right)) return null;
      const r = num(right, "/");
      if (r === 0) throw new EvalError("division by zero");
      return num(left, "/") / r;
    }
    case "%": {
      if (isNullish(left) || isNullish(right)) return null;
      const r = num(right, "%");
      if (r === 0) throw new EvalError("modulo by zero");
      return num(left, "%") % r;
    }
  }
}

function isNullish(x: unknown): boolean {
  return x === null || x === undefined;
}

function eq(a: unknown, b: unknown): boolean {
  if (a === null || a === undefined) return b === null || b === undefined;
  if (b === null || b === undefined) return false;
  return a === b;
}

function cmp(a: unknown, b: unknown): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "string" && typeof b === "string") return a < b ? -1 : a > b ? 1 : 0;
  throw new EvalError(`cannot compare ${describe(a)} to ${describe(b)}`);
}

function num(x: unknown, ctx: string): number {
  if (typeof x === "number" && !Number.isNaN(x)) return x;
  throw new EvalError(`${ctx}: expected number, got ${describe(x)}`);
}

function truthy(x: unknown): boolean {
  return typeof x === "boolean" ? x : Boolean(x);
}

function describe(x: unknown): string {
  if (x === null) return "null";
  if (x === undefined) return "undefined";
  if (Array.isArray(x)) return "array";
  return typeof x;
}

function resolveField(path: string[], bindings: Bindings): unknown {
  let cur: unknown = bindings;
  for (const seg of path) {
    if (cur === null || cur === undefined) return null;
    if (typeof cur !== "object") {
      throw new EvalError(`cannot access "${seg}" on ${describe(cur)}`);
    }
    cur = (cur as Record<string, unknown>)[seg];
    if (cur === undefined) return null;
  }
  return cur;
}

export const HELPERS = DEFAULT_HELPERS;
