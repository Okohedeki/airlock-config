// Headless sanity check for the inlined playground bundle.
// Extracts the contract + bundle from the rendered HTML and executes the bundle
// in Node, confirming `window.airlock.evaluate(...)` produces the right verdicts.
import { readFileSync } from "node:fs";

const html = readFileSync("dist-pages/.well-known/airlock/index.html", "utf-8");

const contractMatch = html.match(
  /<script>window\.__AIRLOCK_CONTRACT__ = (.+?);<\/script>/,
);
if (!contractMatch) throw new Error("contract block not found");

// Bundle: the next <script>...</script> immediately after the contract block
const after = html.slice(contractMatch.index + contractMatch[0].length);
const bundleMatch = after.match(/<script>([\s\S]+?)<\/script>/);
if (!bundleMatch) throw new Error("playground bundle <script> not found");

globalThis.window = globalThis;
globalThis.__AIRLOCK_CONTRACT__ = JSON.parse(contractMatch[1]);

// Execute the IIFE
new Function(bundleMatch[1])();

if (!globalThis.airlock) throw new Error("window.airlock was not set by the bundle");

const scenarios = [
  {
    name: "analyze_code: workspace-relative path (PROMISE)",
    skill: "analyze_code",
    input: { path: "src/expr/index.ts" },
    expect: { code: "ACCEPTED_BY_RULE", binding: "PROMISE" },
  },
  {
    name: "analyze_code: absolute path (PROMISE, else branch)",
    skill: "analyze_code",
    input: { path: "/etc/passwd" },
    expect: { code: "OUT_OF_SCOPE", binding: "PROMISE" },
  },
  {
    name: "analyze_code: missing path (PROMISE instant_failure)",
    skill: "analyze_code",
    input: {},
    expect: { code: "MISSING_INPUT", binding: "PROMISE" },
  },
  {
    name: "run_command: judgment fallback (ESTIMATE)",
    skill: "run_command",
    input: { command: "echo hi" },
    expect: { code: "DEPENDS_ON_STATE", binding: "ESTIMATE" },
  },
];

let failed = 0;
for (const s of scenarios) {
  const result = globalThis.airlock.evaluate(s.skill, s.input, "preflight");
  const v = result.verdict ?? result;
  const ok = v.code === s.expect.code && v.binding === s.expect.binding;
  console.log(
    `${ok ? "✓" : "✗"}  ${s.name}: got ${v.code}/${v.binding}, expected ${s.expect.code}/${s.expect.binding}`,
  );
  if (!ok) failed++;
}

// Faker determinism check: same input, twice, same body.
const a = globalThis.airlock.evaluate("run_command", { command: "echo hi" }, "skills");
const b = globalThis.airlock.evaluate("run_command", { command: "echo hi" }, "skills");
const detA = JSON.stringify((a.verdict ?? a).detail);
const detB = JSON.stringify((b.verdict ?? b).detail);
const detOk = detA === detB && detA !== undefined;
console.log(
  `${detOk ? "✓" : "✗"}  faker: deterministic synthesized body for repeated input (source=${a.detailSource})`,
);
if (!detOk) failed++;

if (failed > 0) {
  console.error(`\n${failed} scenario(s) failed`);
  process.exit(1);
}
console.log("\nAll in-browser playground scenarios match the Node sandbox.");
