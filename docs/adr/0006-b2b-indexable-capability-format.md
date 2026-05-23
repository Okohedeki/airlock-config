# Airlock is a B2B indexable capability format, not a harness disclosure

**Status:** accepted (supersedes the framing in ADR 0004's v0.3 history)

A contract describes one thing: **a self-deployed business agent's externally observable capabilities, packaged so other businesses' AI agents can discover and integrate without prior coordination.** Buyers — procurement leads, partnership directors, operations heads, the integrating consumer agent acting on their behalf — read the contract to decide *will this agent do what I need, in my region, at my compliance bar, on terms I can budget?* Anything outside that decision is either an internal operational concern (out of scope) or a commercial term that lives behind a `price_url`.

The contract surfaces five categories of binding information:

1. **What the agent does** — `skills` (consumer-callable interactions) + `authority` rules + `instant_failures` + `actions` + `sla` + `lifecycle`.
2. **What categorises it** — `category` (industry + capability), `tags`.
3. **Where it operates** — `region` (data residency + served regions).
4. **What rules it operates under** — `compliance` (certifications and attestations), `guardrails` (refused topics/actions), `permissions` (data-access disclosure).
5. **How a buyer engages** — `auth_model` (enrollment + methods), `pricing` (model + unit + canonical commercial-terms URL).

## Why

A B2B publisher's competitive surface is *what their agent can do, who it serves, and on what terms*. An infrastructure-internal disclosure (which MCP servers, which hooks, which secrets) is the wrong artifact for that audience and the wrong artifact for an automated indexer that wants to filter "fintech agents in EU with SOC2 Type 2 on subscription pricing." A buyer is not asking "what hooks fire?"; an indexer cannot meaningfully categorise across vendors by harness-internal details.

v0.3 of the schema added Claude-Code-shaped fields and got immediate feedback that the framing was wrong. v0.4 strips them. The framing principle is now explicit: every binding field in the schema must be answerable by a buyer's question, not by an operator's question.

This is a scoping decision, not an anti-developer decision. Operators may want an *operational profile* document (which MCP server is loaded, which hook is configured, which secret is read) — that's a legitimate artifact for an audit pack or a vendor-due-diligence packet — but it is **not the same document** as the buyer-facing contract, and it is explicitly out of scope for Airlock v0.4. If demand emerges, a separate `airlock-operational.yaml` companion format becomes a v0.5+ candidate; the existence of the buyer contract is not gated on it.

The same principle resolves a recurring tension in the project: "Airlock is the contract format" vs. "Airlock is the disclosure manifest." It's the contract format. Anything dressing itself up as Airlock that disclosures infrastructure is mis-cast.

## Considered options

- **Keep v0.3 + add B2B alongside** (rejected). Bloats the contract with two unrelated audiences. The buyer wades through MCP server lists to find pricing; the operator wades through compliance attestations to find hook modes. Pleases neither audience.
- **Move v0.3 fields to a companion `operational.yaml`** (deferred). A defensible path *if* infrastructure-disclosure demand actually materialises. There is no current demand. Build when needed.
- **Hard rip in v0.4** (accepted). Delete the developer-shaped fields. Anchor the binding spine on buyer questions. Open the door for a companion operational format later if it earns its existence.

## Consequences

- ADR 0004's binding/informational categories survive; the *list* of binding blocks is reset to the buyer-facing surface.
- The flagship example pivots from `agent-harness.airlock.yaml` (coding agent) to `supplier-agent.airlock.yaml` (procurement supplier). Procurement was the v0.1 flagship for a reason; reinstate it, evolved.
- Categorisation uses Airlock-curated closed vocabularies (industry, capability, region, compliance standard, auth method, pricing model/unit). The vocabularies live in `docs/taxonomies.md` and grow by ADR-class proposals. `tags: [string]` is the open escape hatch.
- The registry's index entry is derived directly from the contract's B2B blocks. No separate registry-schema invention. A publisher publishes the contract and runs `airlock register-entry` to emit a ready-to-PR JSON index entry.
- The project ships a real product home page (not a per-contract landing) targeting business decision-makers. The previous conflation between "Airlock the product" and "this one demo contract" ends.
- Sandbox loses `/tools/:id` and `/preflight-tool/:id`. Skill routes and the schema-derived response faker (ADR 0005) are unaffected — the faker continues to serve every skill response that lacks an authored example.
- `permissions` becomes a data-access disclosure (`pii: yes|no`, `data_classes`, `retention`, `data_residency`), not a developer-facing allow/disallow list against `fs`/`network`/`tool`/`mcp`/`env`/`secret`. The developer-permission format is gone.
- Two ADRs (0004, 0005) keep their *structure* but get their field lists updated; this ADR records the reframe.

## A note on the v0.3 → v0.4 churn

v0.3 shipped a few hours before v0.4. Only one contract was ever published in v0.3 (the project's own demo), so the public migration cost is zero. The internal cost is real but small: ~30 files edited, all reviewable in one commit. The reframe is correct; it should not have shipped in v0.3, but the lesson is to grill the buyer-vs-operator distinction up front for future scope changes, not to defer the correction.
