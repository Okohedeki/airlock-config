/**
 * Tiny safe expression engine used for evaluating `when` clauses in Airlock
 * contracts (`authority` rules + `instant_failures`).
 *
 * - No eval, no Function constructor, no I/O, no Turing-completeness.
 * - Whitelisted helpers: abs, min, max, len, matches.
 * - Two-step: parseExpression() → AST, then evaluate(ast, bindings).
 *
 * See docs/contract-schema.md § Expression language for the grammar and
 * allowed constructs.
 */

export { parseExpression, ParseError } from "./parse.js";
export { evaluate, EvalError, HELPERS } from "./eval.js";
export type { Bindings, Helper } from "./eval.js";
export type { Expr, BinExpr, BinOp, LitExpr, FieldExpr, CallExpr } from "./types.js";

import type { Expr } from "./types.js";

/**
 * Collect every distinct root binding referenced by the expression
 * (the first segment of every field reference). Used by the validator's
 * deferred lint to ensure deterministic rules reference only `input`.
 */
export function rootBindings(expr: Expr): Set<string> {
  const roots = new Set<string>();
  walk(expr, (node) => {
    if (node.kind === "field" && node.path.length > 0) {
      roots.add(node.path[0]!);
    }
  });
  return roots;
}

/**
 * Walk every node in an expression tree, invoking `visitor` on each one.
 */
export function walk(expr: Expr, visitor: (node: Expr) => void): void {
  visitor(expr);
  switch (expr.kind) {
    case "lit":
    case "field":
      return;
    case "neg":
    case "not":
      walk(expr.expr, visitor);
      return;
    case "bin":
      walk(expr.left, visitor);
      walk(expr.right, visitor);
      return;
    case "call":
      for (const a of expr.args) walk(a, visitor);
      return;
  }
}

/**
 * Collect every function name called by the expression. Used by the validator's
 * deferred lint to ensure only whitelisted helpers are referenced.
 */
export function calledFunctions(expr: Expr): Set<string> {
  const names = new Set<string>();
  walk(expr, (node) => {
    if (node.kind === "call") names.add(node.name);
  });
  return names;
}

