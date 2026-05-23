# Migrating from Airlock v0.3 to v0.4

v0.3 framed the contract as an AI-harness disclosure manifest (`tools`, `hooks`, `mcp_servers`, `secrets`, `delegates_to`, `agent.harness`). v0.4 strips those fields and anchors the contract on **B2B indexable capability** — the buyer-facing fields a procurement officer or a foreign business agent uses to decide whether to integrate. See ADR 0006.

## TL;DR

1. Bump `airlock: "0.3"` → `airlock: "0.4"`.
2. **Delete** any of these blocks you used: `tools`, `hooks`, `mcp_servers`, `secrets`, `delegates_to`, `agent.harness`.
3. **Add** at minimum `category: { industry, capability }`. Recommended: `region`, `compliance`, `auth_model`, `pricing`.
4. **Reshape `permissions`** if you had one: drop the developer allow/disallow grammar (`fs.read:./src/**`) and use the data-access disclosure shape (`pii`, `data_classes`, `retention`).
5. **Reshape `guardrails`** if needed: free-form strings still work, but the lint will warn on values outside the recommended vocabulary in [docs/taxonomies.md](./taxonomies.md).
6. Authority rules now target a `skill` only. If you had any `tool: <id>` rules, delete them — the sandbox no longer has tool routes.
7. (Recommended) Add `summary` and `keywords` to every authority rule and instant_failure so registries can index the substance, not just the expression source.

## Removed blocks

| v0.3 block | What to do in v0.4 |
|---|---|
| `tools` | Delete. v0.4 contracts do not disclose internal capabilities. |
| `hooks` | Delete. Hooks are an operational concern, not a buyer-facing one. |
| `mcp_servers` | Delete. Tool provenance is an operational concern. |
| `secrets` | Delete. Env-var disclosure is for internal audit, not the buyer contract. |
| `delegates_to` | Delete. The trust-chain story belongs in a separate operational doc. |
| `agent.harness` | Delete. Framework/model/runtime/limits aren't buyer-relevant. |

If you genuinely need any of these for an internal audit pack or vendor-diligence packet, keep them in a separate file (e.g. `airlock-operational.yaml`). v0.5+ may introduce a formal companion format if demand emerges; for now the buyer contract stays lean.

## New required block: `category`

```yaml
category:
  industry: procurement          # one of the curated values in docs/taxonomies.md
  capability: transaction_processing
  subcategory: po-confirmation   # optional free-form refinement
```

This is the single most important indexing surface. A registry pre-filters every buyer query on `industry` + `capability`.

## New recommended blocks

```yaml
region:
  data_residency: [us-east, eu-west]
  serves_regions: [us-east, us-west, ca, eu-west, eu-central, uk]

compliance:
  - { standard: SOC2_TYPE_2, status: certified, attestation_url: "...", verified_at: "2026-02-14" }
  - { standard: GDPR, status: self_attested }

auth_model:
  methods: [oauth2_client_credentials, mtls]
  enrollment: enterprise_only
  support_url: https://example.com/enrol

pricing:
  model: enterprise          # free | metered | subscription | enterprise | usage_tiered
  unit: per_call             # optional
  price_url: https://example.com/pricing
```

Every value above uses a closed vocabulary documented in [docs/taxonomies.md](./taxonomies.md). The validator rejects unknown values.

## Reshaped: `permissions`

v0.3 used developer-permission strings:

```yaml
# v0.3 — DELETE
permissions:
  allowed:
    - "fs.read:./**"
    - "network:api.github.com"
  disallowed:
    - "tool:bash:rm -rf *"
```

v0.4 uses **data-access disclosure**:

```yaml
permissions:
  pii: minimal                          # none | minimal | moderate | extensive
  data_classes: [business_confidential, financial]
  retention: 7y                         # "0s" | "<n><s|m|h|d|y>" | "indefinite"
  third_party_sharing: subprocessors_only
```

This is what a buyer's risk-management process actually wants to know.

## Reshaped: `guardrails`

`refused_topics` and `refused_actions` are still free-form strings, but the lint warns when you use values outside the recommended vocabulary. Use the curated terms from `docs/taxonomies.md` so a registry can search across publishers (e.g. "all agents that refuse to `transfer_funds_to_new_payee`").

```yaml
guardrails:
  refused_topics: [financial_advice, investment_recommendation]
  refused_actions: [transfer_funds_to_new_payee, share_pii_outside_jurisdiction]
  required_authentication: true
```

## Authority rules: `summary` + `keywords` (new, optional)

Add a one-line summary and indexing keywords to every rule. The lint warns when a rule has no summary; registry searches systematically underrepresent contracts whose rules are opaque.

```yaml
authority:
  - id: accept-small-date-changes
    summary: Auto-accept delivery date adjustments within ±3 days.
    keywords: [purchase_order, auto_accept, delivery_date, small_change]
    skill: confirm_po
    binding_class: deterministic
    when: "abs(input.delivery_date_change_days) <= 3"
    then: { code: ACCEPTED_BY_RULE, action: UNILATERAL_COMMIT }
```

Same for `instant_failures`.

## Sandbox: routes removed

The v0.3 sandbox served `/tools/:id` and `/preflight-tool/:id`. v0.4 removes both — the contract no longer declares tools. Skill routes (`/skills/:id` + `/preflight/:id`) are unchanged; the schema-derived response faker (ADR 0005) is unchanged.

## Validation errors you may see

| Error | Cause | Fix |
|---|---|---|
| `contract declares airlock="0.3", but v0.4 is the current major. See docs/migration-v03-to-v04.md` | Version still says 0.3 | Bump to `"0.4"` and follow this guide. |
| `must NOT have additional property "tools"` (or hooks/mcp_servers/secrets/delegates_to) | A v0.3 block is still present | Delete it. |
| `must have required property "category"` | No `category` block | Add `category: { industry, capability }`. |
| `authority[N] must NOT have additional property "tool"` | A v0.3 tool-targeted rule | Delete it; rules target skills only in v0.4. |
| `permissions/allowed must NOT have additional property` | v0.3 developer permission format | Reshape to data-access disclosure. |
| `value is not in the recommended vocabulary` (warning) | A guardrails term outside the recommended list | Either adopt a recommended term or accept the warning. |
| `authority[N] has no \`summary\`` (warning) | Rule lacks the indexing summary | Add a one-liner. Warning only; not blocking. |

## A worked example

A minimal v0.3 contract:

```yaml
airlock: "0.3"
agent: { name: pinger, version: 0.1.0 }
skills:
  - id: ping
    input: { type: object }
    output: { type: object, properties: { pong: { type: boolean } } }
```

The v0.4 equivalent — bump the version and add `category`:

```yaml
airlock: "0.4"
agent: { name: pinger, version: 0.1.0 }
category:
  industry: other
  capability: other
skills:
  - id: ping
    input: { type: object }
    output: { type: object, properties: { pong: { type: boolean } } }
```

That's a 3-line addition.

## Why two majors in one day

v0.3 missed the buyer audience entirely (it disclosed harness internals; buyers don't read those). v0.4 corrects the framing. Only the project's own demo contract was ever published in v0.3, so the public migration cost is zero. The fix is intentional and documented in ADR 0006.
