import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { validateContractFile } from "../src/validate/index.js";
import { preflight } from "../src/preflight/index.js";
import { evaluateRequest, prepareContract } from "../src/pipeline/index.js";
import type { AirlockContract } from "../src/validate/types.js";

const SUPPLIER = resolve(__dirname, "..", "examples", "supplier-agent.airlock.yaml");

function loadSupplier(): AirlockContract {
  const result = validateContractFile(SUPPLIER);
  if (!result.ok || !result.contract) {
    throw new Error(`supplier-agent example is not valid: ${JSON.stringify(result.issues, null, 2)}`);
  }
  return result.contract;
}

describe("pipeline — skill calls, happy path", () => {
  it("ACCEPTED_BY_RULE for a small date change (PROMISE)", () => {
    const contract = loadSupplier();
    const v = preflight(contract, {
      skill: "confirm_po",
      input: {
        reference: "PO-1234",
        entity: "known-supplier-1",
        amount: 100,
        delivery_date_change_days: -2,
      },
    });
    expect(v.code).toBe("ACCEPTED_BY_RULE");
    expect(v.binding).toBe("PROMISE");
    expect(v.ref).toBe("accept-small-date-changes");
    expect(v.action).toBe("UNILATERAL_COMMIT");
  });

  it("HUMAN_REVIEW_LIKELY for a large date change (ESTIMATE)", () => {
    const contract = loadSupplier();
    const v = preflight(contract, {
      skill: "confirm_po",
      input: {
        reference: "PO-1234",
        entity: "known-supplier-1",
        amount: 100,
        delivery_date_change_days: 14,
      },
    });
    expect(v.code).toBe("HUMAN_REVIEW_LIKELY");
    expect(v.binding).toBe("ESTIMATE");
    expect(v.ref).toBe("review-large-date-changes");
  });

  it("COUNTER_OFFER_LIKELY for a large quantity change (ESTIMATE)", () => {
    const contract = loadSupplier();
    const v = preflight(contract, {
      skill: "confirm_po",
      input: {
        reference: "PO-1234",
        entity: "known-supplier-1",
        amount: 100,
        quantity_change_pct: 20,
      },
    });
    expect(v.code).toBe("COUNTER_OFFER_LIKELY");
    expect(v.binding).toBe("ESTIMATE");
    expect(v.action).toBe("COUNTER_OFFER");
  });
});

describe("pipeline — instant_failures", () => {
  it("OUT_OF_SCOPE for an unknown entity (PROMISE)", () => {
    const contract = loadSupplier();
    const v = preflight(contract, {
      skill: "confirm_po",
      input: { reference: "PO-1234", entity: "random-vendor", amount: 100 },
    });
    expect(v.code).toBe("OUT_OF_SCOPE");
    expect(v.binding).toBe("PROMISE");
    expect(v.ref).toBe("unknown-entity");
  });

  it("MISSING_INPUT when schema requires a field that's absent", () => {
    const contract = loadSupplier();
    const v = preflight(contract, {
      skill: "confirm_po",
      input: { entity: "known-supplier-1", amount: 100 },
    });
    expect(v.code).toBe("MISSING_INPUT");
    expect(v.binding).toBe("PROMISE");
  });

  it("WRONG_AGENT for an unknown skill", () => {
    const contract = loadSupplier();
    const v = preflight(contract, { skill: "telepathy", input: {} });
    expect(v.code).toBe("WRONG_AGENT");
    expect(v.binding).toBe("PROMISE");
  });
});

describe("pipeline — caching", () => {
  it("prepareContract caches expression ASTs across calls", () => {
    const contract = loadSupplier();
    const prepared = prepareContract(contract);
    expect(prepared.exprCache.size).toBe(0);
    evaluateRequest(prepared, {
      skill: "confirm_po",
      input: { reference: "PO-1", entity: "known-supplier-1", amount: 1 },
    });
    const sizeAfterFirst = prepared.exprCache.size;
    expect(sizeAfterFirst).toBeGreaterThan(0);
    evaluateRequest(prepared, {
      skill: "confirm_po",
      input: { reference: "PO-2", entity: "known-supplier-1", amount: 2 },
    });
    expect(prepared.exprCache.size).toBe(sizeAfterFirst);
  });
});

describe("pipeline — rule summary surfaces in verdict reason", () => {
  it("uses rule.summary when outcome.message is absent", () => {
    const contract = loadSupplier();
    const v = preflight(contract, {
      skill: "confirm_po",
      input: { reference: "PO-9", entity: "known-supplier-1", amount: 100, delivery_date_change_days: 14 },
    });
    // review-large-date-changes has no `message` on outcome → reason falls back to summary.
    expect(v.reason).toContain("human reviewer");
  });
});
