import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { validateContractFile } from "../src/validate/index.js";
import { preflight } from "../src/preflight/index.js";
import {
  evaluateRequest,
  evaluateToolCall,
  prepareContract,
} from "../src/pipeline/index.js";
import type { AirlockContract } from "../src/validate/types.js";

const HARNESS = resolve(__dirname, "..", "examples", "agent-harness.airlock.yaml");

function loadHarness(): AirlockContract {
  const result = validateContractFile(HARNESS);
  if (!result.ok || !result.contract) {
    throw new Error(`harness example is not valid: ${JSON.stringify(result.issues, null, 2)}`);
  }
  return result.contract;
}

describe("pipeline — skill calls, happy path", () => {
  it("ACCEPTED_BY_RULE for a workspace-relative analyze_code (PROMISE)", () => {
    const contract = loadHarness();
    const v = preflight(contract, {
      skill: "analyze_code",
      input: { path: "src/expr/index.ts" },
    });
    expect(v.code).toBe("ACCEPTED_BY_RULE");
    expect(v.binding).toBe("PROMISE");
    expect(v.ref).toBe("analyze-within-workspace");
    expect(v.action).toBe("UNILATERAL_COMMIT");
  });

  it("OUT_OF_SCOPE (else branch) for an absolute analyze_code path", () => {
    const contract = loadHarness();
    const v = preflight(contract, {
      skill: "analyze_code",
      input: { path: "/etc/passwd" },
    });
    expect(v.code).toBe("OUT_OF_SCOPE");
    expect(v.binding).toBe("PROMISE");
    expect(v.ref).toBe("analyze-within-workspace");
  });

  it("DEPENDS_ON_STATE for run_command (judgment)", () => {
    const contract = loadHarness();
    const v = preflight(contract, {
      skill: "run_command",
      input: { command: "echo hi" },
    });
    expect(v.code).toBe("DEPENDS_ON_STATE");
    expect(v.binding).toBe("ESTIMATE");
    expect(v.ref).toBe("run-command-judgment");
  });
});

describe("pipeline — instant_failures and protocol errors", () => {
  it("MISSING_INPUT when schema requires a field that's absent", () => {
    const contract = loadHarness();
    const v = preflight(contract, {
      skill: "analyze_code",
      input: {},
    });
    expect(v.code).toBe("MISSING_INPUT");
    expect(v.binding).toBe("PROMISE");
  });

  it("WRONG_AGENT for an unknown skill", () => {
    const contract = loadHarness();
    const v = preflight(contract, {
      skill: "telepathy",
      input: {},
    });
    expect(v.code).toBe("WRONG_AGENT");
    expect(v.binding).toBe("PROMISE");
  });
});

describe("pipeline — tool calls (v0.3)", () => {
  it("REFUSED_BY_POLICY for `rm -rf` via the bash tool (PROMISE)", () => {
    const contract = loadHarness();
    const prepared = prepareContract(contract);
    const v = evaluateToolCall(prepared, {
      tool: "bash",
      input: { command: "rm -rf /tmp/foo" },
    });
    expect(v.code).toBe("REFUSED_BY_POLICY");
    expect(v.binding).toBe("PROMISE");
    expect(v.ref).toBe("bash-refuse-rm-rf");
  });

  it("REFUSED_BY_POLICY for a sudo command via the bash tool (PROMISE)", () => {
    const contract = loadHarness();
    const prepared = prepareContract(contract);
    const v = evaluateToolCall(prepared, {
      tool: "bash",
      input: { command: "sudo apt update" },
    });
    expect(v.code).toBe("REFUSED_BY_POLICY");
    expect(v.binding).toBe("PROMISE");
    expect(v.ref).toBe("bash-refuse-sudo");
  });

  it("WRONG_AGENT for an unknown tool", () => {
    const contract = loadHarness();
    const prepared = prepareContract(contract);
    const v = evaluateToolCall(prepared, {
      tool: "telepathy",
      input: {},
    });
    expect(v.code).toBe("WRONG_AGENT");
    expect(v.binding).toBe("PROMISE");
  });

  it("default ACCEPTED_LIKELY for a tool call no rule refuses", () => {
    const contract = loadHarness();
    const prepared = prepareContract(contract);
    const v = evaluateToolCall(prepared, {
      tool: "bash",
      input: { command: "echo hi" },
    });
    expect(v.code).toBe("ACCEPTED_LIKELY");
    expect(v.binding).toBe("ESTIMATE");
  });

  it("does not fire tool-targeted rules during skill evaluation", () => {
    const contract = loadHarness();
    const prepared = prepareContract(contract);
    // run_command receives 'rm -rf' as a string but the bash-* rules are
    // scoped to the bash tool, not the run_command skill. Skill evaluation
    // should hit the judgment rule, not the tool refusals.
    const v = evaluateRequest(prepared, {
      skill: "run_command",
      input: { command: "rm -rf /tmp/foo" },
    });
    expect(v.code).toBe("DEPENDS_ON_STATE");
  });
});

describe("pipeline — caching", () => {
  it("prepareContract caches expression ASTs across calls", () => {
    const contract = loadHarness();
    const prepared = prepareContract(contract);
    expect(prepared.exprCache.size).toBe(0);

    evaluateRequest(prepared, {
      skill: "analyze_code",
      input: { path: "a.ts" },
    });
    const sizeAfterFirst = prepared.exprCache.size;
    expect(sizeAfterFirst).toBeGreaterThan(0);

    evaluateRequest(prepared, {
      skill: "analyze_code",
      input: { path: "b.ts" },
    });
    expect(prepared.exprCache.size).toBe(sizeAfterFirst);
  });
});
