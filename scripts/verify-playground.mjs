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
    name: "happy path (PROMISE)",
    input: {
      reference: "PO-1234",
      entity: "known-supplier-1",
      amount: 100,
      delivery_date_change_days: -2,
    },
    expect: { code: "ACCEPTED_BY_RULE", binding: "PROMISE" },
  },
  {
    name: "large date change (ESTIMATE)",
    input: {
      reference: "PO-9",
      entity: "known-supplier-1",
      amount: 100,
      delivery_date_change_days: 14,
    },
    expect: { code: "HUMAN_REVIEW_LIKELY", binding: "ESTIMATE" },
  },
  {
    name: "unknown entity (PROMISE instant_failure)",
    input: { reference: "PO-1", entity: "random-vendor", amount: 10 },
    expect: { code: "OUT_OF_SCOPE", binding: "PROMISE" },
  },
];

let failed = 0;
for (const s of scenarios) {
  const v = globalThis.airlock.evaluate("confirm_po", s.input, "preflight");
  const ok = v.code === s.expect.code && v.binding === s.expect.binding;
  console.log(
    `${ok ? "✓" : "✗"}  ${s.name}: got ${v.code}/${v.binding}, expected ${s.expect.code}/${s.expect.binding}`,
  );
  if (!ok) failed++;
}

if (failed > 0) {
  console.error(`\n${failed} scenario(s) failed`);
  process.exit(1);
}
console.log("\nAll in-browser playground scenarios match the Node sandbox.");
