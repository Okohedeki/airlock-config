/**
 * Render an Airlock contract to a static HTML docs portal.
 *
 * Output is a single self-contained HTML page. No external resources (no
 * fonts, no JS frameworks, no analytics). The "try it" form is vanilla JS
 * that fetches() a sandbox URL the visitor configures inline.
 */

import type {
  AirlockContract,
  AuthorityRule,
  InstantFailure,
  Skill,
} from "../validate/types.js";
import { STYLES } from "./styles.js";

const STATUS_CODE_GROUPS: Array<{ title: string; binding: string; codes: string[] }> = [
  { title: "1. Identification", binding: "PROMISE", codes: ["OUT_OF_SCOPE", "WRONG_AGENT", "UNAUTHENTICATED", "UNAUTHORIZED"] },
  { title: "2. Input validation", binding: "PROMISE", codes: ["SCHEMA_INVALID", "MISSING_INPUT", "MALFORMED_INPUT"] },
  { title: "3. Deterministic rules", binding: "PROMISE", codes: ["ACCEPTED_BY_RULE", "REFUSED_BY_POLICY", "RATE_LIMITED"] },
  { title: "4. Soft outcomes", binding: "ESTIMATE", codes: ["ACCEPTED_LIKELY", "COUNTER_OFFER_LIKELY", "HUMAN_REVIEW_LIKELY", "DEPENDS_ON_STATE"] },
  { title: "5. Lifecycle (real responses)", binding: "n/a", codes: ["SUBMITTED", "WORKING", "INPUT_REQUIRED", "COMPLETED", "FAILED", "CANCELED", "ESCALATED"] },
  { title: "6. Actions taken (real responses)", binding: "n/a", codes: ["UNILATERAL_COMMIT", "COUNTER_OFFER", "PARTIAL_FULFILLMENT", "ESCALATED_TO_HUMAN"] },
];

export function renderHTML(contract: AirlockContract): string {
  const title = contract.agent.name;
  return [
    `<!doctype html>`,
    `<html lang="en">`,
    `<head>`,
    `<meta charset="utf-8">`,
    `<meta name="viewport" content="width=device-width, initial-scale=1">`,
    `<title>${escape(title)} — Airlock contract</title>`,
    `<meta name="description" content="${escape(contract.agent.description ?? title)}">`,
    `<style>${STYLES}</style>`,
    `</head>`,
    `<body>`,
    renderHeader(contract),
    renderTOC(contract),
    renderDiscovery(contract),
    renderSkills(contract),
    renderAuthority(contract),
    renderInstantFailures(contract),
    renderStatusCodes(),
    renderFooter(contract),
    renderTryItScript(),
    `</body></html>`,
  ].join("\n");
}

function renderHeader(c: AirlockContract): string {
  const homepage = c.agent.homepage
    ? `<p class="version"><a href="${escape(c.agent.homepage)}">${escape(c.agent.homepage)}</a></p>`
    : "";
  return `
<header class="agent">
  <h1>${escape(c.agent.name)}</h1>
  <p class="version">Contract version <code>${escape(c.agent.version)}</code> · Airlock spec <code>${escape(c.airlock)}</code></p>
  ${c.agent.description ? `<p class="description">${escape(c.agent.description)}</p>` : ""}
  ${homepage}
</header>`.trim();
}

function renderTOC(c: AirlockContract): string {
  const items: string[] = [
    `<li><a href="#discovery">Discovery</a></li>`,
    ...c.skills.map((s) => `<li><a href="#skill-${escape(s.id)}">${escape(s.id)}</a></li>`),
  ];
  if (c.authority && c.authority.length > 0) items.push(`<li><a href="#authority">Authority rules</a></li>`);
  if (c.instant_failures && c.instant_failures.length > 0) items.push(`<li><a href="#instant-failures">Instant failures</a></li>`);
  items.push(`<li><a href="#status-codes">Status codes</a></li>`);
  return `
<nav class="toc">
  <h2>Contents</h2>
  <ul>${items.join("")}</ul>
</nav>`.trim();
}

function renderDiscovery(c: AirlockContract): string {
  return `
<section id="discovery">
  <h2>Discovery</h2>
  <p>This contract is published at well-known URLs. Consumers fetch them directly; no signup, no registry.</p>
  <dl class="discovery">
    <dt>Machine spec</dt>
    <dd>GET /.well-known/airlock.yaml</dd>
    <dt>This human-readable site</dt>
    <dd>GET /.well-known/airlock/</dd>
    <dt>LLM-friendly markdown bundle</dt>
    <dd>GET /.well-known/airlock/llms.txt</dd>
    ${c.agent.channels && c.agent.channels.length > 0 ? `<dt>Channels</dt><dd>${c.agent.channels.join(", ")}</dd>` : ""}
  </dl>
</section>`.trim();
}

function renderSkills(c: AirlockContract): string {
  if (c.skills.length === 0) return "";
  return `
<section id="skills">
  <h2>Skills</h2>
  ${c.skills.map((s) => renderSkill(s, c)).join("\n")}
</section>`.trim();
}

function renderSkill(skill: Skill, c: AirlockContract): string {
  const slaInfo = c.sla?.[skill.id];
  const slaLine = slaInfo
    ? `<p><strong>SLA:</strong> respond within <code>${escape(slaInfo.respond_within ?? "?")}</code>; on breach: <code>${escape(String(slaInfo.on_breach ?? "?"))}</code></p>`
    : "";

  const examplesBlock = skill.examples && skill.examples.length > 0
    ? `<h4>Examples</h4>${skill.examples.map((ex) => `
<div>
  <strong>${escape(ex.name ?? "example")}</strong>
  ${ex.description ? `<p>${escape(ex.description)}</p>` : ""}
  <pre><code>POST /skills/${escape(skill.id)}
${escape(JSON.stringify(ex.in, null, 2))}</code></pre>
  ${ex.expected_verdict ? `<p>Expected verdict: <code>${escape(ex.expected_verdict.code)}</code>${ex.expected_verdict.binding ? ` <span class="tag ${ex.expected_verdict.binding === "PROMISE" ? "promise" : "estimate"}">${escape(ex.expected_verdict.binding)}</span>` : ""}${ex.expected_verdict.ref ? ` from rule <code>${escape(ex.expected_verdict.ref)}</code>` : ""}</p>` : ""}
  ${ex.out !== undefined ? `<p>Synthesized response body:</p><pre><code>${escape(JSON.stringify(ex.out, null, 2))}</code></pre>` : ""}
</div>`).join("\n")}`
    : "";

  return `
<div id="skill-${escape(skill.id)}" class="skill">
  <h3><code>${escape(skill.id)}</code> <span class="endpoint">POST /skills/${escape(skill.id)}</span></h3>
  ${skill.description ? `<p>${escape(skill.description)}</p>` : ""}
  ${slaLine}
  <h4>Input schema</h4>
  <pre><code>${escape(JSON.stringify(skill.input, null, 2))}</code></pre>
  <h4>Output schema</h4>
  <pre><code>${escape(JSON.stringify(skill.output, null, 2))}</code></pre>
  ${examplesBlock}
  ${renderTryIt(skill)}
</div>`.trim();
}

function renderTryIt(skill: Skill): string {
  const sample = skill.examples?.[0]?.in ?? {};
  return `
<div class="try-it" data-skill="${escape(skill.id)}">
  <h4>Try it</h4>
  <label>Sandbox URL</label>
  <input type="text" class="sandbox-url" value="http://localhost:8080" placeholder="http://localhost:8080">
  <label>Input JSON</label>
  <textarea class="payload">${escape(JSON.stringify(sample, null, 2))}</textarea>
  <div>
    <button class="run real">POST /skills/${escape(skill.id)}</button>
    <button class="run preflight">POST /preflight/${escape(skill.id)}</button>
  </div>
  <pre class="result" hidden></pre>
</div>`.trim();
}

function renderAuthority(c: AirlockContract): string {
  if (!c.authority || c.authority.length === 0) return "";
  return `
<section id="authority">
  <h2>Authority rules</h2>
  <p>Evaluated in declaration order; the first matching <code>when</code> produces the verdict.</p>
  <ul class="rule-list">
    ${c.authority.map((r, i) => renderRule(r, i)).join("\n")}
  </ul>
</section>`.trim();
}

function renderRule(r: AuthorityRule, idx: number): string {
  const cls = r.binding_class === "deterministic" ? "deterministic" : "judgment";
  const bindingTag = r.binding_class === "deterministic" ? "PROMISE" : "ESTIMATE";
  const bindingClass = r.binding_class === "deterministic" ? "promise" : "estimate";
  return `
<li>
  <strong><code>${escape(r.id)}</code></strong>
  <span class="tag ${cls}">${escape(r.binding_class)}</span>
  <span class="tag ${bindingClass}">→ ${bindingTag}</span>
  on skill <code>${escape(r.skill)}</code>
  ${r.description ? `<p>${escape(r.description)}</p>` : ""}
  <p>WHEN <code>${escape(r.when)}</code> → <code>${escape(r.then.code)}</code>${r.then.action ? ` + ${escape(r.then.action)}` : ""}</p>
  ${r.else ? `<p>ELSE → <code>${escape(r.else.code)}</code>${r.else.action ? ` + ${escape(r.else.action)}` : ""}</p>` : ""}
</li>`.trim();
}

function renderInstantFailures(c: AirlockContract): string {
  if (!c.instant_failures || c.instant_failures.length === 0) return "";
  return `
<section id="instant-failures">
  <h2>Instant failures</h2>
  <p>Reject-on-sight conditions. Always evaluated before authority rules.</p>
  <table>
    <thead><tr><th>id</th><th>when</th><th>code</th><th>scope</th></tr></thead>
    <tbody>
      ${c.instant_failures.map((f) => renderFailureRow(f)).join("\n")}
    </tbody>
  </table>
</section>`.trim();
}

function renderFailureRow(f: InstantFailure): string {
  return `<tr>
  <td><code>${escape(f.id)}</code></td>
  <td><code>${escape(f.when)}</code></td>
  <td><code>${escape(f.code)}</code> <span class="tag promise">PROMISE</span></td>
  <td>${f.skill ? `<code>${escape(f.skill)}</code>` : "all"}</td>
</tr>`;
}

function renderStatusCodes(): string {
  return `
<section id="status-codes">
  <h2>Status codes</h2>
  <p>Every verdict carries <code>{ code, binding, reason, ref, [action], [detail] }</code>. Binding indicates whether the publisher is bound by the verdict — <span class="tag promise">PROMISE</span> means yes, <span class="tag estimate">ESTIMATE</span> means best-guess.</p>
  <table>
    <thead><tr><th>Phase</th><th>Codes</th><th>Binding</th></tr></thead>
    <tbody>
      ${STATUS_CODE_GROUPS.map((g) => `<tr>
        <td>${escape(g.title)}</td>
        <td><code>${g.codes.join("</code> <code>")}</code></td>
        <td>${g.binding === "PROMISE" ? `<span class="tag promise">PROMISE</span>` : g.binding === "ESTIMATE" ? `<span class="tag estimate">ESTIMATE</span>` : g.binding}</td>
      </tr>`).join("\n")}
    </tbody>
  </table>
</section>`.trim();
}

function renderFooter(c: AirlockContract): string {
  const contact = c.agent.contact;
  const contactLine = contact
    ? `Contact: ${[contact.name, contact.email, contact.url].filter(Boolean).join(" · ")}.`
    : "";
  return `
<footer>
  <p>${escape(contactLine)}</p>
  <p>This page was generated from <code>airlock-contract.yaml</code> by the Airlock renderer. See <a href="https://github.com/airlock">Airlock</a> for the spec.</p>
</footer>`.trim();
}

function renderTryItScript(): string {
  return `
<script>
document.querySelectorAll('.try-it').forEach(box => {
  const skill = box.dataset.skill;
  const url = () => box.querySelector('.sandbox-url').value.replace(/\\/$/, '');
  const payload = () => box.querySelector('.payload').value;
  const result = box.querySelector('.result');
  const run = async (mode) => {
    result.hidden = false;
    result.textContent = 'requesting...';
    try {
      const res = await fetch(url() + '/' + mode + '/' + skill, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: payload(),
      });
      const json = await res.json();
      result.textContent = '// HTTP ' + res.status + '\\n' + JSON.stringify(json, null, 2);
    } catch (err) {
      result.textContent = 'error: ' + (err && err.message ? err.message : err);
    }
  };
  box.querySelector('.run.real').addEventListener('click', () => run('skills'));
  box.querySelector('.run.preflight').addEventListener('click', () => run('preflight'));
});
</script>`.trim();
}

function escape(s: string | undefined): string {
  if (s === undefined || s === null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
