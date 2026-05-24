import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { validateContractFile } from "../src/validate/index.js";
import { buildAgentCard } from "../src/a2a/index.js";
import type { AirlockConfig } from "../src/validate/types.js";

const SUPPLIER = resolve(__dirname, "..", "examples", "supplier-agent.airlock-config.yaml");

function loadSupplier(): AirlockConfig {
  const result = validateContractFile(SUPPLIER);
  if (!result.ok || !result.contract) throw new Error("contract not valid");
  return result.contract;
}

describe("buildAgentCard — derivation from supplier-agent", () => {
  it("derives the top-level identity fields", () => {
    const contract = loadSupplier();
    const card = buildAgentCard(contract, {
      contractUrl: "https://example.com/.well-known/airlock-config.yaml",
    });
    expect(card.id).toBe("acme-supplier-agent@1.0.0");
    expect(card.name).toBe("acme-supplier-agent");
    expect(card.description).toContain("Confirms purchase orders");
  });

  it("uses a2a.endpoint_url when present", () => {
    const contract = loadSupplier();
    const card = buildAgentCard(contract, {
      contractUrl: "https://example.com/.well-known/airlock-config.yaml",
    });
    expect(card.url).toBe("https://example.com/agents/acme-supplier/a2a");
  });

  it("opts.endpointUrl wins over the contract's a2a.endpoint_url", () => {
    const contract = loadSupplier();
    const card = buildAgentCard(contract, {
      contractUrl: "https://example.com/.well-known/airlock-config.yaml",
      endpointUrl: "https://override.example.com/a2a",
    });
    expect(card.url).toBe("https://override.example.com/a2a");
  });

  it("derives provider from agent.contact", () => {
    const contract = loadSupplier();
    const card = buildAgentCard(contract, {
      contractUrl: "https://example.com/.well-known/airlock-config.yaml",
    });
    expect(card.provider.name).toBe("Acme Supplies Partner Operations");
    expect(card.provider.email).toBe("partner-ops@example.com");
  });

  it("derives capabilities from a2a.capabilities (all false for the supplier example)", () => {
    const contract = loadSupplier();
    const card = buildAgentCard(contract, {
      contractUrl: "https://example.com/.well-known/airlock-config.yaml",
    });
    expect(card.capabilities).toEqual({
      streaming: false,
      push_notifications: false,
      state_transition_history: false,
    });
  });

  it("maps every Airlock skill to an A2A skill", () => {
    const contract = loadSupplier();
    const card = buildAgentCard(contract, {
      contractUrl: "https://example.com/.well-known/airlock-config.yaml",
    });
    const names = card.skills.map((s) => s.name).sort();
    expect(names).toEqual(["cancel_po", "confirm_po", "query_inventory"]);
    const confirm = card.skills.find((s) => s.name === "confirm_po");
    expect(confirm?.description).toContain("Confirm a purchase order");
    expect(confirm?.inputSchema).toBeDefined();
    expect(confirm?.outputSchema).toBeDefined();
    expect(confirm?.mediaTypes).toEqual({
      input: ["application/json"],
      output: ["application/json"],
    });
  });

  it("derives securitySchemes from auth_model (oauth2_client_credentials + mtls)", () => {
    const contract = loadSupplier();
    const card = buildAgentCard(contract, {
      contractUrl: "https://example.com/.well-known/airlock-config.yaml",
    });
    expect(card.securitySchemes).toHaveProperty("oauth2_client_credentials");
    expect(card.securitySchemes).toHaveProperty("mtls");
    // The mTLS entry should be type mutualTLS
    expect((card.securitySchemes.mtls as { type: string }).type).toBe("mutualTLS");
    // Each scheme is an acceptable alternative
    expect(card.security.length).toBe(2);
  });

  it("includes an airlock-config-contract back-pointer extension", () => {
    const contract = loadSupplier();
    const card = buildAgentCard(contract, {
      contractUrl: "https://example.com/.well-known/airlock-config.yaml",
    });
    expect(card.extensions).toEqual([
      { uri: "airlock-config-contract", value: "https://example.com/.well-known/airlock-config.yaml" },
    ]);
  });

  it("leaves signature undefined in v0.5 (Stage 3 deferred to v0.6)", () => {
    const contract = loadSupplier();
    const card = buildAgentCard(contract, {
      contractUrl: "https://example.com/.well-known/airlock-config.yaml",
    });
    expect(card.signature).toBeUndefined();
  });
});

describe("buildAgentCard — defaults when a2a block is absent", () => {
  function minimal(): AirlockConfig {
    return {
      airlock_config: "0.5",
      agent: { name: "hello-agent", version: "0.1.0", description: "A minimal agent" },
      category: { industry: "other", capability: "other" },
      skills: [
        {
          id: "ping",
          input: { type: "object" },
          output: { type: "object", properties: { pong: { type: "boolean" } } },
        },
      ],
    };
  }

  it("derives endpoint URL from the contract URL host", () => {
    const card = buildAgentCard(minimal(), {
      contractUrl: "https://hello.example.com/.well-known/airlock-config.yaml",
    });
    expect(card.url).toBe("https://hello.example.com/a2a");
  });

  it("defaults capabilities to all-false", () => {
    const card = buildAgentCard(minimal(), {
      contractUrl: "https://hello.example.com/.well-known/airlock-config.yaml",
    });
    expect(card.capabilities).toEqual({
      streaming: false,
      push_notifications: false,
      state_transition_history: false,
    });
  });

  it("defaults mediaTypes to application/json on each skill", () => {
    const card = buildAgentCard(minimal(), {
      contractUrl: "https://hello.example.com/.well-known/airlock-config.yaml",
    });
    expect(card.skills[0]?.mediaTypes).toEqual({
      input: ["application/json"],
      output: ["application/json"],
    });
  });

  it("falls back to security: [{}] when no auth_model is declared", () => {
    const card = buildAgentCard(minimal(), {
      contractUrl: "https://hello.example.com/.well-known/airlock-config.yaml",
    });
    expect(card.securitySchemes).toEqual({});
    expect(card.security).toEqual([{}]);
  });
});
