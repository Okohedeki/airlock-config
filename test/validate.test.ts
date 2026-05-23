import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { validateContract, validateContractFile } from "../src/index.js";

const EXAMPLES = resolve(__dirname, "..", "examples");

describe("validateContractFile (example contracts)", () => {
  it("accepts the minimal example", () => {
    const result = validateContractFile(resolve(EXAMPLES, "minimal.airlock.yaml"));
    expect(result.ok, formatIssues(result)).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it("accepts the procurement example", () => {
    const result = validateContractFile(resolve(EXAMPLES, "procurement.airlock.yaml"));
    expect(result.ok, formatIssues(result)).toBe(true);
  });
});

describe("structural validation", () => {
  it("rejects a contract missing airlock spec version", () => {
    const result = validateContract({
      agent: { name: "a", version: "0.1.0" },
      skills: [{ id: "x", input: {}, output: {} }],
    });
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.message.includes("airlock"))).toBe(true);
  });

  it("rejects a contract missing skills", () => {
    const result = validateContract({
      airlock: "0.1",
      agent: { name: "a", version: "0.1.0" },
    });
    expect(result.ok).toBe(false);
  });

  it("rejects an unknown status code in an authority then", () => {
    const result = validateContract(baseContract({
      authority: [
        {
          id: "r1",
          skill: "ping",
          binding_class: "deterministic",
          when: "true",
          then: { code: "NOT_A_REAL_CODE" },
        },
      ],
    }));
    expect(result.ok).toBe(false);
  });

  it("rejects an instant_failure using a non-instant code", () => {
    const result = validateContract(baseContract({
      instant_failures: [
        { id: "f1", when: "false", code: "ACCEPTED_BY_RULE" },
      ],
    }));
    expect(result.ok).toBe(false);
  });

  it("rejects an unknown channel", () => {
    const result = validateContract({
      airlock: "0.1",
      agent: { name: "a", version: "0.1.0", channels: ["telepathy"] },
      skills: [{ id: "ping", input: {}, output: {} }],
    });
    expect(result.ok).toBe(false);
  });
});

describe("semantic lint", () => {
  it("flags a deterministic rule producing an ESTIMATE code", () => {
    const result = validateContract(baseContract({
      authority: [
        {
          id: "bad-determinism",
          skill: "ping",
          binding_class: "deterministic",
          when: "true",
          then: { code: "HUMAN_REVIEW_LIKELY" },
        },
      ],
    }));
    expect(result.ok).toBe(false);
    expect(
      result.issues.some(
        (i) => i.kind === "lint" && i.rule === "binding-class-vs-code",
      ),
    ).toBe(true);
  });

  it("flags a judgment rule producing a PROMISE code", () => {
    const result = validateContract(baseContract({
      authority: [
        {
          id: "bad-judgment",
          skill: "ping",
          binding_class: "judgment",
          when: "true",
          then: { code: "ACCEPTED_BY_RULE" },
        },
      ],
    }));
    expect(result.ok).toBe(false);
    expect(
      result.issues.some(
        (i) => i.kind === "lint" && i.rule === "binding-class-vs-code",
      ),
    ).toBe(true);
  });

  it("flags authority rules referencing unknown skills", () => {
    const result = validateContract(baseContract({
      authority: [
        {
          id: "r1",
          skill: "does-not-exist",
          binding_class: "deterministic",
          when: "true",
          then: { code: "ACCEPTED_BY_RULE" },
        },
      ],
    }));
    expect(result.ok).toBe(false);
    expect(
      result.issues.some((i) => i.kind === "lint" && i.rule === "skill-ref"),
    ).toBe(true);
  });

  it("flags instant_failures referencing unknown skills", () => {
    const result = validateContract(baseContract({
      instant_failures: [
        { id: "f1", when: "false", code: "MISSING_INPUT", skill: "ghost" },
      ],
    }));
    expect(result.ok).toBe(false);
    expect(
      result.issues.some((i) => i.kind === "lint" && i.rule === "skill-ref"),
    ).toBe(true);
  });

  it("warns (not errors) on actions referenced by rules but not declared", () => {
    const result = validateContract(baseContract({
      authority: [
        {
          id: "r1",
          skill: "ping",
          binding_class: "deterministic",
          when: "true",
          then: { code: "ACCEPTED_BY_RULE", action: "UNILATERAL_COMMIT" },
        },
      ],
      // no actions.exposes declared
    }));
    expect(result.ok).toBe(true); // warnings don't fail validation
    expect(
      result.issues.some(
        (i) =>
          i.kind === "lint" &&
          i.rule === "action-declared" &&
          i.level === "warning",
      ),
    ).toBe(true);
  });

  it("flags a deterministic rule whose when references runtime state", () => {
    const result = validateContract(baseContract({
      authority: [
        {
          id: "uses-runtime-state",
          skill: "ping",
          binding_class: "deterministic",
          when: "inventory.level > 10", // not input.* → forbidden
          then: { code: "ACCEPTED_BY_RULE" },
        },
      ],
    }));
    expect(result.ok).toBe(false);
    expect(
      result.issues.some(
        (i) => i.kind === "lint" && i.rule === "when-runtime-state",
      ),
    ).toBe(true);
  });

  it("flags a when expression that fails to parse", () => {
    const result = validateContract(baseContract({
      authority: [
        {
          id: "broken-when",
          skill: "ping",
          binding_class: "deterministic",
          when: "1 +",
          then: { code: "ACCEPTED_BY_RULE" },
        },
      ],
    }));
    expect(result.ok).toBe(false);
    expect(
      result.issues.some((i) => i.kind === "lint" && i.rule === "when-parse"),
    ).toBe(true);
  });

  it("flags a when expression that calls a non-whitelisted helper", () => {
    const result = validateContract(baseContract({
      authority: [
        {
          id: "bad-helper",
          skill: "ping",
          binding_class: "deterministic",
          when: "fetch('x')",
          then: { code: "ACCEPTED_BY_RULE" },
        },
      ],
    }));
    expect(result.ok).toBe(false);
    expect(
      result.issues.some(
        (i) => i.kind === "lint" && i.rule === "when-unknown-helper",
      ),
    ).toBe(true);
  });

  it("allows judgment rules to reference runtime state", () => {
    const result = validateContract(baseContract({
      authority: [
        {
          id: "judgment-can-use-state",
          skill: "ping",
          binding_class: "judgment",
          when: "inventory.level > 10",
          then: { code: "ACCEPTED_LIKELY" },
        },
      ],
    }));
    expect(result.ok).toBe(true);
  });

  it("flags an example whose declared binding mismatches its code", () => {
    const result = validateContract({
      airlock: "0.1",
      agent: { name: "a", version: "0.1.0" },
      skills: [
        {
          id: "ping",
          input: {},
          output: {},
          examples: [
            {
              name: "bad-example",
              in: {},
              expected_verdict: {
                code: "ACCEPTED_LIKELY",
                binding: "PROMISE", // ACCEPTED_LIKELY is ESTIMATE
              },
            },
          ],
        },
      ],
    });
    expect(result.ok).toBe(false);
    expect(
      result.issues.some(
        (i) => i.kind === "lint" && i.rule === "example-binding-vs-code",
      ),
    ).toBe(true);
  });
});

function baseContract(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    airlock: "0.1",
    agent: { name: "test-agent", version: "0.1.0" },
    skills: [{ id: "ping", input: {}, output: {} }],
    ...overrides,
  };
}

function formatIssues(result: { issues: Array<{ path: string; message: string }> }): string {
  if (result.issues.length === 0) return "";
  return (
    "Unexpected issues:\n" +
    result.issues.map((i) => `  ${i.path}: ${i.message}`).join("\n")
  );
}
