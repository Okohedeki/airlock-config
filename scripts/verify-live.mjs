// Verify the live GitHub Pages deployment.
//
// v0.5 site layout:
//   /                                                                  product home page (NOT a contract landing)
//   /examples/acme-supplier-agent/                                     per-contract landing
//   /examples/acme-supplier-agent/.well-known/airlock-config.yaml      machine spec
//   /examples/acme-supplier-agent/.well-known/airlock-config/          rendered docs

const BASE = "https://okohedeki.github.io/airlock-config";
const DEMO = "/examples/acme-supplier-agent";
const PATHS = [
  "/",
  `${DEMO}/`,
  `${DEMO}/.well-known/airlock-config.yaml`,
  `${DEMO}/.well-known/airlock-config/`,
  `${DEMO}/.well-known/airlock-config/llms.txt`,
  `${DEMO}/.well-known/agent-card.json`,
];

async function status(url) {
  try {
    const res = await fetch(url, { method: "GET", redirect: "follow" });
    return res.status;
  } catch (e) {
    return `err:${e.message}`;
  }
}

const failures = [];

console.log("--- HTTP status of every URL surfaced on the site ---");
for (const path of PATHS) {
  const url = `${BASE}${path}`;
  const code = await status(url);
  console.log(`  ${code}  ${url}`);
  if (code !== 200) failures.push(url);
}

console.log();
console.log("--- Home page content checks (must be the product page, not a contract page) ---");
const home = await fetch(`${BASE}/`).then((r) => r.text());
const homeChecks = [
  { label: "product home headline present", ok: home.includes("Make your business agent discoverable") },
  { label: "links to the sample contract", ok: home.includes("examples/acme-supplier-agent") },
  { label: "does NOT inline a contract (home is not a contract page)", ok: !home.includes("__AIRLOCK_CONFIG_CONTRACT__") },
];
for (const c of homeChecks) {
  console.log(`  ${c.ok ? "✓" : "✗"}  ${c.label}`);
  if (!c.ok) failures.push(`home content: ${c.label}`);
}

console.log();
console.log("--- Demo per-contract page checks ---");
const demoHtml = await fetch(`${BASE}${DEMO}/.well-known/airlock-config/`).then((r) => r.text());
const demoChecks = [
  { label: "playground bundle inlined", ok: demoHtml.includes("__AIRLOCK_CONFIG_CONTRACT__") && demoHtml.includes("window.airlockConfig") },
  { label: "category section rendered", ok: demoHtml.toLowerCase().includes("category") && demoHtml.includes("procurement") },
  { label: "compliance entries rendered", ok: demoHtml.includes("SOC2_TYPE_2") },
  { label: "try-it form present", ok: demoHtml.includes("try-it") },
];
for (const c of demoChecks) {
  console.log(`  ${c.ok ? "✓" : "✗"}  ${c.label}`);
  if (!c.ok) failures.push(`demo content: ${c.label}`);
}

console.log();
console.log("--- A2A Agent Card content checks ---");
const cardRaw = await fetch(`${BASE}${DEMO}/.well-known/agent-card.json`).then((r) => r.text());
let card;
try { card = JSON.parse(cardRaw); } catch (e) { card = null; }
const cardChecks = [
  { label: "Agent Card parses as JSON", ok: card !== null },
  { label: "id present and matches <name>@<version>", ok: card?.id === `${card?.name}@1.0.0` },
  { label: "name = acme-supplier-agent", ok: card?.name === "acme-supplier-agent" },
  { label: "skills array present", ok: Array.isArray(card?.skills) && card.skills.length > 0 },
  { label: "securitySchemes derived from auth_model", ok: card?.securitySchemes && Object.keys(card.securitySchemes).length > 0 },
  { label: "airlock-config-contract back-pointer extension present", ok: Array.isArray(card?.extensions) && card.extensions.some((e) => e.uri === "airlock-config-contract") },
];
for (const c of cardChecks) {
  console.log(`  ${c.ok ? "✓" : "✗"}  ${c.label}`);
  if (!c.ok) failures.push(`agent-card: ${c.label}`);
}

console.log();
console.log("--- llms.txt content checks ---");
const llms = await fetch(`${BASE}${DEMO}/.well-known/airlock-config/llms.txt`).then((r) => r.text());
const llmsChecks = [
  { label: "Category section present", ok: llms.includes("## Category (binding)") },
  { label: "Compliance section present", ok: llms.includes("## Compliance (binding)") },
  { label: "Skills section present", ok: llms.includes("## Skills (binding)") },
];
for (const c of llmsChecks) {
  console.log(`  ${c.ok ? "✓" : "✗"}  ${c.label}`);
  if (!c.ok) failures.push(`llms content: ${c.label}`);
}

console.log();
if (failures.length > 0) {
  console.error(`✗ ${failures.length} check(s) failed:`);
  for (const f of failures) console.error(`    ${f}`);
  process.exit(1);
}
console.log("✓ Live site is the product home page with the demo contract under /examples/acme-supplier-agent/.");
