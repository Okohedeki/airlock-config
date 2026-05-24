import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { validateContractFile } from "../src/validate/index.js";
import {
  buildRegistryEntry,
  searchRegistry,
  type RegistryEntry,
} from "../src/registry/index.js";

const SUPPLIER = resolve(__dirname, "..", "examples", "supplier-agent.airlock.yaml");

function loadSupplierEntry(): RegistryEntry {
  const result = validateContractFile(SUPPLIER);
  if (!result.ok || !result.contract) throw new Error("contract not valid");
  return buildRegistryEntry(
    result.contract,
    "https://example.com/.well-known/airlock.yaml",
    { now: () => new Date("2026-05-23T19:00:00Z") },
  );
}

describe("buildRegistryEntry", () => {
  it("derives every binding indexable field from the contract", () => {
    const entry = loadSupplierEntry();

    expect(entry.name).toBe("acme-supplier-agent");
    expect(entry.version).toBe("1.0.0");
    expect(entry.airlock_spec).toBe("0.4.1");
    expect(entry.contract_url).toBe("https://example.com/.well-known/airlock.yaml");
    expect(entry.category.industry).toBe("procurement");
    expect(entry.category.capability).toBe("transaction_processing");
    expect(entry.category.subcategory).toBe("po-confirmation-and-fulfillment");
    expect(entry.region?.data_residency).toContain("us-east");
    expect(entry.region?.serves_regions).toContain("eu-central");
    expect(entry.compliance?.some((c) => c.standard === "SOC2_TYPE_2" && c.status === "certified")).toBe(true);
    expect(entry.auth_model?.methods).toContain("oauth2_client_credentials");
    expect(entry.auth_model?.enrollment).toBe("enterprise_only");
    expect(entry.pricing?.model).toBe("enterprise");
    expect(entry.tags).toContain("purchase-order");
    expect(entry.skills).toEqual(expect.arrayContaining(["confirm_po", "cancel_po", "query_inventory"]));
    expect(entry.indexed_at).toBe("2026-05-23T19:00:00.000Z");
  });

  it("includes rule keywords + summaries from the authority block", () => {
    const entry = loadSupplierEntry();
    expect(entry.rule_keywords).toContain("auto_accept");
    expect(entry.rule_keywords).toContain("delivery_date");
    expect(entry.rule_summaries?.some((s) => s.toLowerCase().includes("auto-accept"))).toBe(true);
  });

  it("omits optional fields cleanly when the contract doesn't set them", () => {
    const minimalContract = {
      airlock: "0.4",
      agent: { name: "noop", version: "0.1.0" },
      category: { industry: "other" as const, capability: "other" as const },
      skills: [{ id: "ping", input: {}, output: {} }],
    };
    const entry = buildRegistryEntry(
      minimalContract,
      "https://example.com/x",
      { now: () => new Date("2026-01-01") },
    );
    expect(entry.region).toBeUndefined();
    expect(entry.compliance).toBeUndefined();
    expect(entry.auth_model).toBeUndefined();
    expect(entry.pricing).toBeUndefined();
    expect(entry.tags).toBeUndefined();
    expect(entry.rule_keywords).toBeUndefined();
    expect(entry.rule_summaries).toBeUndefined();
  });
});

describe("searchRegistry — filter composition", () => {
  function fixture(): RegistryEntry[] {
    return [
      loadSupplierEntry(),
      {
        name: "fintech-quoter",
        version: "1.0.0",
        airlock_spec: "0.4",
        contract_url: "https://example.com/fintech",
        description: "Returns FX quotes",
        category: { industry: "fintech", capability: "lookup" },
        region: { serves_regions: ["us-east", "eu-west"] },
        compliance: [{ standard: "SOC2_TYPE_2", status: "certified" }],
        auth_model: { methods: ["api_key"], enrollment: "open" },
        pricing: { model: "metered", unit: "per_call" },
        tags: ["fx", "quotes"],
        skills: ["quote_fx"],
        indexed_at: "2026-01-01T00:00:00.000Z",
      },
    ];
  }

  it("filters by industry", async () => {
    const r = await searchRegistry({ industry: "procurement" }, { entries: fixture() });
    expect(r.map((e) => e.name)).toEqual(["acme-supplier-agent"]);
  });

  it("filters by region (matches data_residency OR serves_regions)", async () => {
    const r = await searchRegistry({ region: "eu-west" }, { entries: fixture() });
    expect(r.length).toBe(2);
  });

  it("filters by compliance", async () => {
    const r = await searchRegistry({ compliance: "HIPAA" }, { entries: fixture() });
    expect(r.length).toBe(0);
  });

  it("composes multiple filters with AND", async () => {
    const r = await searchRegistry(
      { industry: "fintech", auth_method: "api_key", region: "us-east" },
      { entries: fixture() },
    );
    expect(r.map((e) => e.name)).toEqual(["fintech-quoter"]);
  });

  it("filters by rule keyword (substance-search)", async () => {
    const r = await searchRegistry({ keyword: "auto_accept" }, { entries: fixture() });
    expect(r.map((e) => e.name)).toEqual(["acme-supplier-agent"]);
  });

  it("returns empty when no match", async () => {
    const r = await searchRegistry({ industry: "education" }, { entries: fixture() });
    expect(r).toEqual([]);
  });
});
