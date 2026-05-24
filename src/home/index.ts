/**
 * The product home page for Airlock Config — the marketing surface at the root
 * of the GitHub Pages deployment. Audience: business decision-makers (procurement
 * leads, partnership directors, ops heads) at companies considering whether
 * to publish their self-deployed agent.
 *
 * Hand-authored, not generated from a contract. Reuses the project's shared
 * styles for visual consistency with the per-contract docs.
 */

import { STYLES } from "../render/styles.js";

export type RenderHomeOptions = {
  /** Repo link for the footer. */
  repoUrl?: string;
  /** Live demo contract URL — anchored from the "browse a sample" CTA. */
  demoContractPath?: string;
};

export function renderHome(opts: RenderHomeOptions = {}): string {
  const repo = opts.repoUrl ?? "https://github.com/Okohedeki/airlock-config";
  const demo = opts.demoContractPath ?? "./examples/supplier-agent/.well-known/airlock-config/";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Airlock Config — make your business agent discoverable</title>
<meta name="description" content="Publish one file describing your self-deployed agent. Other businesses' AI agents find you, pre-filter on industry, region, compliance, and pricing, and integrate without an onboarding call.">
<style>${STYLES}
.hero { padding: 3rem 0 2.5rem; }
.hero h1 { font-size: 2.5rem; margin: 0 0 .75rem; line-height: 1.15; }
.hero p.lead { font-size: 1.2rem; color: var(--muted); margin: 0 0 1.5rem; max-width: 36em; }
.cta-row { display: flex; gap: .6rem; flex-wrap: wrap; margin-bottom: 1rem; }
.cta { display: inline-block; background: var(--accent); color: #fff; padding: .6rem 1.1rem; border-radius: 4px; text-decoration: none; font-weight: 500; font-size: .95rem; }
.cta.secondary { background: transparent; color: var(--accent); border: 1px solid var(--accent); }
.problem { background: var(--code-bg); border-radius: 8px; padding: 1.5rem 1.75rem; margin: 2rem 0; }
.problem h2 { margin-top: 0; border: none; padding: 0; }
.three-up { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1rem; margin: 1.5rem 0; }
.three-up .card { border: 1px solid var(--rule); border-radius: 8px; padding: 1.25rem; background: #fff; }
.three-up .card h3 { margin: 0 0 .5rem; font-size: 1.05rem; }
.three-up .card code { font-size: .8rem; }
.example-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: .5rem; margin: 1rem 0; }
.example-cell { border: 1px solid var(--rule); border-radius: 6px; padding: .75rem .9rem; font-size: .85rem; background: #fff; }
.example-cell strong { display: block; font-size: .8rem; color: var(--muted); font-weight: 600; letter-spacing: .02em; margin-bottom: .25rem; text-transform: uppercase; }
details.tech { background: var(--code-bg); border-radius: 8px; padding: 1rem 1.5rem; margin: 2rem 0; }
details.tech summary { font-weight: 600; cursor: pointer; padding: .35rem 0; }
details.tech[open] summary { margin-bottom: .75rem; }
.byline { color: var(--muted); font-size: .9rem; margin: 1rem 0 0; }
</style>
</head>
<body>

<header class="hero">
  <h1>Make your business agent discoverable.</h1>
  <p class="lead">Publish one file describing what your self-deployed agent does, who it serves, and on what terms. Other businesses' AI agents find you, pre-filter on industry / region / compliance / pricing, and integrate without an onboarding call.</p>
  <div class="cta-row">
    <a class="cta" href="${demo}">Browse a sample contract</a>
    <a class="cta secondary" href="${repo}#end-to-end-demo">Publish your own</a>
    <a class="cta secondary" href="${repo}">View on GitHub</a>
  </div>
  <p class="byline">An open config format + open-source tooling. Apache-2.0. v0.5.</p>
</header>

<section class="problem">
  <h2>The problem</h2>
  <p>Every B2B integration today starts with a sales call, a security questionnaire, a Postman collection, and a quarter of back-and-forth before the first real request. The promise of agent-driven commerce — your AI agent talking to mine and getting something done — dies on that runway.</p>
  <p>Airlock Config is the standard contract that closes the gap. The publishing business writes a YAML file describing what their agent does. The consuming business's agent fetches it, decides whether the categorisation, region, compliance, and pricing match, and integrates against documented promises. No onboarding call needed for the first 95% of integrations.</p>
</section>

<section>
  <h2>Three things you can do today</h2>
  <div class="three-up">
    <div class="card">
      <h3>1. Publish a contract</h3>
      <p>Drop a YAML file at <code>/.well-known/airlock-config.yaml</code> on your existing infra. Render docs with <code>airlock-config build</code>. Run a local sandbox with <code>airlock-config sandbox</code>.</p>
    </div>
    <div class="card">
      <h3>2. List in the registry</h3>
      <p>Emit a registry entry with <code>airlock-config register-entry</code>. PR it to the open GitHub-list registry. Your agent is now findable.</p>
    </div>
    <div class="card">
      <h3>3. Search and integrate</h3>
      <p><code>airlock-config search --industry fintech --region eu-west --compliance SOC2_TYPE_2</code> — get a filtered list of matching agents, fetch the contract, and integrate.</p>
    </div>
  </div>
</section>

<section>
  <h2>What gets indexed</h2>
  <p>Every binding field uses a closed vocabulary so a registry can categorise across publishers without human review. A buyer's RFI questions map directly onto the schema:</p>
  <div class="example-grid">
    <div class="example-cell"><strong>Industry</strong>procurement, fintech, healthcare, logistics, …</div>
    <div class="example-cell"><strong>Capability</strong>transaction_processing, scheduling, lookup, …</div>
    <div class="example-cell"><strong>Region</strong>us-east, eu-west, apac-south, global, …</div>
    <div class="example-cell"><strong>Compliance</strong>SOC2_TYPE_2, ISO_27001, HIPAA, GDPR, …</div>
    <div class="example-cell"><strong>Auth model</strong>oauth2, mtls, api_key + enrolment posture</div>
    <div class="example-cell"><strong>Pricing</strong>free / metered / subscription / enterprise</div>
    <div class="example-cell"><strong>Data access</strong>PII exposure, classes, retention, sharing</div>
    <div class="example-cell"><strong>Guardrails</strong>refused topics + refused actions</div>
  </div>
  <p>Beyond metadata, every authority rule and instant-failure carries an optional <code>summary</code> + <code>keywords</code> so foreign agents can search the <em>substance</em> of your business rules — "agents that auto-accept POs under a threshold" actually returns matches.</p>
</section>

<details class="tech">
  <summary>For engineers: 60-second technical primer</summary>
  <p>A contract is a YAML or JSON file conforming to <a href="${repo}/blob/main/schema/airlock-config.schema.json">airlock-config.schema.json</a>. The validator runs three passes (version gate, JSON-Schema structural, semantic lint). The sandbox stands up an HTTP server on the contract's skills with deterministic schema-derived response synthesis when no authored example matches (see <a href="${repo}/blob/main/docs/adr/0005-sandbox-falls-back-to-schema-derived-responses.md">ADR 0005</a>). Conformance verifies the live agent matches the contract's PROMISE verdicts.</p>
  <pre><code>airlock-config validate    examples/supplier-agent.airlock-config.yaml
airlock-config sandbox     examples/supplier-agent.airlock-config.yaml --port 8080
airlock-config check       examples/supplier-agent.airlock-config.yaml --url http://127.0.0.1:8080
airlock-config build       examples/supplier-agent.airlock-config.yaml --out ./dist
airlock-config register-entry --contract ... --url ...
airlock-config search --industry procurement --region eu-west</code></pre>
  <p>Read more: <a href="${repo}/blob/main/docs/contract-schema.md">contract schema</a> · <a href="${repo}/blob/main/docs/taxonomies.md">taxonomies</a> · <a href="${repo}/tree/main/docs/adr">ADRs</a> · <a href="${repo}/blob/main/CONTEXT.md">glossary</a></p>
</details>

<section>
  <h2>Why now</h2>
  <p>AI agents are about to do real B2B work. The OpenAPI / API-keys-and-sales-calls integration model was built for humans clicking through docs; it doesn't scale to thousands of agent-to-agent integrations per company per day. Airlock Config is the contract layer that lets that work happen safely and discoverably without a hosted gatekeeper in the middle.</p>
</section>

<footer>
  <p>Airlock Config is open source under Apache-2.0. <a href="${repo}">View on GitHub</a>.</p>
  <p>Not a hosted gateway, not a runtime, not a registry vendor — just a file format and the tools that read it. See <a href="${repo}/blob/main/docs/adr/0001-airlock-is-docs-not-runtime.md">ADR 0001</a>.</p>
</footer>

</body>
</html>`;
}
