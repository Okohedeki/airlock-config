#!/usr/bin/env node
/**
 * Airlock CLI entry point.
 *
 * v1 commands:
 *   airlock validate <path>     Validate a contract file (YAML or JSON).
 *
 * More commands land as the build order progresses:
 *   test, check, preflight, build, search, codegen, init.
 */

import { readFileSync } from "node:fs";
import { Command } from "commander";
import { validateContractFile, type ValidationIssue } from "./index.js";
import { startSandboxFromFile } from "./sandbox/index.js";
import { preflight } from "./preflight/index.js";
import { buildFromFile } from "./render/index.js";
import { conform, formatReport } from "./conform/index.js";

const program = new Command();

program
  .name("airlock")
  .description("Contract format + tooling for agent-driven services")
  .version("0.1.0");

program
  .command("validate")
  .description("Validate an Airlock contract file (YAML or JSON)")
  .argument("<path>", "path to contract file")
  .option("--json", "emit findings as JSON instead of human-readable output")
  .action((path: string, opts: { json?: boolean }) => {
    const result = validateContractFile(path);

    if (opts.json) {
      process.stdout.write(JSON.stringify(result, null, 2) + "\n");
      process.exit(result.ok ? 0 : 1);
    }

    if (result.ok && result.issues.length === 0) {
      process.stdout.write(`OK  ${path}\n`);
      process.exit(0);
    }

    const errors = result.issues.filter(isError);
    const warnings = result.issues.filter(isWarning);

    if (errors.length > 0) {
      process.stderr.write(`FAIL ${path}\n\n`);
      for (const issue of errors) {
        process.stderr.write(formatIssue(issue, "error") + "\n");
      }
    }

    if (warnings.length > 0) {
      const heading = errors.length > 0 ? "Warnings:\n" : `WARN ${path}\n\n`;
      process.stderr.write(heading);
      for (const issue of warnings) {
        process.stderr.write(formatIssue(issue, "warning") + "\n");
      }
    }

    process.exit(errors.length > 0 ? 1 : 0);
  });

program
  .command("sandbox")
  .description("Run a local sandbox HTTP server that responds per the contract")
  .argument("<path>", "path to contract file")
  .option("-p, --port <port>", "port to listen on (default: 8080)", "8080")
  .option("-H, --host <host>", "host to bind (default: 127.0.0.1)", "127.0.0.1")
  .action(async (path: string, opts: { port: string; host: string }) => {
    const port = Number(opts.port);
    if (!Number.isInteger(port) || port < 0) {
      process.stderr.write(`airlock: --port must be a non-negative integer, got "${opts.port}"\n`);
      process.exit(2);
    }
    const sandbox = await startSandboxFromFile(path, { port, host: opts.host });
    process.stdout.write(`airlock sandbox listening at ${sandbox.url}\n`);
    process.stdout.write(`  GET  ${sandbox.url}/.well-known/airlock.yaml\n`);
    process.stdout.write(`  POST ${sandbox.url}/skills/<skill_id>\n`);
    process.stdout.write(`  POST ${sandbox.url}/preflight/<skill_id>\n`);
    process.stdout.write(`Ctrl+C to stop.\n`);

    process.on("SIGINT", () => {
      sandbox.close().finally(() => process.exit(0));
    });
  });

program
  .command("preflight")
  .description("Compute the pre-flight verdict for an input against a contract")
  .argument("<path>", "path to contract file")
  .requiredOption("-s, --skill <id>", "skill id to evaluate against")
  .option("-i, --input <json>", "input payload as JSON literal")
  .option("-f, --input-file <path>", "input payload from a JSON file")
  .action((path: string, opts: { skill: string; input?: string; inputFile?: string }) => {
    const result = validateContractFile(path);
    if (!result.ok || !result.contract) {
      process.stderr.write(`Cannot run preflight — contract is invalid:\n`);
      for (const issue of result.issues) {
        process.stderr.write(`  ${issue.path}: ${issue.message}\n`);
      }
      process.exit(1);
    }
    const inputRaw = opts.inputFile
      ? readFileSync(opts.inputFile, "utf-8")
      : (opts.input ?? "{}");
    let input: unknown;
    try {
      input = JSON.parse(inputRaw);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      process.stderr.write(`airlock: --input is not valid JSON: ${message}\n`);
      process.exit(2);
    }
    const verdict = preflight(result.contract, { skill: opts.skill, input });
    process.stdout.write(JSON.stringify(verdict, null, 2) + "\n");
  });

program
  .command("check")
  .description("Run conformance — does the real agent at <url> match the contract's PROMISE verdicts?")
  .argument("<path>", "path to contract file")
  .requiredOption("-u, --url <url>", "URL of the live agent to test against")
  .option("--json", "emit the full report as JSON")
  .action(async (path: string, opts: { url: string; json?: boolean }) => {
    const result = validateContractFile(path);
    if (!result.ok || !result.contract) {
      process.stderr.write(`Cannot run check — contract is invalid:\n`);
      for (const issue of result.issues) {
        process.stderr.write(`  ${issue.path}: ${issue.message}\n`);
      }
      process.exit(1);
    }
    const report = await conform(result.contract, opts.url);
    if (opts.json) {
      process.stdout.write(JSON.stringify(report, null, 2) + "\n");
    } else {
      process.stdout.write(formatReport(report) + "\n");
    }
    process.exit(report.ok ? 0 : 1);
  });

program
  .command("build")
  .description("Build the static bundle (machine spec + docs + llms.txt) for hosting")
  .argument("<path>", "path to contract file")
  .option("-o, --out <dir>", "output directory (default: ./dist)", "./dist")
  .action((path: string, opts: { out: string }) => {
    const result = buildFromFile(path, { outDir: opts.out });
    process.stdout.write(`built ${result.files.length} files in ${result.outDir}\n`);
    for (const f of result.files) {
      process.stdout.write(`  ${f}\n`);
    }
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`airlock: ${message}\n`);
  process.exit(2);
});

function isError(issue: ValidationIssue): boolean {
  if (issue.kind === "structural") return true;
  return issue.level === "error";
}

function isWarning(issue: ValidationIssue): boolean {
  return issue.kind === "lint" && issue.level === "warning";
}

function formatIssue(issue: ValidationIssue, level: "error" | "warning"): string {
  const tag = level === "error" ? "error" : "warn ";
  const path = issue.path || "(root)";
  if (issue.kind === "structural") {
    return `  ${tag}  ${path}: ${issue.message} [${issue.keyword}]`;
  }
  return `  ${tag}  ${path}: ${issue.message} [${issue.rule}]`;
}
