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
  Guardrails,
  Harness,
  Hook,
  InstantFailure,
  MCPServer,
  PermissionEntry,
  Permissions,
  SecretDecl,
  Skill,
  Tool,
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
  /**
   * The browser-bundled playground script (output of `npm run build:playground`).
   * Inlined as `<script>` so the page evaluates contract verdicts client-side
   * without a local sandbox. Required.
   */
  playgroundJs: string;
};

export function renderHTML(contract: AirlockContract, opts: RenderHTMLOptions): string {
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
    renderHarness(contract.agent.harness),
    renderSkills(contract),
    renderTools(contract),
    renderHooks(contract.hooks),
    renderPermissions(contract.permissions),
    renderGuardrails(contract.guardrails),
    renderMCPServers(contract.mcp_servers),
    renderSecrets(contract.secrets),
    renderDelegates(contract.delegates_to),
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
  ];
  if (c.agent.harness) items.push(`<li><a href="#harness">Harness</a></li>`);
  items.push(...c.skills.map((s) => `<li><a href="#skill-${escape(s.id)}">${escape(s.id)}</a></li>`));
  if (c.tools && c.tools.length > 0) items.push(`<li><a href="#tools">Tools</a></li>`);
  if (c.hooks && c.hooks.length > 0) items.push(`<li><a href="#hooks">Hooks</a></li>`);
  if (c.permissions) items.push(`<li><a href="#permissions">Permissions</a></li>`);
  if (c.guardrails) items.push(`<li><a href="#guardrails">Guardrails</a></li>`);
  if (c.mcp_servers && c.mcp_servers.length > 0) items.push(`<li><a href="#mcp-servers">MCP servers</a></li>`);
  if (c.secrets && c.secrets.length > 0) items.push(`<li><a href="#secrets">Secrets</a></li>`);
  if (c.delegates_to && c.delegates_to.length > 0) items.push(`<li><a href="#delegates">Delegation</a></li>`);
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

function bindingBadge(kind: "binding" | "informational"): string {
  const cls = kind === "binding" ? "binding" : "informational";
  const label = kind === "binding" ? "BINDING" : "INFORMATIONAL";
  return `<span class="tag ${cls}" title="${kind === "binding" ? "Load-bearing promise consumers may rely on (ADR 0004)" : "Deployment fact; may change in minor versions (ADR 0004)"}">${label}</span>`;
}

function renderHarness(h: Harness | undefined): string {
  if (!h) return "";
  const limits = h.limits ?? {};
  const rows = [
    h.framework && `<tr><td><code>framework</code></td><td><code>${escape(h.framework)}</code></td></tr>`,
    h.model && `<tr><td><code>model</code></td><td><code>${escape(h.model)}</code></td></tr>`,
    h.runtime && `<tr><td><code>runtime</code></td><td><code>${escape(h.runtime)}</code></td></tr>`,
    limits.max_tokens !== undefined && `<tr><td><code>limits.max_tokens</code></td><td><code>${limits.max_tokens}</code></td></tr>`,
    limits.max_turns !== undefined && `<tr><td><code>limits.max_turns</code></td><td><code>${limits.max_turns}</code></td></tr>`,
    limits.max_tool_calls_per_turn !== undefined && `<tr><td><code>limits.max_tool_calls_per_turn</code></td><td><code>${limits.max_tool_calls_per_turn}</code></td></tr>`,
    limits.timeout && `<tr><td><code>limits.timeout</code></td><td><code>${escape(limits.timeout)}</code></td></tr>`,
  ].filter(Boolean);
  if (rows.length === 0) return "";
  return `
<section id="harness">
  <h2>Harness ${bindingBadge("informational")}</h2>
  <p>Runtime envelope serving this contract. Per ADR&nbsp;0004 these fields may change in minor versions without breaking the binding surface.</p>
  <table><tbody>${rows.join("")}</tbody></table>
</section>`.trim();
}

function renderSkills(c: AirlockContract): string {
  if (c.skills.length === 0) return "";
  return `
<section id="skills">
  <h2>Skills ${bindingBadge("binding")}</h2>
  ${c.skills.map((s) => renderSkill(s, c)).join("\n")}
</section>`.trim();
}

function renderSkill(skill: Skill, c: AirlockContract): string {
  const slaInfo = c.sla?.[skill.id] ?? c.sla?.[`skill:${skill.id}`];
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

function renderTools(c: AirlockContract): string {
  if (!c.tools || c.tools.length === 0) return "";
  return `
<section id="tools">
  <h2>Tools ${bindingBadge("binding")}</h2>
  <p>Capabilities the harness invokes internally. Distinct from <a href="#skills">skills</a> (which are what external consumers call). Authority rules and permissions may target tools by id.</p>
  ${c.tools.map((t) => renderTool(t)).join("\n")}
</section>`.trim();
}

function renderTool(t: Tool): string {
  const effects = t.side_effects && t.side_effects.length > 0
    ? `<p><strong>Side effects:</strong> ${t.side_effects.map((e) => `<code>${escape(e)}</code>`).join(", ")}</p>`
    : "";
  const source = t.source
    ? `<p><strong>Source:</strong> <code>${escape(t.source.kind)}</code>${t.source.server ? ` (server <code>${escape(t.source.server)}</code>)` : ""}</p>`
    : "";
  const limits = t.limits
    ? `<p><strong>Limits:</strong> ${[
        t.limits.timeout && `timeout <code>${escape(t.limits.timeout)}</code>`,
        t.limits.max_calls_per_skill !== undefined && `max ${t.limits.max_calls_per_skill} calls/skill`,
      ].filter(Boolean).join(" · ")}</p>`
    : "";
  return `
<div class="skill" id="tool-${escape(t.id)}">
  <h3><code>${escape(t.id)}</code> <span class="endpoint">POST /tools/${escape(t.id)}</span></h3>
  ${t.description ? `<p>${escape(t.description)}</p>` : ""}
  ${effects}
  ${source}
  ${limits}
  <h4>Input schema</h4>
  <pre><code>${escape(JSON.stringify(t.input_schema, null, 2))}</code></pre>
  ${t.output_schema ? `<h4>Output schema</h4><pre><code>${escape(JSON.stringify(t.output_schema, null, 2))}</code></pre>` : ""}
</div>`.trim();
}

function renderHooks(hooks: Hook[] | undefined): string {
  if (!hooks || hooks.length === 0) return "";
  return `
<section id="hooks">
  <h2>Hooks ${bindingBadge("binding")}</h2>
  <p>Lifecycle interception points the harness fires. <code>mode</code> is load-bearing: <code>observe</code> is read-only, <code>mutate</code> may rewrite the in-flight payload, <code>block</code> may halt the action.</p>
  <table>
    <thead><tr><th>event</th><th>mode</th><th>scope</th><th>description</th></tr></thead>
    <tbody>
      ${hooks.map((h) => `<tr>
        <td><code>${escape(h.event)}</code></td>
        <td><span class="tag ${h.mode === "block" ? "estimate" : h.mode === "mutate" ? "judgment" : "promise"}">${escape(h.mode)}</span></td>
        <td>${h.skill ? `skill <code>${escape(h.skill)}</code>` : h.tool ? `tool <code>${escape(h.tool)}</code>` : "all"}</td>
        <td>${h.description ? escape(h.description) : ""}</td>
      </tr>`).join("\n")}
    </tbody>
  </table>
</section>`.trim();
}

function renderPermissions(p: Permissions | undefined): string {
  if (!p) return "";
  const renderBucket = (label: string, entries: PermissionEntry[] | undefined): string => {
    if (!entries || entries.length === 0) return "";
    return `<h4>${label}</h4><ul>${entries.map((e) => `<li><code>${escape(formatPermission(e))}</code>${typeof e !== "string" && e.reason ? ` — ${escape(e.reason)}` : ""}</li>`).join("")}</ul>`;
  };
  return `
<section id="permissions">
  <h2>Permissions ${bindingBadge("binding")}</h2>
  <p>Static allow/disallow against typed resources. Resource taxonomy: <code>fs</code>, <code>network</code>, <code>tool</code>, <code>mcp</code>, <code>env</code>, <code>secret</code>.</p>
  ${renderBucket("Allowed", p.allowed)}
  ${renderBucket("Disallowed", p.disallowed)}
</section>`.trim();
}

function formatPermission(e: PermissionEntry): string {
  if (typeof e === "string") return e;
  const head = e.op === "*" || !e.op ? e.resource : `${e.resource}.${e.op}`;
  return e.scope ? `${head}:${e.scope}` : head;
}

function renderGuardrails(g: Guardrails | undefined): string {
  if (!g) return "";
  const parts: string[] = [];
  if (g.refused_topics && g.refused_topics.length > 0) {
    parts.push(`<p><strong>Refused topics:</strong> ${g.refused_topics.map((t) => `<code>${escape(t)}</code>`).join(", ")}</p>`);
  }
  if (g.refused_actions && g.refused_actions.length > 0) {
    parts.push(`<p><strong>Refused actions:</strong> ${g.refused_actions.map((t) => `<code>${escape(t)}</code>`).join(", ")}</p>`);
  }
  if (g.required_authentication !== undefined) {
    parts.push(`<p><strong>Requires authentication:</strong> <code>${g.required_authentication}</code></p>`);
  }
  if (parts.length === 0) return "";
  return `
<section id="guardrails">
  <h2>Guardrails ${bindingBadge("binding")}</h2>
  <p>Categorical refusals at the agent level; coarser than authority rules.</p>
  ${parts.join("\n")}
</section>`.trim();
}

function renderMCPServers(servers: MCPServer[] | undefined): string {
  if (!servers || servers.length === 0) return "";
  return `
<section id="mcp-servers">
  <h2>MCP servers ${bindingBadge("informational")}</h2>
  <p>Model Context Protocol servers the harness loads to source tools from.</p>
  <table>
    <thead><tr><th>name</th><th>endpoint</th><th>auth</th><th>tools</th></tr></thead>
    <tbody>
      ${servers.map((s) => `<tr>
        <td><code>${escape(s.name)}</code></td>
        <td>${s.endpoint ? `<code>${escape(s.endpoint)}</code>` : ""}</td>
        <td>${s.auth_posture ? `<code>${escape(s.auth_posture)}</code>` : ""}</td>
        <td>${s.allowed_tools ? s.allowed_tools.map((t) => `<code>${escape(t)}</code>`).join(", ") : "all"}</td>
      </tr>`).join("\n")}
    </tbody>
  </table>
</section>`.trim();
}

function renderSecrets(secrets: SecretDecl[] | undefined): string {
  if (!secrets || secrets.length === 0) return "";
  return `
<section id="secrets">
  <h2>Secrets ${bindingBadge("informational")}</h2>
  <p>Named env-vars or credentials the harness reads. Names and purposes only — never values.</p>
  <table>
    <thead><tr><th>name</th><th>purpose</th></tr></thead>
    <tbody>
      ${secrets.map((s) => `<tr><td><code>${escape(s.name)}</code></td><td>${s.purpose ? escape(s.purpose) : ""}</td></tr>`).join("\n")}
    </tbody>
  </table>
</section>`.trim();
}

function renderDelegates(delegates: string[] | undefined): string {
  if (!delegates || delegates.length === 0) return "";
  return `
<section id="delegates">
  <h2>Delegation ${bindingBadge("informational")}</h2>
  <p>Other Airlock contracts this agent may dispatch sub-work to — a transitive trust surface.</p>
  <ul>${delegates.map((u) => `<li><a href="${escape(u)}"><code>${escape(u)}</code></a></li>`).join("")}</ul>
</section>`.trim();
}

function renderAuthority(c: AirlockContract): string {
  if (!c.authority || c.authority.length === 0) return "";
  return `
<section id="authority">
  <h2>Authority rules ${bindingBadge("binding")}</h2>
  <p>Evaluated in declaration order; the first matching <code>when</code> produces the verdict.</p>
  <ul class="rule-list">
    ${c.authority.map((r, i) => renderRule(r, i)).join("\n")}
  </ul>
</section>`.trim();
}

function renderRule(r: AuthorityRule, _idx: number): string {
  const cls = r.binding_class === "deterministic" ? "deterministic" : "judgment";
  const bindingTag = r.binding_class === "deterministic" ? "PROMISE" : "ESTIMATE";
  const bindingClass = r.binding_class === "deterministic" ? "promise" : "estimate";
  const target = r.skill
    ? `on skill <code>${escape(r.skill)}</code>`
    : r.tool
      ? `on tool <code>${escape(r.tool)}</code>`
      : `<em>(no target)</em>`;
  return `
<li>
  <strong><code>${escape(r.id)}</code></strong>
  <span class="tag ${cls}">${escape(r.binding_class)}</span>
  <span class="tag ${bindingClass}">→ ${bindingTag}</span>
  ${target}
  ${r.description ? `<p>${escape(r.description)}</p>` : ""}
  <p>WHEN <code>${escape(r.when)}</code> → <code>${escape(r.then.code)}</code>${r.then.action ? ` + ${escape(r.then.action)}` : ""}</p>
  ${r.else ? `<p>ELSE → <code>${escape(r.else.code)}</code>${r.else.action ? ` + ${escape(r.else.action)}` : ""}</p>` : ""}
</li>`.trim();
}

function renderInstantFailures(c: AirlockContract): string {
  if (!c.instant_failures || c.instant_failures.length === 0) return "";
  return `
<section id="instant-failures">
  <h2>Instant failures ${bindingBadge("binding")}</h2>
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
  <p>This page was generated from <code>airlock-contract.yaml</code> by the Airlock renderer. See <a href="https://github.com/Okohedeki/airlock">Airlock</a> for the spec.</p>
</footer>`.trim();
}

function renderTryItScript(): string {
  // The browser-side handler. Default: evaluate in-browser via window.airlock.
  // Optional: tick "Use sandbox URL" to fetch a running sandbox instead.
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
      var src = res.headers.get('x-airlock-detail-source') || '';
      var srcLine = src ? '// detail source: ' + src + '\\n' : '';
      show('// HTTP ' + res.status + ' (via sandbox)\\n' + srcLine + JSON.stringify(json, null, 2));
    } catch (err) {
      show('error: ' + (err && err.message ? err.message : err) + '\\n(is the sandbox running at ' + base + '?)');
    }
  }

  function runInBrowser(mode, input){
    if (!window.airlock) { show('error: in-browser evaluator did not load'); return; }
    try {
      var result = window.airlock.evaluate(skill, input, mode);
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

function renderContractInline(contract: AirlockContract): string {
  // Inline the contract as JSON so the playground bundle can read it from globalThis
  // without an extra fetch. Use the </ escape trick to avoid breaking out of the
  // script tag if the contract description contains '</script>'.
  const json = JSON.stringify(contract).replace(/<\/script/gi, "<\\/script");
  return `<script>window.__AIRLOCK_CONTRACT__ = ${json};</script>`;
}

function renderPlaygroundBundle(playgroundJs: string): string {
  // Inline the playground bundle directly so the page is fully self-contained —
  // no extra file fetch needed, works on any static host.
  return `<script>${playgroundJs}</script>`;
}

function escape(s: string | undefined): string {
  if (s === undefined || s === null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
