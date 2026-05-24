import { describe, expect, it } from "vitest";
import { fakeFromSchema } from "../src/pipeline/faker.js";
import type { AirlockConfig } from "../src/validate/types.js";

function contract(schemas: Record<string, Record<string, unknown>> = {}): AirlockConfig {
  return {
    airlock_config: "0.5",
    agent: { name: "test", version: "0.1.0" },
    category: { industry: "other", capability: "other" },
    schemas,
    skills: [{ id: "noop", input: {}, output: {} }],
  };
}

describe("fakeFromSchema — determinism", () => {
  it("produces the same output for the same input twice", () => {
    const schema = {
      type: "object",
      properties: {
        foo: { type: "string" },
        bar: { type: "integer", minimum: 1, maximum: 100 },
      },
    };
    const opts = {
      schema,
      contract: contract(),
      input: { hint: "x" },
      subjectId: "noop",
    };
    expect(JSON.stringify(fakeFromSchema(opts))).toBe(
      JSON.stringify(fakeFromSchema(opts)),
    );
  });

  it("produces different output for different inputs", () => {
    const schema = {
      type: "object",
      properties: {
        bar: { type: "integer", minimum: 0, maximum: 10000 },
      },
    };
    const a = fakeFromSchema({
      schema,
      contract: contract(),
      input: { hint: "a" },
      subjectId: "noop",
    });
    const b = fakeFromSchema({
      schema,
      contract: contract(),
      input: { hint: "b" },
      subjectId: "noop",
    });
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });

  it("key order in the input does not affect the seed", () => {
    const schema = { type: "object", properties: { x: { type: "string" } } };
    const a = fakeFromSchema({
      schema,
      contract: contract(),
      input: { a: 1, b: 2 },
      subjectId: "noop",
    });
    const b = fakeFromSchema({
      schema,
      contract: contract(),
      input: { b: 2, a: 1 },
      subjectId: "noop",
    });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe("fakeFromSchema — input echo", () => {
  it("echoes a same-named string property from input into the response", () => {
    const schema = {
      type: "object",
      properties: {
        path: { type: "string" },
        line_count: { type: "integer" },
      },
    };
    const result = fakeFromSchema({
      schema,
      contract: contract(),
      input: { path: "src/foo.ts" },
      subjectId: "noop",
    });
    expect((result as Record<string, unknown>).path).toBe("src/foo.ts");
  });

  it("does not echo when the input value's type doesn't match", () => {
    const schema = {
      type: "object",
      properties: { path: { type: "string" } },
    };
    const result = fakeFromSchema({
      schema,
      contract: contract(),
      input: { path: 42 },
      subjectId: "noop",
    });
    const path = (result as Record<string, unknown>).path;
    expect(path).toBeDefined();
    expect(typeof path).toBe("string");
    expect(path).not.toBe(42);
  });
});

describe("fakeFromSchema — schema compliance", () => {
  it("respects enum constraints", () => {
    const schema = {
      type: "object",
      properties: {
        status: { type: "string", enum: ["ok", "warn", "fail"] },
      },
      required: ["status"],
    };
    const result = fakeFromSchema({
      schema,
      contract: contract(),
      input: {},
      subjectId: "noop",
    });
    expect(["ok", "warn", "fail"]).toContain(
      (result as Record<string, unknown>).status,
    );
  });

  it("honours const", () => {
    const schema = {
      type: "object",
      properties: { kind: { const: "tool_call" } },
      required: ["kind"],
    };
    const result = fakeFromSchema({
      schema,
      contract: contract(),
      input: {},
      subjectId: "noop",
    });
    expect((result as Record<string, unknown>).kind).toBe("tool_call");
  });

  it("resolves $ref into #/schemas", () => {
    const schemas = {
      Item: {
        type: "object",
        properties: { id: { type: "string" }, qty: { type: "integer" } },
        required: ["id"],
      },
    };
    const schema = {
      type: "object",
      properties: { items: { type: "array", items: { $ref: "#/schemas/Item" } } },
      required: ["items"],
    };
    const result = fakeFromSchema({
      schema,
      contract: contract(schemas),
      input: {},
      subjectId: "noop",
    });
    const items = (result as Record<string, unknown>).items as unknown[];
    expect(Array.isArray(items)).toBe(true);
    expect(items.length).toBeGreaterThan(0);
    const first = items[0] as Record<string, unknown>;
    expect(typeof first.id).toBe("string");
  });

  it("honours numeric ranges", () => {
    const schema = {
      type: "object",
      properties: { exit_code: { type: "integer", minimum: 0, maximum: 5 } },
      required: ["exit_code"],
    };
    const result = fakeFromSchema({
      schema,
      contract: contract(),
      input: {},
      subjectId: "noop",
    });
    const v = (result as Record<string, unknown>).exit_code as number;
    expect(Number.isInteger(v)).toBe(true);
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThanOrEqual(5);
  });

  it("produces a date-format string when format=date", () => {
    const schema = {
      type: "object",
      properties: { when: { type: "string", format: "date" } },
      required: ["when"],
    };
    const result = fakeFromSchema({
      schema,
      contract: contract(),
      input: {},
      subjectId: "noop",
    });
    expect((result as Record<string, unknown>).when).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("always emits required properties", () => {
    const schema = {
      type: "object",
      properties: {
        a: { type: "string" },
        b: { type: "string" },
        c: { type: "string" },
        d: { type: "string" },
        e: { type: "string" },
        always: { type: "string" },
      },
      required: ["always"],
    };
    // Run 30x; required field must appear every time.
    for (let i = 0; i < 30; i++) {
      const result = fakeFromSchema({
        schema,
        contract: contract(),
        input: { seed: i },
        subjectId: "noop",
      });
      expect((result as Record<string, unknown>).always).toBeDefined();
    }
  });
});
