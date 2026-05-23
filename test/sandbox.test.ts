import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { startSandboxFromFile, type RunningSandbox } from "../src/sandbox/index.js";

const PROCUREMENT = resolve(__dirname, "..", "examples", "procurement.airlock.yaml");

let sandbox: RunningSandbox;

beforeEach(async () => {
  sandbox = await startSandboxFromFile(PROCUREMENT, { port: 0 });
});

afterEach(async () => {
  await sandbox.close();
});

async function call(path: string, body?: unknown): Promise<{ status: number; json: any }> {
  const res = await fetch(`${sandbox.url}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? {} : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json();
  return { status: res.status, json };
}

describe("sandbox — HTTP server", () => {
  it("serves the contract at /.well-known/airlock.yaml", async () => {
    const res = await fetch(`${sandbox.url}/.well-known/airlock.yaml`);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("acme-supplier-agent");
  });

  it("returns a human-readable index at /", async () => {
    const res = await fetch(`${sandbox.url}/`);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("acme-supplier-agent");
    expect(text).toContain("confirm_po");
  });

  it("POST /skills/:id returns the synthesized response for a matching example", async () => {
    const { status, json } = await call("/skills/confirm_po", {
      reference: "PO-1234",
      entity: "known-supplier-1",
      amount: 100,
      delivery_date_change_days: -2,
    });
    expect(status).toBe(200);
    expect(json.code).toBe("ACCEPTED_BY_RULE");
    expect(json.binding).toBe("PROMISE");
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
    expect(status).toBe(202); // HUMAN_REVIEW_LIKELY → 202
    expect(json.code).toBe("HUMAN_REVIEW_LIKELY");
    expect(json.binding).toBe("ESTIMATE");
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

  it("404 + WRONG_AGENT for an unknown route", async () => {
    const res = await fetch(`${sandbox.url}/random/path`);
    expect(res.status).toBe(404);
  });
});
