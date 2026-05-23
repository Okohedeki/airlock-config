// Headless sanity check for the inlined playground bundle.
// Extracts the contract + bundle from a published per-contract page and
// executes the bundle in Node, confirming window.airlock.evaluate(...) matches
// the Node sandbox.
import { readFileSync } from "node:fs";

// Site layout (v0.4) puts each example under examples/<agent-name>/
const PAGE = "dist-pages/examples/acme-supplier-agent/.well-known/airlock/index.html";

const html = readFileSync(PAGE, "utf-8");

const contractMatch = html.match(
  /<script>window\.__AIRLOCK_CONTRACT__ = (.+?);<\/script>/,
);
if (!contractMatch) throw new Error(`contract block not found in ${PAGE}`);

const after = html.slice(contractMatch.index + contractMatch[0].length);
const bundleMatch = after.match(/<script>([\s\S]+?)<\/script>/);
if (!bundleMatch) throw new Error("playground bundle <script> not found");

globalThis.window = globalThis;
globalThis.__AIRLOCK_CONTRACT__ = JSON.parse(contractMatch[1]);

new Function(bundleMatch[1])();

if (!globalThis.airlock) throw new Error("window.airlock was not set by the bundle");

const scenarios = [
  {
    name: "confirm_po: small date change (PROMISE)",
    skill: "confirm_po",
    input: { reference: "PO-1234", entity: "known-supplier-1", amount: 100, delivery_date_change_days: -2 },
    expect: { code: "ACCEPTED_BY_RULE", binding: "PROMISE" },
  },
  {
    name: "confirm_po: large date change (ESTIMATE)",
    skill: "confirm_po",
    input: { reference: "PO-9", entity: "known-supplier-1", amount: 100, delivery_date_change_days: 14 },
    expect: { code: "HUMAN_REVIEW_LIKELY", binding: "ESTIMATE" },
  },
  {
    name: "confirm_po: unknown entity (PROMISE instant_failure)",
    skill: "confirm_po",
    input: { reference: "PO-1", entity: "random-vendor", amount: 10 },
    expect: { code: "OUT_OF_SCOPE", binding: "PROMISE" },
  },
  {
    name: "query_inventory: no rule fires → default ESTIMATE",
    skill: "query_inventory",
    input: { sku: "SKU-42" },
    expect: { code: "ACCEPTED_LIKELY", binding: "ESTIMATE" },
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
const a = globalThis.airlock.evaluate("query_inventory", { sku: "SKU-42" }, "skills");
const b = globalThis.airlock.evaluate("query_inventory", { sku: "SKU-42" }, "skills");
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
