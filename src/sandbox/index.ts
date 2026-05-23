/**
 * The sandbox engine. Stands up an HTTP server that responds to inbound calls
 * per the contract's authority rules. Zero model calls, zero tokens —
 * responses come from declarative rules + the contract's `examples`.
 *
 * Routes:
 *   GET  /.well-known/airlock.yaml      The contract itself (raw)
 *   GET  /                              Human-friendly index (lists skills + endpoints)
 *   POST /skills/:skillId               Real call — runs the full pipeline, synthesizes a response
 *   POST /preflight/:skillId            Pre-flight verdict only (no side effects)
 *
 * Designed for `airlock sandbox <contract.yaml>` — single-tenant, single-contract,
 * single-process. Not a multi-tenant runtime; that's Layer 3.
 */

import { createServer, type IncomingMessage, type ServerResponse, type Server } from "node:http";
import { readFileSync } from "node:fs";
import type { AirlockContract } from "../validate/types.js";
import {
  evaluateRequest,
  prepareContract,
  synthesizeDetail,
  type PreparedContract,
  type Verdict,
} from "../pipeline/index.js";

export type SandboxOptions = {
  port?: number;
  host?: string;
  /**
   * Raw contract source — served at /.well-known/airlock.yaml verbatim. If omitted,
   * we serve YAML stringified from the parsed contract (still valid, may be reformatted).
   */
  contractSource?: string;
};

export type RunningSandbox = {
  server: Server;
  port: number;
  url: string;
  close: () => Promise<void>;
};

export async function startSandbox(
  contract: AirlockContract,
  opts: SandboxOptions = {},
): Promise<RunningSandbox> {
  const prepared = prepareContract(contract);
  const server = createServer((req, res) => {
    handleRequest(req, res, prepared, contract, opts.contractSource).catch((err) => {
      writeJson(res, 500, {
        code: "FAILED",
        binding: "PROMISE",
        reason: `internal error: ${err instanceof Error ? err.message : String(err)}`,
      });
    });
  });

  await new Promise<void>((resolve) => server.listen(opts.port ?? 0, opts.host ?? "127.0.0.1", resolve));
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : (opts.port ?? 0);
  const host = opts.host ?? "127.0.0.1";

  return {
    server,
    port,
    url: `http://${host}:${port}`,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  prepared: PreparedContract,
  contract: AirlockContract,
  contractSource: string | undefined,
): Promise<void> {
  const url = new URL(req.url ?? "/", "http://_/");
  const method = req.method ?? "GET";
  const pathname = url.pathname;

  if (method === "GET" && pathname === "/.well-known/airlock.yaml") {
    serveContract(res, contract, contractSource);
    return;
  }
  if (method === "GET" && pathname === "/") {
    serveIndex(res, contract);
    return;
  }

  // /skills/:skillId  or  /preflight/:skillId
  const skillMatch = /^\/(skills|preflight)\/([a-z][a-z0-9_]*)$/.exec(pathname);
  if (method === "POST" && skillMatch) {
    const mode = skillMatch[1] as "skills" | "preflight";
    const skillId = skillMatch[2]!;
    const body = await readJsonBody(req);
    if ("error" in body) {
      writeJson(res, 400, {
        code: "MALFORMED_INPUT",
        binding: "PROMISE",
        reason: body.error,
      });
      return;
    }
    const verdict = evaluateRequest(prepared, { skill: skillId, input: body.value });
    if (mode === "preflight") {
      writeJson(res, statusFromVerdict(verdict), verdict);
      return;
    }
    // sandbox: synthesize detail from examples
    const detail = synthesizeDetail(contract, skillId, verdict);
    const withDetail: Verdict = detail === undefined ? verdict : { ...verdict, detail };
    writeJson(res, statusFromVerdict(verdict), withDetail);
    return;
  }

  writeJson(res, 404, {
    code: "WRONG_AGENT",
    binding: "PROMISE",
    reason: `No route for ${method} ${pathname}.`,
  });
}

function serveContract(res: ServerResponse, contract: AirlockContract, contractSource: string | undefined): void {
  if (contractSource !== undefined) {
    res.writeHead(200, { "content-type": "application/yaml; charset=utf-8" });
    res.end(contractSource);
    return;
  }
  res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(contract, null, 2));
}

function serveIndex(res: ServerResponse, contract: AirlockContract): void {
  const lines: string[] = [
    `# ${contract.agent.name} — airlock sandbox`,
    "",
    contract.agent.description ?? "",
    "",
    "## Discovery",
    "",
    "- Contract:  GET  /.well-known/airlock.yaml",
    "",
    "## Skills",
    "",
  ];
  for (const skill of contract.skills) {
    lines.push(`- POST /skills/${skill.id}        — real call (synthesized response)`);
    lines.push(`  POST /preflight/${skill.id}     — verdict only, no side effect`);
    if (skill.description) lines.push(`  ${skill.description}`);
  }
  lines.push("");
  lines.push("## Status codes");
  lines.push("");
  lines.push("Every response carries { code, binding, reason, ref, [action], [detail] }.");
  lines.push("PROMISE codes are bound by the publisher; ESTIMATE codes are predictions.");
  res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
  res.end(lines.join("\n"));
}

function statusFromVerdict(v: Verdict): number {
  switch (v.code) {
    case "ACCEPTED_BY_RULE":
    case "ACCEPTED_LIKELY":
    case "COMPLETED":
    case "SUBMITTED":
      return 200;
    case "COUNTER_OFFER_LIKELY":
    case "HUMAN_REVIEW_LIKELY":
    case "DEPENDS_ON_STATE":
    case "WORKING":
    case "INPUT_REQUIRED":
      return 202;
    case "UNAUTHENTICATED":
      return 401;
    case "UNAUTHORIZED":
      return 403;
    case "WRONG_AGENT":
    case "OUT_OF_SCOPE":
      return 404;
    case "RATE_LIMITED":
      return 429;
    case "SCHEMA_INVALID":
    case "MISSING_INPUT":
    case "MALFORMED_INPUT":
    case "REFUSED_BY_POLICY":
      return 400;
    case "FAILED":
      return 500;
    case "CANCELED":
    case "ESCALATED":
      return 200;
    default:
      return 200;
  }
}

function writeJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body, null, 2));
}

async function readJsonBody(req: IncomingMessage): Promise<{ value: unknown } | { error: string }> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }
  const raw = Buffer.concat(chunks).toString("utf-8").trim();
  if (raw.length === 0) return { value: {} };
  try {
    return { value: JSON.parse(raw) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { error: `request body is not valid JSON: ${message}` };
  }
}

/**
 * Convenience: load contract from disk, start the sandbox.
 */
export async function startSandboxFromFile(
  path: string,
  opts: SandboxOptions = {},
): Promise<RunningSandbox> {
  const source = readFileSync(path, "utf-8");
  const { validateContractFile } = await import("../validate/index.js");
  const result = validateContractFile(path);
  if (!result.ok || !result.contract) {
    const summary = result.issues
      .map((i) => `  ${i.path}: ${i.message}`)
      .join("\n");
    throw new Error(`Cannot start sandbox — contract is invalid:\n${summary}`);
  }
  return startSandbox(result.contract, { ...opts, contractSource: source });
}
