/**
 * Minimal embedded stylesheet for the rendered docs portal.
 * Goals: readable on every device, no external dependencies, < 2KB.
 */

export const STYLES = `
:root {
  --bg: #fdfdfc;
  --fg: #1a1a1a;
  --muted: #5e5e5e;
  --rule: #e6e6e3;
  --code-bg: #f4f3ef;
  --accent: #2e5cb8;
  --promise: #1b7f3b;
  --estimate: #b86b1f;
  --error: #b8332e;
  --mono: ui-monospace, "SF Mono", Menlo, Monaco, Consolas, monospace;
  --sans: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}
html { scroll-behavior: smooth; }
body {
  background: var(--bg);
  color: var(--fg);
  font-family: var(--sans);
  max-width: 880px;
  margin: 0 auto;
  padding: 2rem 1.5rem 5rem;
  line-height: 1.6;
  font-size: 16px;
}
header.agent { border-bottom: 1px solid var(--rule); padding-bottom: 1.5rem; margin-bottom: 2rem; }
header.agent h1 { margin: 0 0 .25rem; font-size: 2rem; }
header.agent .version { font-family: var(--mono); color: var(--muted); font-size: .9rem; }
header.agent p.description { color: var(--muted); margin: .75rem 0 0; font-size: 1.05rem; }
nav.toc { background: var(--code-bg); border-radius: 6px; padding: .75rem 1rem; margin-bottom: 2rem; }
nav.toc h2 { font-size: .8rem; margin: 0 0 .5rem; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); }
nav.toc ul { list-style: none; margin: 0; padding: 0; columns: 2; column-gap: 1.5rem; }
nav.toc li { font-size: .95rem; padding: .15rem 0; break-inside: avoid; }
nav.toc a { color: var(--accent); text-decoration: none; }
nav.toc a:hover { text-decoration: underline; }
section { margin-bottom: 3rem; }
h2 { font-size: 1.5rem; border-bottom: 1px solid var(--rule); padding-bottom: .35rem; margin-top: 2.5rem; }
h3 { font-size: 1.2rem; margin-top: 2rem; }
h4 { font-size: 1rem; color: var(--muted); margin-top: 1.25rem; }
code, pre { font-family: var(--mono); }
code { background: var(--code-bg); padding: .12rem .3rem; border-radius: 3px; font-size: .9em; }
pre { background: var(--code-bg); border-radius: 6px; padding: 1rem; overflow-x: auto; font-size: .85rem; line-height: 1.5; }
pre code { background: transparent; padding: 0; font-size: 1em; }
.skill { border: 1px solid var(--rule); border-radius: 8px; padding: 1.25rem 1.5rem; margin-bottom: 1.5rem; background: #fff; }
.skill h3 { margin-top: 0; display: flex; align-items: baseline; gap: .75rem; flex-wrap: wrap; }
.endpoint { font-family: var(--mono); font-size: .95rem; color: var(--accent); background: var(--code-bg); padding: .15rem .5rem; border-radius: 4px; }
.tag { font-size: .7rem; font-weight: 600; letter-spacing: .05em; padding: .15rem .5rem; border-radius: 3px; text-transform: uppercase; vertical-align: middle; }
.tag.promise { background: #d5ecdc; color: var(--promise); }
.tag.estimate { background: #f6e1cc; color: var(--estimate); }
.tag.deterministic { background: #dbe5f4; color: var(--accent); }
.tag.judgment { background: #f6e1cc; color: var(--estimate); }
.tag.binding { background: #d5ecdc; color: var(--promise); margin-left: .5rem; }
.tag.informational { background: #ecebe7; color: var(--muted); margin-left: .5rem; }
table { width: 100%; border-collapse: collapse; margin: 1rem 0; font-size: .95rem; }
th, td { text-align: left; border-bottom: 1px solid var(--rule); padding: .5rem .75rem; vertical-align: top; }
th { background: var(--code-bg); font-weight: 600; }
.rule-list { padding-left: 0; list-style: none; }
.rule-list li { padding: .5rem 0; border-bottom: 1px solid var(--rule); }
.rule-list li:last-child { border-bottom: none; }
footer { color: var(--muted); font-size: .85rem; margin-top: 4rem; padding-top: 1rem; border-top: 1px solid var(--rule); }
footer a { color: var(--accent); }
.discovery { background: var(--code-bg); border-radius: 6px; padding: 1rem 1.25rem; font-size: .95rem; }
.discovery dt { font-family: var(--mono); font-size: .9rem; font-weight: 600; }
.discovery dd { margin: .2rem 0 .75rem 0; font-family: var(--mono); font-size: .85rem; color: var(--muted); }
.try-it { background: #fff; border: 1px solid var(--rule); border-radius: 6px; padding: 1rem 1.25rem; margin: 1rem 0; }
.try-it h4 { margin-top: 0; }
.try-it label { display: block; font-size: .85rem; color: var(--muted); margin: .5rem 0 .2rem; }
.try-it textarea, .try-it input { width: 100%; box-sizing: border-box; padding: .5rem; font-family: var(--mono); font-size: .85rem; border: 1px solid var(--rule); border-radius: 4px; background: var(--bg); color: var(--fg); }
.try-it textarea { min-height: 6rem; }
.try-it button { background: var(--accent); color: #fff; border: none; border-radius: 4px; padding: .5rem 1rem; font-size: .9rem; cursor: pointer; margin-top: .5rem; }
.try-it button:hover { filter: brightness(.95); }
.try-it pre.result { margin-top: .75rem; background: var(--code-bg); }
.try-it .try-it-help { font-size: .85rem; color: var(--muted); margin: 0 0 .5rem; }
.try-it-controls { display: flex; flex-wrap: wrap; align-items: center; gap: .5rem .75rem; margin-top: .5rem; }
.try-it-controls .sandbox-toggle { display: inline-flex; align-items: center; gap: .35rem; font-size: .85rem; color: var(--muted); margin: 0; }
.try-it-controls .sandbox-toggle input { width: auto; }
.try-it-controls .sandbox-url { flex: 1 1 220px; min-width: 200px; }
`.trim();
