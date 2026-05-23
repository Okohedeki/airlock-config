import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { startSandboxFromFile, type RunningSandbox } from "../src/sandbox/index.js";
import { conform } from "../src/conform/index.js";
import { validateContractFile } from "../src/validate/index.js";

const SUPPLIER = resolve(__dirname, "..", "examples", "supplier-agent.airlock.yaml");

let sandbox: RunningSandbox;

beforeEach(async () => {
  sandbox = await startSandboxFromFile(SUPPLIER, { port: 0 });
});

afterEach(async () => {
  await sandbox.close();
});

describe("conformance vs sandbox", () => {
  it("the sandbox is fully conformant with the supplier-agent contract", async () => {
    const result = validateContractFile(SUPPLIER);
    if (!result.ok || !result.contract) throw new Error("contract not valid");
    const report = await conform(result.contract, sandbox.url);

    expect(report.ok).toBe(true);
    expect(report.failed).toBe(0);
    expect(report.passed).toBeGreaterThanOrEqual(2);

    for (const c of report.cases.filter((c) => !c.note?.startsWith("skipped"))) {
      expect(c.actual).toBe(c.expected);
    }
  });
});
