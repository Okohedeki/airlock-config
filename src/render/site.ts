/**
 * Build the full product site — the marketing home page at the root plus
 * one example contract bundle per `examples/*.airlock.yaml` published at
 * `examples/<agent-name>/...`.
 *
 * Layout:
 *   <out>/index.html                                           product home page
 *   <out>/.nojekyll                                            GitHub Pages dotfile passthrough
 *   <out>/examples/<agent>/index.html                          per-contract landing
 *   <out>/examples/<agent>/.well-known/airlock.yaml            machine spec
 *   <out>/examples/<agent>/.well-known/airlock/index.html      rendered docs portal
 *   <out>/examples/<agent>/.well-known/airlock/llms.txt        LLM-friendly bundle
 */

import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { dirname, resolve, join, basename } from "node:path";
import { fileURLToPath } from "node:url";

import { validateContractFile } from "../validate/index.js";
import { renderHTML } from "./html.js";
import { renderLLMs } from "./llms.js";
import { renderLanding } from "./landing.js";
import { renderHome } from "../home/index.js";
import { buildAgentCard } from "../a2a/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const PLAYGROUND_BUNDLE_PATHS = [
  resolve(here, "..", "..", "dist", "playground.bundle.js"),
  resolve(here, "..", "playground.bundle.js"),
];

function loadPlaygroundBundle(): string {
  for (const p of PLAYGROUND_BUNDLE_PATHS) {
    if (existsSync(p)) return readFileSync(p, "utf-8");
  }
  throw new Error(
    `Playground bundle not found. Run \`npm run build:playground\` first. Looked in:\n  ${PLAYGROUND_BUNDLE_PATHS.join("\n  ")}`,
  );
}

export type BuildSiteOptions = {
  /** Output directory (default: ./dist). */
  outDir?: string;
  /** Directory of example contracts to bundle (default: ./examples). */
  examplesDir?: string;
  /**
   * Pin which example shows up as the "Browse a sample contract" CTA on the
   * home page. Falls back to the alphabetically-first example.
   */
  featuredExample?: string;
  /** Override repo URL in the home page footer. */
  repoUrl?: string;
};

export type BuildSiteResult = {
  outDir: string;
  files: string[];
  examples: Array<{ name: string; contractPath: string }>;
};

export function buildSite(opts: BuildSiteOptions = {}): BuildSiteResult {
  const outDir = resolve(opts.outDir ?? "./dist");
  const examplesDir = resolve(opts.examplesDir ?? "./examples");
  const playgroundJs = loadPlaygroundBundle();
  const files: string[] = [];
  const examples: Array<{ name: string; contractPath: string }> = [];

  const write = (relPath: string, content: string): void => {
    const target = resolve(outDir, relPath);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
    files.push(relPath);
  };

  // 1. Bundle every example contract under examples/<agent-name>/
  const contractFiles = readdirSync(examplesDir)
    .filter((f) => f.endsWith(".airlock.yaml") || f.endsWith(".airlock.json"))
    .sort();

  if (contractFiles.length === 0) {
    throw new Error(`No example contracts found in ${examplesDir}`);
  }

  for (const file of contractFiles) {
    const contractPath = join(examplesDir, file);
    const result = validateContractFile(contractPath);
    if (!result.ok || !result.contract) {
      const summary = result.issues.map((i) => `  ${i.path}: ${i.message}`).join("\n");
      throw new Error(`Cannot bundle ${file} — contract is invalid:\n${summary}`);
    }
    const contract = result.contract;
    const source = readFileSync(contractPath, "utf-8");
    const agentName = contract.agent.name;
    const prefix = `examples/${agentName}`;

    write(`${prefix}/.well-known/airlock.yaml`, source);
    write(`${prefix}/.well-known/airlock/index.html`, renderHTML(contract, { playgroundJs }));
    write(`${prefix}/.well-known/airlock/llms.txt`, renderLLMs(contract, { contractURL: "../airlock.yaml" }));
    write(`${prefix}/index.html`, renderLanding(contract));

    // A2A Agent Card derived from the same contract — published at A2A's
    // native discovery path so A2A-speaking clients find it without any
    // Airlock-specific code. See ADR 0007.
    const agentCard = buildAgentCard(contract, {
      contractUrl: `./${prefix}/.well-known/airlock.yaml`,
    });
    write(`${prefix}/.well-known/agent-card.json`, JSON.stringify(agentCard, null, 2));

    examples.push({ name: agentName, contractPath });
  }

  // 2. Pick the featured example for the home-page CTA
  const featured =
    opts.featuredExample ?? examples.find((e) => e.contractPath.endsWith("supplier-agent.airlock.yaml"))?.name
    ?? examples[0]?.name;
  const demoContractPath = featured
    ? `./examples/${featured}/.well-known/airlock/`
    : undefined;

  // 3. Product home page at the root
  write(
    "index.html",
    renderHome({
      ...(opts.repoUrl !== undefined ? { repoUrl: opts.repoUrl } : {}),
      ...(demoContractPath !== undefined ? { demoContractPath } : {}),
    }),
  );

  // 4. .nojekyll at the root so GitHub Pages serves .well-known/ under each example
  write(".nojekyll", "");

  return { outDir, files, examples };
}

export function basenameWithoutExtension(p: string): string {
  return basename(p).replace(/\.airlock\.(yaml|json)$/i, "");
}
