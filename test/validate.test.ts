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

  it("accepts the agent-harness flagship example", () => {
    const result = validateContractFile(resolve(EXAMPLES, "agent-harness.airlock.yaml"));
    expect(result.ok, formatIssues(result)).toBe(true);
  });
});

describe("v0.3 version gate", () => {
  it("rejects a v0.1 contract with a migration hint", () => {
    const result = validateContract({
      airlock: "0.1",
      agent: { name: "a", version: "0.1.0" },
      skills: [{ id: "ping", input: {}, output: {} }],
    });
    expect(result.ok).toBe(false);
    expect(
      result.issues.some((i) => i.message.includes("migration-v01-to-v03")),
    ).toBe(true);
  });

  it("rejects a v0.2 contract with a migration hint", () => {
    const result = validateContract({
      airlock: "0.2",
      agent: { name: "a", version: "0.1.0" },
      skills: [{ id: "ping", input: {}, output: {} }],
    });
    expect(result.ok).toBe(false);
    expect(
      result.issues.some((i) => i.message.includes("migration-v01-to-v03")),
    ).toBe(true);
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
      airlock: "0.3",
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
      airlock: "0.3",
      agent: { name: "a", version: "0.1.0", channels: ["telepathy"] },
      skills: [{ id: "ping", input: {}, output: {} }],
    });
    expect(result.ok).toBe(false);
  });

  it("rejects an authority rule targeting neither skill nor tool", () => {
    const result = validateContract(baseContract({
      authority: [
        {
          id: "r1",
          binding_class: "deterministic",
          when: "true",
          then: { code: "ACCEPTED_BY_RULE" },
        },
      ],
    }));
    expect(result.ok).toBe(false);
  });

  it("rejects an authority rule targeting both skill and tool", () => {
    const result = validateContract(baseContract({
      tools: [
        { id: "noop", input_schema: { type: "object" } },
      ],
      authority: [
        {
          id: "r1",
          skill: "ping",
          tool: "noop",
          binding_class: "deterministic",
          when: "true",
          then: { code: "ACCEPTED_BY_RULE" },
        },
      ],
    }));
    expect(result.ok).toBe(false);
  });

  it("rejects an unknown hook event", () => {
    const result = validateContract(baseContract({
      hooks: [{ event: "midnight_chime", mode: "observe" }],
    }));
    expect(result.ok).toBe(false);
  });

  it("rejects an unknown hook mode", () => {
    const result = validateContract(baseContract({
      hooks: [{ event: "before_skill", mode: "telepathy" }],
    }));
    expect(result.ok).toBe(false);
  });

  it("rejects an unknown permission resource (object form)", () => {
    const result = validateContract(baseContract({
      permissions: {
        allowed: [{ resource: "telepathy", op: "read" }],
      },
    }));
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

  it("flags authority rules referencing unknown tools", () => {
    const result = validateContract(baseContract({
      tools: [{ id: "noop", input_schema: { type: "object" } }],
      authority: [
        {
          id: "r1",
          tool: "telepathy",
          binding_class: "deterministic",
          when: "true",
          then: { code: "ACCEPTED_BY_RULE" },
        },
      ],
    }));
    expect(result.ok).toBe(false);
    expect(
      result.issues.some((i) => i.kind === "lint" && i.rule === "tool-ref"),
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

  it("allows tool-targeted deterministic rules to reference `tool.*`", () => {
    const result = validateContract(baseContract({
      tools: [{ id: "bash", input_schema: { type: "object" } }],
      authority: [
        {
          id: "bash-ok",
          tool: "bash",
          binding_class: "deterministic",
          when: "matches(tool.command, 'echo')",
          then: { code: "ACCEPTED_BY_RULE" },
        },
      ],
    }));
    expect(result.ok, formatIssues(result)).toBe(true);
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

  it("warns on an unknown permission resource in short-form", () => {
    const result = validateContract(baseContract({
      permissions: {
        allowed: ["telepathy.read:everywhere"],
      },
    }));
    expect(result.ok).toBe(true); // warning, not error
    expect(
      result.issues.some(
        (i) =>
          i.kind === "lint" &&
          i.rule === "permission-resource-unknown" &&
          i.level === "warning",
      ),
    ).toBe(true);
  });

  it("flags hooks referencing unknown tools", () => {
    const result = validateContract(baseContract({
      hooks: [{ event: "pre_tool_use", mode: "observe", tool: "ghost" }],
    }));
    expect(result.ok).toBe(false);
    expect(
      result.issues.some((i) => i.kind === "lint" && i.rule === "tool-ref"),
    ).toBe(true);
  });

  it("flags tools referencing unknown mcp_servers", () => {
    const result = validateContract(baseContract({
      tools: [
        {
          id: "remote_tool",
          input_schema: { type: "object" },
          source: { kind: "mcp", server: "ghost-server" },
        },
      ],
    }));
    expect(result.ok).toBe(false);
    expect(
      result.issues.some((i) => i.kind === "lint" && i.rule === "mcp-server-ref"),
    ).toBe(true);
  });

  it("flags an example whose declared binding mismatches its code", () => {
    const result = validateContract({
      airlock: "0.3",
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
    airlock: "0.3",
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
