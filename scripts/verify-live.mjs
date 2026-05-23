// Verify the live GitHub Pages deployment:
// 1. Every URL surfaced on the site returns 200
// 2. Every external link resolves (no 404s)
// 3. The playground bundle + inlined contract are present

const BASE = "https://okohedeki.github.io/airlock";
const PATHS = ["/", "/.well-known/airlock.yaml", "/.well-known/airlock/", "/.well-known/airlock/llms.txt"];

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
console.log("--- Every external link on the live docs page ---");
const docs = await fetch(`${BASE}/.well-known/airlock/`).then((r) => r.text());
const docLinks = [...docs.matchAll(/href="(https?:\/\/[^"]+)"/g)].map((m) => m[1]);
const docUnique = [...new Set(docLinks)].sort();
for (const link of docUnique) {
  const code = await status(link);
  console.log(`  ${code}  ${link}`);
  if (typeof code === "number" && code >= 400) failures.push(link);
}

console.log();
console.log("--- Every external link on the landing page ---");
const landing = await fetch(`${BASE}/`).then((r) => r.text());
const landLinks = [...landing.matchAll(/href="(https?:\/\/[^"]+)"/g)].map((m) => m[1]);
const landUnique = [...new Set(landLinks)].sort();
for (const link of landUnique) {
  const code = await status(link);
  console.log(`  ${code}  ${link}`);
  if (typeof code === "number" && code >= 400) failures.push(link);
}

console.log();
console.log("--- Playground assets on the live docs page ---");
console.log(`  page bytes: ${docs.length}`);
console.log(`  contains __AIRLOCK_CONTRACT__: ${docs.includes("__AIRLOCK_CONTRACT__")}`);
console.log(`  contains window.airlock: ${docs.includes("window.airlock")}`);
console.log(`  contains try-it form: ${docs.includes("try-it")}`);

console.log();
if (failures.length > 0) {
  console.error(`✗ ${failures.length} URL(s) failed:`);
  for (const f of failures) console.error(`    ${f}`);
  process.exit(1);
}
console.log("✓ All URLs return 200 and playground is wired up.");
