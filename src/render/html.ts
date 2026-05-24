/**
 * Render an Airlock Config contract to a static HTML docs portal.
 *
 * Output is a single self-contained HTML page. No external resources (no
 * fonts, no JS frameworks, no analytics). The "try it" form is vanilla JS
 * that fetches() a sandbox URL the visitor configures inline.
 */

import type {
  AirlockConfig,
  AuthorityRule,
  AuthModel,
  Category,
  ComplianceEntry,
  Guardrails,
  InstantFailure,
  Permissions,
  Pricing,
  Region,
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

export type RenderHTMLOptions = {
  playgroundJs: string;
};

export function renderHTML(contract: AirlockConfig, opts: RenderHTMLOptions): string {
  const title = contract.agent.name;
  return [
    `<!doctype html>`,
    `<html lang="en">`,
    `<head>`,
    `<meta charset="utf-8">`,
    `<meta name="viewport" content="width=device-width, initial-scale=1">`,
    `<title>${escape(title)} — Airlock Config contract</title>`,
    `<meta name="description" content="${escape(contract.agent.description ?? title)}">`,
    `<style>${STYLES}</style>`,
    `</head>`,
    `<body>`,
    renderHeader(contract),
    renderTOC(contract),
    renderCategory(contract.category, contract.tags),
    renderRegion(contract.region),
    renderCompliance(contract.compliance),
    renderAuthModel(contract.auth_model),
    renderPricing(contract.pricing),
    renderPermissions(contract.permissions),
    renderGuardrails(contract.guardrails),
    renderDiscovery(contract),
    renderSkills(contract),
    renderAuthority(contract),
    renderInstantFailures(contract),
    renderStatusCodes(),
    renderFooter(contract),
    renderContractInline(contract),
    renderPlaygroundBundle(opts.playgroundJs),
    renderTryItScript(),
    `</body></html>`,
  ].join("\n");
}

function renderHeader(c: AirlockConfig): string {
  const homepage = c.agent.homepage
    ? `<p class="version"><a href="${escape(c.agent.homepage)}">${escape(c.agent.homepage)}</a></p>`
    : "";
  return `
<header class="agent">
  <h1>${escape(c.agent.name)}</h1>
  <p class="version">Contract version <code>${escape(c.agent.version)}</code> · Airlock Config spec <code>${escape(c.airlock_config)}</code></p>
  ${c.agent.description ? `<p class="description">${escape(c.agent.description)}</p>` : ""}
  ${homepage}
</header>`.trim();
}

function renderTOC(c: AirlockConfig): string {
  const items: string[] = [
    `<li><a href="#category">Category</a></li>`,
  ];
  if (c.region) items.push(`<li><a href="#region">Region</a></li>`);
  if (c.compliance && c.compliance.length > 0) items.push(`<li><a href="#compliance">Compliance</a></li>`);
  if (c.auth_model) items.push(`<li><a href="#auth">Auth & enrolment</a></li>`);
  if (c.pricing) items.push(`<li><a href="#pricing">Pricing</a></li>`);
  if (c.permissions) items.push(`<li><a href="#permissions">Data access</a></li>`);
  if (c.guardrails) items.push(`<li><a href="#guardrails">Guardrails</a></li>`);
  items.push(`<li><a href="#discovery">Discovery</a></li>`);
  items.push(...c.skills.map((s) => `<li><a href="#skill-${escape(s.id)}">${escape(s.id)}</a></li>`));
  if (c.authority && c.authority.length > 0) items.push(`<li><a href="#authority">Authority rules</a></li>`);
  if (c.instant_failures && c.instant_failures.length > 0) items.push(`<li><a href="#instant-failures">Instant failures</a></li>`);
  items.push(`<li><a href="#status-codes">Status codes</a></li>`);
  return `
<nav class="toc">
  <h2>Contents</h2>
  <ul>${items.join("")}</ul>
</nav>`.trim();
}

function renderCategory(cat: Category, tags: string[] | undefined): string {
  return `
<section id="category">
  <h2>Category ${bindingBadge("binding")}</h2>
  <p>The most important indexing fields. A registry pre-filters every buyer query on these.</p>
  <dl class="discovery">
    <dt>Industry</dt><dd>${escape(cat.industry)}</dd>
    <dt>Capability</dt><dd>${escape(cat.capability)}</dd>
    ${cat.subcategory ? `<dt>Subcategory</dt><dd>${escape(cat.subcategory)}</dd>` : ""}
  </dl>
  ${tags && tags.length > 0 ? `<p><strong>Tags:</strong> ${tags.map((t) => `<span class="chip">${escape(t)}</span>`).join(" ")}</p>` : ""}
</section>`.trim();
}

function renderRegion(r: Region | undefined): string {
  if (!r) return "";
  return `
<section id="region">
  <h2>Region ${bindingBadge("binding")}</h2>
  <dl class="discovery">
    ${r.data_residency && r.data_residency.length > 0 ? `<dt>Data residency</dt><dd>${r.data_residency.map((x) => `<code>${escape(x)}</code>`).join(", ")}</dd>` : ""}
    ${r.serves_regions && r.serves_regions.length > 0 ? `<dt>Serves regions</dt><dd>${r.serves_regions.map((x) => `<code>${escape(x)}</code>`).join(", ")}</dd>` : ""}
  </dl>
</section>`.trim();
}

function renderCompliance(entries: ComplianceEntry[] | undefined): string {
  if (!entries || entries.length === 0) return "";
  return `
<section id="compliance">
  <h2>Compliance ${bindingBadge("binding")}</h2>
  <table>
    <thead><tr><th>Standard</th><th>Status</th><th>Verified at</th><th>Attestation</th></tr></thead>
    <tbody>
      ${entries.map((e) => `<tr>
        <td><code>${escape(e.standard)}</code></td>
        <td><span class="tag ${e.status === "certified" ? "promise" : e.status === "self_attested" ? "estimate" : "judgment"}">${escape(e.status)}</span></td>
        <td>${e.verified_at ? escape(e.verified_at) : ""}</td>
        <td>${e.attestation_url ? `<a href="${escape(e.attestation_url)}">link</a>` : ""}</td>
      </tr>`).join("\n")}
    </tbody>
  </table>
</section>`.trim();
}

function renderAuthModel(a: AuthModel | undefined): string {
  if (!a) return "";
  return `
<section id="auth">
  <h2>Auth &amp; enrolment ${bindingBadge("binding")}</h2>
  <dl class="discovery">
    <dt>Methods</dt><dd>${a.methods.map((m) => `<code>${escape(m)}</code>`).join(", ")}</dd>
    <dt>Enrolment</dt><dd><code>${escape(a.enrollment)}</code></dd>
    ${a.support_url ? `<dt>Enrol here</dt><dd><a href="${escape(a.support_url)}">${escape(a.support_url)}</a></dd>` : ""}
  </dl>
</section>`.trim();
}

function renderPricing(p: Pricing | undefined): string {
  if (!p) return "";
  return `
<section id="pricing">
  <h2>Pricing ${bindingBadge("binding")}</h2>
  <dl class="discovery">
    <dt>Model</dt><dd><code>${escape(p.model)}</code></dd>
    ${p.unit ? `<dt>Unit</dt><dd><code>${escape(p.unit)}</code></dd>` : ""}
    ${p.currency ? `<dt>Currency</dt><dd><code>${escape(p.currency)}</code></dd>` : ""}
    ${p.price_url ? `<dt>Commercial terms</dt><dd><a href="${escape(p.price_url)}">${escape(p.price_url)}</a> <span class="tag informational">INFORMATIONAL</span></dd>` : ""}
    ${p.free_tier ? `<dt>Free tier</dt><dd>${p.free_tier.description ? escape(p.free_tier.description) : ""}${p.free_tier.limits ? ` (limits: ${escape(p.free_tier.limits)})` : ""}</dd>` : ""}
  </dl>
</section>`.trim();
}

function renderPermissions(p: Permissions | undefined): string {
  if (!p) return "";
  return `
<section id="permissions">
  <h2>Data access ${bindingBadge("binding")}</h2>
  <p>What data the agent ingests, how long it keeps it, and whether it leaves the publisher's perimeter.</p>
  <dl class="discovery">
    ${p.pii ? `<dt>PII exposure</dt><dd><code>${escape(p.pii)}</code></dd>` : ""}
    ${p.data_classes && p.data_classes.length > 0 ? `<dt>Data classes</dt><dd>${p.data_classes.map((c) => `<code>${escape(c)}</code>`).join(", ")}</dd>` : ""}
    ${p.retention ? `<dt>Retention</dt><dd><code>${escape(p.retention)}</code></dd>` : ""}
    ${p.third_party_sharing ? `<dt>Third-party sharing</dt><dd><code>${escape(p.third_party_sharing)}</code></dd>` : ""}
  </dl>
</section>`.trim();
}

function renderGuardrails(g: Guardrails | undefined): string {
  if (!g) return "";
  const parts: string[] = [];
  if (g.refused_topics && g.refused_topics.length > 0) {
    parts.push(`<p><strong>Refused topics:</strong> ${g.refused_topics.map((t) => `<span class="chip">${escape(t)}</span>`).join(" ")}</p>`);
  }
  if (g.refused_actions && g.refused_actions.length > 0) {
    parts.push(`<p><strong>Refused actions:</strong> ${g.refused_actions.map((t) => `<span class="chip">${escape(t)}</span>`).join(" ")}</p>`);
  }
  if (g.required_authentication !== undefined) {
    parts.push(`<p><strong>Requires authentication:</strong> <code>${g.required_authentication}</code></p>`);
  }
  if (parts.length === 0) return "";
  return `
<section id="guardrails">
  <h2>Guardrails ${bindingBadge("binding")}</h2>
  <p>Categorical refusals at the agent level — coarser than per-skill authority rules.</p>
  ${parts.join("\n")}
</section>`.trim();
}

function renderDiscovery(c: AirlockConfig): string {
  return `
<section id="discovery">
  <h2>Discovery</h2>
  <p>This contract is published at well-known URLs. Consumers fetch them directly; no signup, no registry account.</p>
  <dl class="discovery">
    <dt>Machine spec</dt>
    <dd>GET /.well-known/airlock-config.yaml</dd>
    <dt>This human-readable site</dt>
    <dd>GET /.well-known/airlock-config/</dd>
    <dt>LLM-friendly markdown bundle</dt>
    <dd>GET /.well-known/airlock-config/llms.txt</dd>
    ${c.agent.channels && c.agent.channels.length > 0 ? `<dt>Channels</dt><dd>${c.agent.channels.join(", ")}</dd>` : ""}
  </dl>
</section>`.trim();
}

function renderSkills(c: AirlockConfig): string {
  if (c.skills.length === 0) return "";
  return `
<section id="skills">
  <h2>Skills ${bindingBadge("binding")}</h2>
  ${c.skills.map((s) => renderSkill(s, c)).join("\n")}
</section>`.trim();
}

function renderSkill(skill: Skill, c: AirlockConfig): string {
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
  ${ex.out !== undefined ? `<p>Synthesised response body:</p><pre><code>${escape(JSON.stringify(ex.out, null, 2))}</code></pre>` : ""}
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
  <p class="try-it-help">Runs in your browser — no server required. (Optional: tick the box to call a running sandbox instead.)</p>
  <label>Input JSON</label>
  <textarea class="payload">${escape(JSON.stringify(sample, null, 2))}</textarea>
  <div class="try-it-controls">
    <button class="run real">Real call (/skills/${escape(skill.id)})</button>
    <button class="run preflight">Pre-flight (/preflight/${escape(skill.id)})</button>
    <label class="sandbox-toggle">
      <input type="checkbox" class="use-sandbox">
      Use sandbox URL instead
    </label>
    <input type="text" class="sandbox-url" value="http://localhost:8080" placeholder="http://localhost:8080" hidden>
  </div>
  <pre class="result" hidden></pre>
</div>`.trim();
}

function renderAuthority(c: AirlockConfig): string {
  if (!c.authority || c.authority.length === 0) return "";
  return `
<section id="authority">
  <h2>Authority rules ${bindingBadge("binding")}</h2>
  <p>Evaluated in declaration order; the first matching <code>when</code> produces the verdict. Rules with a <strong>summary</strong> are indexable by the registry.</p>
  <ul class="rule-list">
    ${c.authority.map((r, i) => renderRule(r, i)).join("\n")}
  </ul>
</section>`.trim();
}

function renderRule(r: AuthorityRule, _idx: number): string {
  const cls = r.binding_class === "deterministic" ? "deterministic" : "judgment";
  const bindingTag = r.binding_class === "deterministic" ? "PROMISE" : "ESTIMATE";
  const bindingClass = r.binding_class === "deterministic" ? "promise" : "estimate";
  const keywords = r.keywords && r.keywords.length > 0
    ? `<p class="keywords">${r.keywords.map((k) => `<span class="chip">${escape(k)}</span>`).join(" ")}</p>`
    : "";
  const headline = r.summary
    ? `<p class="summary"><strong>${escape(r.summary)}</strong></p>`
    : "";
  return `
<li>
  <strong><code>${escape(r.id)}</code></strong>
  <span class="tag ${cls}">${escape(r.binding_class)}</span>
  <span class="tag ${bindingClass}">→ ${bindingTag}</span>
  on skill <code>${escape(r.skill)}</code>
  ${headline}
  ${r.description ? `<p>${escape(r.description)}</p>` : ""}
  <p>WHEN <code>${escape(r.when)}</code> → <code>${escape(r.then.code)}</code>${r.then.action ? ` + ${escape(r.then.action)}` : ""}</p>
  ${r.else ? `<p>ELSE → <code>${escape(r.else.code)}</code>${r.else.action ? ` + ${escape(r.else.action)}` : ""}</p>` : ""}
  ${keywords}
</li>`.trim();
}

function renderInstantFailures(c: AirlockConfig): string {
  if (!c.instant_failures || c.instant_failures.length === 0) return "";
  return `
<section id="instant-failures">
  <h2>Instant failures ${bindingBadge("binding")}</h2>
  <p>Reject-on-sight conditions. Always evaluated before authority rules.</p>
  <ul class="rule-list">
    ${c.instant_failures.map((f) => renderFailure(f)).join("\n")}
  </ul>
</section>`.trim();
}

function renderFailure(f: InstantFailure): string {
  const keywords = f.keywords && f.keywords.length > 0
    ? `<p class="keywords">${f.keywords.map((k) => `<span class="chip">${escape(k)}</span>`).join(" ")}</p>`
    : "";
  const headline = f.summary
    ? `<p class="summary"><strong>${escape(f.summary)}</strong></p>`
    : "";
  return `
<li>
  <strong><code>${escape(f.id)}</code></strong>
  <span class="tag promise">PROMISE</span>
  ${f.skill ? `on skill <code>${escape(f.skill)}</code>` : "(all skills)"}
  ${headline}
  ${f.description ? `<p>${escape(f.description)}</p>` : ""}
  <p>WHEN <code>${escape(f.when)}</code> → <code>${escape(f.code)}</code></p>
  ${f.message ? `<p><em>${escape(f.message)}</em></p>` : ""}
  ${keywords}
</li>`.trim();
}

function renderStatusCodes(): string {
  return `
<section id="status-codes">
  <h2>Status codes</h2>
  <p>Every verdict carries <code>{ code, binding, reason, ref, [action], [detail] }</code>. <span class="tag promise">PROMISE</span> = publisher is bound; <span class="tag estimate">ESTIMATE</span> = best guess.</p>
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

function renderFooter(c: AirlockConfig): string {
  const contact = c.agent.contact;
  const contactLine = contact
    ? `Contact: ${[contact.name, contact.email, contact.url].filter(Boolean).join(" · ")}.`
    : "";
  return `
<footer>
  <p>${escape(contactLine)}</p>
  <p>This page was generated from <code>airlock-config.yaml</code> by the Airlock Config renderer. See <a href="https://github.com/Okohedeki/airlock-config">Airlock Config</a> for the spec.</p>
</footer>`.trim();
}

function renderTryItScript(): string {
  return `
<script>
document.querySelectorAll('.try-it').forEach(function(box){
  var skill = box.dataset.skill;
  var payloadEl = box.querySelector('.payload');
  var resultEl = box.querySelector('.result');
  var useSandbox = box.querySelector('.use-sandbox');
  var sandboxUrl = box.querySelector('.sandbox-url');

  useSandbox.addEventListener('change', function(){
    sandboxUrl.hidden = !useSandbox.checked;
  });

  function show(text){ resultEl.hidden = false; resultEl.textContent = text; }

  function parseInput(){
    try { return { ok: true, value: JSON.parse(payloadEl.value || '{}') }; }
    catch (e) { return { ok: false, error: 'input is not valid JSON: ' + e.message }; }
  }

  async function runViaSandbox(mode, input){
    var base = (sandboxUrl.value || '').replace(/\\/$/, '');
    if (!base) { show('error: enter a sandbox URL or untick the box'); return; }
    show('requesting ' + base + '/' + mode + '/' + skill + '...');
    try {
      var res = await fetch(base + '/' + mode + '/' + skill, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input)
      });
      var json = await res.json();
      var src = res.headers.get('x-airlock-config-detail-source') || '';
      var srcLine = src ? '// detail source: ' + src + '\\n' : '';
      show('// HTTP ' + res.status + ' (via sandbox)\\n' + srcLine + JSON.stringify(json, null, 2));
    } catch (err) {
      show('error: ' + (err && err.message ? err.message : err) + '\\n(is the sandbox running at ' + base + '?)');
    }
  }

  function runInBrowser(mode, input){
    if (!window.airlockConfig) { show('error: in-browser evaluator did not load'); return; }
    try {
      var result = window.airlockConfig.evaluate(skill, input, mode);
      var src = result.detailSource ? '// detail source: ' + result.detailSource + '\\n' : '';
      show('// in-browser eval\\n' + src + JSON.stringify(result.verdict || result, null, 2));
    } catch (err) {
      show('error: ' + (err && err.message ? err.message : err));
    }
  }

  function run(mode){
    var parsed = parseInput();
    if (!parsed.ok) { show('error: ' + parsed.error); return; }
    if (useSandbox.checked) runViaSandbox(mode, parsed.value);
    else runInBrowser(mode, parsed.value);
  }

  box.querySelector('.run.real').addEventListener('click', function(){ run('skills'); });
  box.querySelector('.run.preflight').addEventListener('click', function(){ run('preflight'); });
});
</script>`.trim();
}

function renderContractInline(contract: AirlockConfig): string {
  const json = JSON.stringify(contract).replace(/<\/script/gi, "<\\/script");
  return `<script>window.__AIRLOCK_CONFIG_CONTRACT__ = ${json};</script>`;
}

function renderPlaygroundBundle(playgroundJs: string): string {
  return `<script>${playgroundJs}</script>`;
}

function bindingBadge(kind: "binding" | "informational"): string {
  const cls = kind === "binding" ? "binding" : "informational";
  const label = kind === "binding" ? "BINDING" : "INFORMATIONAL";
  return `<span class="tag ${cls}" title="${kind === "binding" ? "Load-bearing promise consumers may rely on (ADR 0004)" : "Deployment fact; may change in minor versions (ADR 0004)"}">${label}</span>`;
}

function escape(s: string | undefined): string {
  if (s === undefined || s === null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
