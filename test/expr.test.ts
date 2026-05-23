import { describe, expect, it } from "vitest";
import {
  ParseError,
  EvalError,
  parseExpression,
  evaluate,
  rootBindings,
  calledFunctions,
} from "../src/expr/index.js";

function run(source: string, bindings: Record<string, unknown> = {}): unknown {
  return evaluate(parseExpression(source), bindings);
}

describe("parser", () => {
  it("parses literals", () => {
    expect(run("1")).toBe(1);
    expect(run("1.5")).toBe(1.5);
    expect(run('"hi"')).toBe("hi");
    expect(run("'hi'")).toBe("hi");
    expect(run("true")).toBe(true);
    expect(run("false")).toBe(false);
    expect(run("null")).toBe(null);
  });

  it("parses field references with dots", () => {
    expect(run("input.amount", { input: { amount: 42 } })).toBe(42);
    expect(run("input.po.entity", { input: { po: { entity: "x" } } })).toBe("x");
  });

  it("returns null for missing fields", () => {
    expect(run("input.nonexistent", { input: {} })).toBe(null);
    expect(run("input.a.b.c", { input: {} })).toBe(null);
  });

  it("parses function calls", () => {
    expect(run("abs(-5)")).toBe(5);
    expect(run("min(3, 1, 4)")).toBe(1);
    expect(run("max(3, 1, 4)")).toBe(4);
    expect(run('len("hello")')).toBe(5);
    expect(run('matches("PO-1234", "^PO-")')).toBe(true);
  });

  it("rejects unknown functions at runtime", () => {
    expect(() => run("eval(1)")).toThrow(EvalError);
    expect(() => run("fetch('x')")).toThrow(EvalError);
  });

  it("respects operator precedence", () => {
    expect(run("1 + 2 * 3")).toBe(7);
    expect(run("(1 + 2) * 3")).toBe(9);
    expect(run("10 - 2 - 3")).toBe(5);
    expect(run("10 / 2 * 5")).toBe(25);
  });

  it("handles unary negation", () => {
    expect(run("-5")).toBe(-5);
    expect(run("abs(-3)")).toBe(3);
    expect(run("-1 + 2")).toBe(1);
  });

  it("handles comparison operators", () => {
    expect(run("1 < 2")).toBe(true);
    expect(run("2 <= 2")).toBe(true);
    expect(run("3 > 2")).toBe(true);
    expect(run("2 >= 2")).toBe(true);
    expect(run("1 == 1")).toBe(true);
    expect(run("1 != 2")).toBe(true);
    expect(run('"a" == "a"')).toBe(true);
    expect(run('"a" < "b"')).toBe(true);
  });

  it("handles null comparisons", () => {
    expect(run("x == null", { x: null })).toBe(true);
    expect(run("x == null", { x: undefined })).toBe(true);
    expect(run("x == null", { x: 0 })).toBe(false);
    expect(run("x != null", { x: "foo" })).toBe(true);
  });

  it("handles logical operators with short-circuit", () => {
    expect(run("true and false")).toBe(false);
    expect(run("true or false")).toBe(true);
    expect(run("not true")).toBe(false);
    expect(run("not (1 > 2)")).toBe(true);
    // short-circuit: right side should NOT be evaluated
    expect(run("false and undefined_func(1)")).toBe(false);
    expect(run("true or undefined_func(1)")).toBe(true);
  });

  it("parses realistic authority-rule expressions", () => {
    expect(
      run("abs(input.delivery_date_change_days) <= 3", {
        input: { delivery_date_change_days: -2 },
      }),
    ).toBe(true);
    expect(
      run("abs(input.delivery_date_change_days) <= 3", {
        input: { delivery_date_change_days: 5 },
      }),
    ).toBe(false);
    expect(
      run(
        "input.entity != 'known-supplier-1' and input.entity != 'known-supplier-2'",
        { input: { entity: "random-vendor" } },
      ),
    ).toBe(true);
  });
});

describe("syntax errors", () => {
  it("rejects empty input", () => {
    expect(() => parseExpression("")).toThrow(ParseError);
  });
  it("rejects unbalanced parens", () => {
    expect(() => parseExpression("(1 + 2")).toThrow(ParseError);
    expect(() => parseExpression("1 + 2)")).toThrow(ParseError);
  });
  it("rejects unterminated strings", () => {
    expect(() => parseExpression('"hello')).toThrow(ParseError);
  });
  it("rejects assignment-style statements", () => {
    expect(() => parseExpression("x = 1")).toThrow(ParseError);
  });
  it("rejects forbidden constructs", () => {
    // No function definitions, no lambdas, no statements
    expect(() => parseExpression("function x() {}")).toThrow(ParseError);
    expect(() => parseExpression("=> 1")).toThrow(ParseError);
    expect(() => parseExpression("if (true) 1 else 2")).toThrow(ParseError);
  });
});

describe("runtime errors", () => {
  it("rejects type-mismatched arithmetic", () => {
    expect(() => run('1 + "a"')).toThrow(EvalError);
  });
  it("rejects type-mismatched comparison", () => {
    expect(() => run('1 < "a"')).toThrow(EvalError);
  });
  it("rejects division by zero", () => {
    expect(() => run("1 / 0")).toThrow(EvalError);
    expect(() => run("1 % 0")).toThrow(EvalError);
  });
});

describe("null-safe propagation", () => {
  it("comparisons with null return false (rule does not fire)", () => {
    expect(run("input.missing < 3", { input: {} })).toBe(false);
    expect(run("input.missing <= 3", { input: {} })).toBe(false);
    expect(run("input.missing > 3", { input: {} })).toBe(false);
    expect(run("input.missing >= 3", { input: {} })).toBe(false);
  });
  it("arithmetic with null returns null (then comparison is false)", () => {
    expect(run("abs(input.missing) <= 3", { input: {} })).toBe(false);
    expect(run("input.missing + 5", { input: {} })).toBe(null);
  });
  it("equality with null still works", () => {
    expect(run("input.missing == null", { input: {} })).toBe(true);
    expect(run("input.missing != null", { input: {} })).toBe(false);
  });
  it("min/max ignore null arguments", () => {
    expect(run("min(input.a, input.b, 3)", { input: { a: null, b: 1 } })).toBe(1);
    expect(run("max(input.a, input.b, input.c)", { input: { a: null, b: null, c: null } })).toBe(null);
  });
});

describe("introspection helpers", () => {
  it("collects root bindings referenced", () => {
    const expr = parseExpression(
      "abs(input.amount) < threshold.high and caller.id == 'x'",
    );
    expect(rootBindings(expr)).toEqual(new Set(["input", "threshold", "caller"]));
  });

  it("collects function names called", () => {
    const expr = parseExpression("abs(input.x) + max(1, 2, 3)");
    expect(calledFunctions(expr)).toEqual(new Set(["abs", "max"]));
  });
});
