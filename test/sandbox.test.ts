import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { startSandboxFromFile, type RunningSandbox } from "../src/sandbox/index.js";

const HARNESS = resolve(__dirname, "..", "examples", "agent-harness.airlock.yaml");

let sandbox: RunningSandbox;

beforeEach(async () => {
  sandbox = await startSandboxFromFile(HARNESS, { port: 0 });
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
  it("serves the contract at /.well-known/airlock.yaml", async () => {
    const res = await fetch(`${sandbox.url}/.well-known/airlock.yaml`);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("airlock-codegen-agent");
  });

  it("returns a human-readable index at /", async () => {
    const res = await fetch(`${sandbox.url}/`);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("airlock-codegen-agent");
    expect(text).toContain("analyze_code");
    expect(text).toContain("Tools");
    expect(text).toContain("bash");
  });

  it("POST /skills/:id returns the synthesized response for a matching example", async () => {
    const { status, json, headers } = await call("/skills/analyze_code", {
      path: "src/expr/index.ts",
    });
    expect(status).toBe(200);
    expect(json.code).toBe("ACCEPTED_BY_RULE");
    expect(json.binding).toBe("PROMISE");
    expect(headers.get("x-airlock-detail-source")).toBe("example");
    expect(json.detail).toEqual({
      path: "src/expr/index.ts",
      summary:
        "Public surface of the expression engine — exports parse/evaluate/walk.",
      risks: [],
      line_count: 65,
    });
  });

  it("POST /preflight/:id returns the verdict without synthesizing", async () => {
    const { status, json } = await call("/preflight/analyze_code", {
      path: "/etc/passwd",
    });
    expect(status).toBe(404); // OUT_OF_SCOPE → 404
    expect(json.code).toBe("OUT_OF_SCOPE");
    expect(json.binding).toBe("PROMISE");
    expect(json.detail).toBeUndefined();
  });

  it("404 + WRONG_AGENT for an unknown skill", async () => {
    const { status, json } = await call("/skills/telepathy", {});
    expect(status).toBe(404);
    expect(json.code).toBe("WRONG_AGENT");
  });

  it("400 + MALFORMED_INPUT for non-JSON body", async () => {
    const res = await fetch(`${sandbox.url}/skills/analyze_code`, {
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

describe("sandbox — schema-derived faker fallback (v0.3, ADR 0005)", () => {
  it("synthesises a schema-valid body when no example matches", async () => {
    // run_command has no examples; preflight returns DEPENDS_ON_STATE (judgment).
    const { status, json, headers } = await call("/skills/run_command", {
      command: "echo hi",
    });
    // DEPENDS_ON_STATE maps to 202
    expect(status).toBe(202);
    expect(json.code).toBe("DEPENDS_ON_STATE");
    expect(headers.get("x-airlock-detail-source")).toBe("synthesized");
    expect(json.detail).toBeDefined();
    // Output schema declares exit_code/stdout/stderr — at least one should appear
    const detail = json.detail as Record<string, unknown>;
    expect(
      "exit_code" in detail || "stdout" in detail || "stderr" in detail,
    ).toBe(true);
  });

  it("is deterministic — same input twice produces the same body", async () => {
    const a = await call("/skills/run_command", { command: "echo hi" });
    const b = await call("/skills/run_command", { command: "echo hi" });
    expect(JSON.stringify(a.json.detail)).toBe(JSON.stringify(b.json.detail));
  });

  it("authored examples win over the faker", async () => {
    const { headers } = await call("/skills/analyze_code", {
      path: "src/expr/index.ts",
    });
    expect(headers.get("x-airlock-detail-source")).toBe("example");
  });
});

describe("sandbox — tool routes (v0.3)", () => {
  it("POST /preflight-tool/bash returns REFUSED_BY_POLICY for rm -rf", async () => {
    const { status, json } = await call("/preflight-tool/bash", {
      command: "rm -rf /tmp/foo",
    });
    expect(status).toBe(400); // REFUSED_BY_POLICY → 400
    expect(json.code).toBe("REFUSED_BY_POLICY");
    expect(json.ref).toBe("bash-refuse-rm-rf");
  });

  it("POST /tools/bash returns a synthesized body for an accepted command", async () => {
    const { status, json, headers } = await call("/tools/bash", {
      command: "echo hi",
    });
    expect(status).toBe(200); // ACCEPTED_LIKELY → 200
    expect(json.code).toBe("ACCEPTED_LIKELY");
    expect(headers.get("x-airlock-detail-source")).toBe("synthesized");
    expect(json.detail).toBeDefined();
  });

  it("404 + WRONG_AGENT for an unknown tool", async () => {
    const { status, json } = await call("/tools/telepathy", {});
    expect(status).toBe(404);
    expect(json.code).toBe("WRONG_AGENT");
  });
});
