import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { startSandboxFromFile, type RunningSandbox } from "../src/sandbox/index.js";

const SUPPLIER = resolve(__dirname, "..", "examples", "supplier-agent.airlock-config.yaml");

let sandbox: RunningSandbox;

beforeEach(async () => {
  sandbox = await startSandboxFromFile(SUPPLIER, { port: 0 });
});

afterEach(async () => {
  await sandbox.close();
});

async function call(
  path: string,
  body?: unknown,
): Promise<{ status: number; json: any; headers: Headers }> {
  const res = await fetch(`${sandbox.url}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? {} : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json();
  return { status: res.status, json, headers: res.headers };
}

describe("sandbox — HTTP server", () => {
  it("serves the contract at /.well-known/airlock-config.yaml", async () => {
    const res = await fetch(`${sandbox.url}/.well-known/airlock-config.yaml`);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("acme-supplier-agent");
  });

  it("returns a human-readable index at / with category info", async () => {
    const res = await fetch(`${sandbox.url}/`);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("acme-supplier-agent");
    expect(text).toContain("procurement");
    expect(text).toContain("transaction_processing");
    expect(text).toContain("confirm_po");
  });

  it("POST /skills/:id returns the synthesized response for a matching example", async () => {
    const { status, json, headers } = await call("/skills/confirm_po", {
      reference: "PO-1234",
      entity: "known-supplier-1",
      amount: 100,
      delivery_date_change_days: -2,
    });
    expect(status).toBe(200);
    expect(json.code).toBe("ACCEPTED_BY_RULE");
    expect(headers.get("x-airlock-config-detail-source")).toBe("example");
    expect(json.detail).toEqual({
      confirmation_id: "C-9001",
      confirmed_date: "2026-05-30",
    });
  });

  it("POST /preflight/:id returns the verdict without synthesizing", async () => {
    const { status, json } = await call("/preflight/confirm_po", {
      reference: "PO-1234",
      entity: "known-supplier-1",
      amount: 100,
      delivery_date_change_days: 14,
    });
    expect(status).toBe(202);
    expect(json.code).toBe("HUMAN_REVIEW_LIKELY");
    expect(json.detail).toBeUndefined();
  });

  it("404 + WRONG_AGENT for an unknown skill", async () => {
    const { status, json } = await call("/skills/telepathy", {});
    expect(status).toBe(404);
    expect(json.code).toBe("WRONG_AGENT");
  });

  it("400 + MALFORMED_INPUT for non-JSON body", async () => {
    const res = await fetch(`${sandbox.url}/skills/confirm_po`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "this is not json",
    });
    expect(res.status).toBe(400);
    const json: any = await res.json();
    expect(json.code).toBe("MALFORMED_INPUT");
  });

  it("v0.3 tool routes are gone — 404 on /tools/:id", async () => {
    const { status } = await call("/tools/bash", { command: "echo hi" });
    expect(status).toBe(404);
  });
});

describe("sandbox — A2A routes (v0.4.1)", () => {
  it("GET /.well-known/agent-card.json returns a valid Agent Card", async () => {
    const res = await fetch(`${sandbox.url}/.well-known/agent-card.json`);
    expect(res.status).toBe(200);
    const card = await res.json() as any;
    expect(card.id).toBe("acme-supplier-agent@1.0.0");
    expect(card.name).toBe("acme-supplier-agent");
    expect(card.url).toContain("/a2a");
    expect(Array.isArray(card.skills)).toBe(true);
    expect(card.skills.map((s: any) => s.name)).toEqual(
      expect.arrayContaining(["confirm_po", "cancel_po", "query_inventory"]),
    );
    expect(card.extensions).toEqual([
      expect.objectContaining({ uri: "airlock-config-contract" }),
    ]);
  });

  it("POST /a2a SendMessage returns a Task with the Verdict in the artifact", async () => {
    const res = await fetch(`${sandbox.url}/a2a`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "SendMessage",
        params: {
          message: {
            parts: [
              {
                skill: "confirm_po",
                data: {
                  reference: "PO-1234",
                  entity: "known-supplier-1",
                  amount: 100,
                  delivery_date_change_days: -2,
                },
              },
            ],
          },
        },
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.jsonrpc).toBe("2.0");
    expect(body.id).toBe(1);
    expect(body.result.state).toBe("TASK_STATE_COMPLETED");
    expect(body.result.artifact.verdict.code).toBe("ACCEPTED_BY_RULE");
  });

  it("POST /a2a SendStreamingMessage returns -32601 with v0.5 pointer", async () => {
    const res = await fetch(`${sandbox.url}/a2a`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "SendMessage" }),
    });
    // sanity — SendMessage with no params is invalid params
    const okShape = (await res.json()) as any;
    expect(okShape.jsonrpc).toBe("2.0");

    const deferred = await fetch(`${sandbox.url}/a2a`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "SendStreamingMessage" }),
    });
    const body = (await deferred.json()) as any;
    expect(body.error.code).toBe(-32601);
    expect(body.error.message).toContain("deferred to v0.5");
  });
});

describe("sandbox — schema-derived faker fallback", () => {
  it("synthesises a schema-valid body when no example matches", async () => {
    // query_inventory has no examples → default ACCEPTED_LIKELY → 200
    const { status, json, headers } = await call("/skills/query_inventory", { sku: "SKU-42" });
    expect(status).toBe(200);
    expect(json.code).toBe("ACCEPTED_LIKELY");
    expect(headers.get("x-airlock-config-detail-source")).toBe("synthesized");
    expect(json.detail).toBeDefined();
    const detail = json.detail as Record<string, unknown>;
    expect(detail.sku).toBe("SKU-42"); // input echo
  });

  it("is deterministic — same input twice produces the same body", async () => {
    const a = await call("/skills/query_inventory", { sku: "SKU-42" });
    const b = await call("/skills/query_inventory", { sku: "SKU-42" });
    expect(JSON.stringify(a.json.detail)).toBe(JSON.stringify(b.json.detail));
  });

  it("authored examples win over the faker", async () => {
    const { headers } = await call("/skills/confirm_po", {
      reference: "PO-1234",
      entity: "known-supplier-1",
      amount: 100,
      delivery_date_change_days: -2,
    });
    expect(headers.get("x-airlock-config-detail-source")).toBe("example");
  });
});
