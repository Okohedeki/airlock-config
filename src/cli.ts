#!/usr/bin/env node
/**
 * Airlock CLI entry point.
 */

import { readFileSync } from "node:fs";
import { Command } from "commander";
import { validateContractFile, type ValidationIssue } from "./index.js";
import { startSandboxFromFile } from "./sandbox/index.js";
import { preflight } from "./preflight/index.js";
import { buildFromFile, buildSite } from "./render/index.js";
import { conform, formatReport } from "./conform/index.js";
import {
  buildRegistryEntry,
  searchRegistry,
  type SearchFilters,
} from "./registry/index.js";
import type {
  AuthMethod,
  Capability,
  ComplianceStandard,
  Industry,
  RegionCode,
} from "./validate/types.js";

const program = new Command();

program
  .name("airlock")
  .description("Contract format + tooling for self-deployed business agents")
  .version("0.4.0");

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
      const heading = errors.length > 0 ? "\nWarnings:\n" : `WARN ${path}\n\n`;
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

program
  .command("build-site")
  .description("Build the project site — product home page at root + every example bundle under examples/<name>/")
  .option("-o, --out <dir>", "output directory (default: ./dist)", "./dist")
  .option("-e, --examples <dir>", "examples directory (default: ./examples)", "./examples")
  .option("--featured <name>", "agent name to feature on the home page CTA")
  .option("--repo-url <url>", "override the repo URL in the home page footer")
  .action((opts: { out: string; examples: string; featured?: string; repoUrl?: string }) => {
    const result = buildSite({
      outDir: opts.out,
      examplesDir: opts.examples,
      ...(opts.featured !== undefined ? { featuredExample: opts.featured } : {}),
      ...(opts.repoUrl !== undefined ? { repoUrl: opts.repoUrl } : {}),
    });
    process.stdout.write(`built site with ${result.examples.length} examples in ${result.outDir}\n`);
    for (const f of result.files) {
      process.stdout.write(`  ${f}\n`);
    }
  });

program
  .command("register-entry")
  .description("Emit a registry index entry derived from a validated contract")
  .requiredOption("-c, --contract <path>", "path to contract file")
  .requiredOption("-u, --url <url>", "URL the contract is hosted at")
  .action((opts: { contract: string; url: string }) => {
    const result = validateContractFile(opts.contract);
    if (!result.ok || !result.contract) {
      process.stderr.write(`Cannot build registry entry — contract is invalid:\n`);
      for (const issue of result.issues) {
        process.stderr.write(`  ${issue.path}: ${issue.message}\n`);
      }
      process.exit(1);
    }
    const entry = buildRegistryEntry(result.contract, opts.url);
    process.stdout.write(JSON.stringify(entry, null, 2) + "\n");
  });

program
  .command("search")
  .description("Search the Airlock registry (filters compose with AND)")
  .option("-q, --query <text>", "substring match against name + description")
  .option("--industry <value>", "filter by category.industry")
  .option("--capability <value>", "filter by category.capability")
  .option("--region <value>", "filter by data_residency OR serves_regions")
  .option("--compliance <value>", "filter by compliance standard (any entry matches)")
  .option("--auth-method <value>", "filter by auth_model.methods")
  .option("--pricing-model <value>", "filter by pricing.model")
  .option("--tag <value>", "filter by tag")
  .option("--keyword <value>", "filter by rule keyword")
  .option("--url <url>", "registry URL override")
  .option("--json", "emit results as JSON")
  .action(async (opts: Record<string, string | undefined>) => {
    const filters: SearchFilters = {};
    if (opts.query) filters.query = opts.query;
    if (opts.industry) filters.industry = opts.industry as Industry;
    if (opts.capability) filters.capability = opts.capability as Capability;
    if (opts.region) filters.region = opts.region as RegionCode;
    if (opts.compliance) filters.compliance = opts.compliance as ComplianceStandard;
    if (opts.authMethod) filters.auth_method = opts.authMethod as AuthMethod;
    if (opts.pricingModel) filters.pricing_model = opts.pricingModel as SearchFilters["pricing_model"];
    if (opts.tag) filters.tag = opts.tag;
    if (opts.keyword) filters.keyword = opts.keyword;

    const entries = await searchRegistry(filters, opts.url ? { url: opts.url } : {});
    if (opts.json) {
      process.stdout.write(JSON.stringify(entries, null, 2) + "\n");
      return;
    }
    if (entries.length === 0) {
      process.stdout.write("no matches\n");
      return;
    }
    for (const e of entries) {
      process.stdout.write(`${e.name} ${e.version}  ${e.category.industry}/${e.category.capability}\n`);
      process.stdout.write(`  ${e.contract_url}\n`);
      if (e.description) process.stdout.write(`  ${e.description.split("\n")[0]}\n`);
      process.stdout.write("\n");
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
