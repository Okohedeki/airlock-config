/**
 * Produce the static bundle layout that gets pushed to GitHub Pages (or any
 * static host).
 *
 *   <outDir>/index.html                              landing page
 *   <outDir>/.well-known/airlock.yaml                machine spec (verbatim)
 *   <outDir>/.well-known/airlock/index.html          rendered docs portal
 *   <outDir>/.well-known/airlock/llms.txt            LLM-friendly bundle
 *   <outDir>/.nojekyll                               so GitHub Pages serves dotfiles
 */

import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { AirlockContract } from "../validate/types.js";
import { validateContractFile } from "../validate/index.js";
import { renderHTML } from "./html.js";
import { renderLLMs } from "./llms.js";
import { renderLanding } from "./landing.js";

const here = dirname(fileURLToPath(import.meta.url));
// Layout: src/render/bundle.ts (dev) or dist/render/bundle.js (prod).
// In both layouts the playground bundle sits at <pkgRoot>/dist/playground.bundle.js.
const PLAYGROUND_BUNDLE_PATHS = [
  resolve(here, "..", "..", "dist", "playground.bundle.js"),    // dev: src/render → dist/
  resolve(here, "..", "playground.bundle.js"),                  // prod: dist/render → dist/
];

function loadPlaygroundBundle(): string {
  for (const p of PLAYGROUND_BUNDLE_PATHS) {
    if (existsSync(p)) return readFileSync(p, "utf-8");
  }
  throw new Error(
    `Playground bundle not found. Run \`npm run build:playground\` first. Looked in:\n  ${PLAYGROUND_BUNDLE_PATHS.join("\n  ")}`,
  );
}

export type BuildOptions = {
  /** Output directory (default: ./dist). */
  outDir?: string;
};

export type BuildResult = {
  outDir: string;
  files: string[];
};

export function buildStaticBundle(opts: {
  contract: AirlockContract;
  contractSource: string;
  outDir: string;
}): BuildResult {
  const outDir = resolve(opts.outDir);
  const files: string[] = [];
  const playgroundJs = loadPlaygroundBundle();

  const write = (relPath: string, content: string): void => {
    const target = resolve(outDir, relPath);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
    files.push(relPath);
  };

  // 1. Machine spec verbatim
  write(".well-known/airlock.yaml", opts.contractSource);

  // 2. Rendered docs portal — embeds the contract + playground bundle so
  //    "Try it" works in the browser without a local sandbox.
  write(
    ".well-known/airlock/index.html",
    renderHTML(opts.contract, { playgroundJs }),
  );

  // 3. LLM-friendly markdown bundle
  write(
    ".well-known/airlock/llms.txt",
    renderLLMs(opts.contract, { contractURL: "../airlock.yaml" }),
  );

  // 4. Landing page at the bundle root
  write("index.html", renderLanding(opts.contract));

  // 5. .nojekyll so GitHub Pages serves `.well-known/` properly
  write(".nojekyll", "");

  return { outDir, files };
}

/**
 * Read a contract file from disk, validate it, then build the static bundle.
 * Throws if the contract is invalid.
 */
export function buildFromFile(contractPath: string, opts: BuildOptions = {}): BuildResult {
  const result = validateContractFile(contractPath);
  if (!result.ok || !result.contract) {
    const summary = result.issues.map((i) => `  ${i.path}: ${i.message}`).join("\n");
    throw new Error(`Cannot build — contract is invalid:\n${summary}`);
  }
  const source = readFileSync(contractPath, "utf-8");
  return buildStaticBundle({
    contract: result.contract,
    contractSource: source,
    outDir: opts.outDir ?? "./dist",
  });
}
