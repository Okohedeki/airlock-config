import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { validateContract, validateContractFile } from "../src/index.js";

const EXAMPLES = resolve(__dirname, "..", "examples");

describe("validateContractFile (example contracts)", () => {
  it("accepts the minimal example", () => {
    const result = validateContractFile(resolve(EXAMPLES, "minimal.airlock-config.yaml"));
    expect(result.ok, formatIssues(result)).toBe(true);
  });

  it("accepts the supplier-agent flagship example", () => {
    const result = validateContractFile(resolve(EXAMPLES, "supplier-agent.airlock-config.yaml"));
    expect(result.ok, formatIssues(result)).toBe(true);
  });
});

describe("v0.5 version gate", () => {
  for (const v of ["0.1", "0.2", "0.3"]) {
    it(`rejects a v${v} contract with a migration hint`, () => {
      const result = validateContract({
        airlock: v,
        agent: { name: "a", version: "0.1.0" },
        skills: [{ id: "ping", input: {}, output: {} }],
      });
      expect(result.ok).toBe(false);
      expect(
        result.issues.some((i) => i.message.includes("migration-v03-to-v04")),
      ).toBe(true);
    });
  }

  for (const v of ["0.4", "0.4.1"]) {
    it(`rejects a v${v} contract (legacy "airlock" key) with a migration-v04-to-v05 hint`, () => {
      const result = validateContract({
        airlock: v,
        agent: { name: "a", version: "0.1.0" },
        category: { industry: "other", capability: "other" },
        skills: [{ id: "ping", input: {}, output: {} }],
      });
      expect(result.ok).toBe(false);
      expect(
        result.issues.some((i) => i.message.includes("migration-v04-to-v05")),
      ).toBe(true);
    });
  }
});

describe("structural validation", () => {
  it("rejects a contract missing airlock_config spec version", () => {
    const result = validateContract({
      agent: { name: "a", version: "0.1.0" },
      category: { industry: "other", capability: "other" },
      skills: [{ id: "x", input: {}, output: {} }],
    });
    expect(result.ok).toBe(false);
  });

  it("rejects a contract missing the required category block", () => {
    const result = validateContract({
      airlock_config: "0.5",
      agent: { name: "a", version: "0.1.0" },
      skills: [{ id: "ping", input: {}, output: {} }],
    });
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.message.toLowerCase().includes("category"))).toBe(true);
  });

  it("rejects a contract missing skills", () => {
    const result = validateContract({
      airlock_config: "0.5",
      agent: { name: "a", version: "0.1.0" },
      category: { industry: "other", capability: "other" },
    });
    expect(result.ok).toBe(false);
  });

  it("rejects an unknown industry value", () => {
    const result = validateContract(baseContract({
      category: { industry: "telepathy", capability: "lookup" },
    }));
    expect(result.ok).toBe(false);
  });

  it("rejects an unknown compliance standard", () => {
    const result = validateContract(baseContract({
      compliance: [{ standard: "FAKE_STANDARD", status: "certified" }],
    }));
    expect(result.ok).toBe(false);
  });

  it("rejects an unknown auth method", () => {
    const result = validateContract(baseContract({
      auth_model: { methods: ["psychic"], enrollment: "open" },
    }));
    expect(result.ok).toBe(false);
  });

  it("rejects an unknown pricing model", () => {
    const result = validateContract(baseContract({
      pricing: { model: "barter" },
    }));
    expect(result.ok).toBe(false);
  });

  it("rejects an unknown region code", () => {
    const result = validateContract(baseContract({
      region: { data_residency: ["mars"] },
    }));
    expect(result.ok).toBe(false);
  });

  it("rejects v0.3 dev blocks (tools)", () => {
    const result = validateContract(baseContract({
      tools: [{ id: "bash", input_schema: { type: "object" } }],
    }));
    expect(result.ok).toBe(false);
  });

  it("rejects v0.3 dev blocks (hooks)", () => {
    const result = validateContract(baseContract({
      hooks: [{ event: "before_skill", mode: "observe" }],
    }));
    expect(result.ok).toBe(false);
  });

  it("rejects v0.3 dev blocks (mcp_servers, secrets, delegates_to)", () => {
    for (const block of [
      { mcp_servers: [{ name: "x" }] },
      { secrets: [{ name: "X" }] },
      { delegates_to: ["https://example.com"] },
    ]) {
      const result = validateContract(baseContract(block));
      expect(result.ok).toBe(false);
    }
  });

  it("rejects v0.3 agent.harness", () => {
    const result = validateContract({
      airlock_config: "0.5",
      agent: { name: "a", version: "0.1.0", harness: { framework: "claude-code" } },
      category: { industry: "other", capability: "other" },
      skills: [{ id: "ping", input: {}, output: {} }],
    });
    expect(result.ok).toBe(false);
  });

  it("rejects an authority rule with no skill (skill is required)", () => {
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
});

describe("semantic lint", () => {
  it("flags a deterministic rule producing an ESTIMATE code", () => {
    const result = validateContract(baseContract({
      authority: [
        {
          id: "bad-determinism",
          summary: "bad",
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

  it("flags authority rules referencing unknown skills", () => {
    const result = validateContract(baseContract({
      authority: [
        {
          id: "r1",
          summary: "x",
          skill: "does-not-exist",
          binding_class: "deterministic",
          when: "true",
          then: { code: "ACCEPTED_BY_RULE" },
        },
      ],
    }));
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.kind === "lint" && i.rule === "skill-ref")).toBe(true);
  });

  it("flags a deterministic rule whose when references runtime state", () => {
    const result = validateContract(baseContract({
      authority: [
        {
          id: "uses-runtime-state",
          summary: "x",
          skill: "ping",
          binding_class: "deterministic",
          when: "inventory.level > 10",
          then: { code: "ACCEPTED_BY_RULE" },
        },
      ],
    }));
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.kind === "lint" && i.rule === "when-runtime-state")).toBe(true);
  });

  it("warns when an authority rule has no summary", () => {
    const result = validateContract(baseContract({
      authority: [
        {
          id: "no-summary",
          skill: "ping",
          binding_class: "deterministic",
          when: "true",
          then: { code: "ACCEPTED_BY_RULE" },
        },
      ],
    }));
    expect(result.ok).toBe(true);
    expect(
      result.issues.some(
        (i) => i.kind === "lint" && i.rule === "rule-summary-missing" && i.level === "warning",
      ),
    ).toBe(true);
  });

  it("warns on a guardrails topic outside the recommended vocabulary", () => {
    const result = validateContract(baseContract({
      guardrails: { refused_topics: ["medical_diagnosis", "telepathy_endorsement"] },
    }));
    expect(result.ok).toBe(true);
    expect(
      result.issues.some(
        (i) => i.kind === "lint" && i.rule === "guardrail-topic-vocab" && i.level === "warning",
      ),
    ).toBe(true);
  });

  it("flags SLA keys referencing unknown skills", () => {
    const result = validateContract(baseContract({
      sla: { telepathy: { respond_within: "30s" } },
    }));
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.kind === "lint" && i.rule === "sla-ref")).toBe(true);
  });

  it("flags an example whose declared binding mismatches its code", () => {
    const result = validateContract(baseContract({
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
                binding: "PROMISE",
              },
            },
          ],
        },
      ],
    }));
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.kind === "lint" && i.rule === "example-binding-vs-code")).toBe(true);
  });
});

function baseContract(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    airlock_config: "0.5",
    agent: { name: "test-agent", version: "0.1.0" },
    category: { industry: "other", capability: "other" },
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
