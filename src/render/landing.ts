/**
 * Tiny landing page at the bundle root (`dist/index.html`). Visitors land here
 * first when they hit the GitHub Pages URL. Points to the well-known docs.
 */

import type { AirlockConfig } from "../validate/types.js";
import { STYLES } from "./styles.js";

export function renderLanding(contract: AirlockConfig): string {
  const skillsList = contract.skills
    .map((s) => `<li><code>${escape(s.id)}</code>${s.description ? ` — ${escape(s.description)}` : ""}</li>`)
    .join("");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(contract.agent.name)}</title>
<style>${STYLES}</style>
</head>
<body>
<header class="agent">
  <h1>${escape(contract.agent.name)}</h1>
  <p class="version">v${escape(contract.agent.version)} · published as an <a href="https://github.com/Okohedeki/airlock-config">Airlock Config</a> contract</p>
  ${contract.agent.description ? `<p class="description">${escape(contract.agent.description)}</p>` : ""}
</header>
<section>
  <h2>What this is</h2>
  <p>This site publishes a machine-readable contract describing how the <strong>${escape(contract.agent.name)}</strong> agent handles inbound traffic. External agents (and humans) can fetch the contract, read the rules, and integrate against this agent without prior coordination.</p>
</section>
<section>
  <h2>Get started</h2>
  <ul>
    <li><strong>Read the docs</strong> — <a href="./.well-known/airlock-config/">/.well-known/airlock-config/</a></li>
    <li><strong>Fetch the machine spec</strong> — <a href="./.well-known/airlock-config.yaml">/.well-known/airlock-config.yaml</a></li>
    <li><strong>LLM-friendly bundle</strong> — <a href="./.well-known/airlock-config/llms.txt">/.well-known/airlock-config/llms.txt</a></li>
  </ul>
</section>
<section>
  <h2>Skills</h2>
  <ul>${skillsList}</ul>
</section>
<footer>
  Generated from <code>airlock-config.yaml</code> via <code>airlock-config build</code>.
</footer>
</body>
</html>`;
}

function escape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
