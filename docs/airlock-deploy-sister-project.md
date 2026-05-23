# Airlock Deploy — Sister Project (Placeholder)

**Status:** not yet started. This file is a marker so the decision and design constraints survive until the project is spun out into its own repo.

## Mission

Take an Airlock-contract-aware agent project from `airlock build` output to **live in production on the publisher's own cloud account**, with the well-known URLs served automatically.

This project is **explicitly not Airlock**. Airlock generates the static bundle (machine spec + rendered docs + LLM markdown) and the handler stubs (`airlock codegen`). This project picks that output up, wires it to a deploy target, and runs the deploy command using the publisher's existing cloud credentials.

## Working name

To pick when spinning out. Candidates: **Airlock-Deploy**, **Hangar**, **Berth**, **Pier**. Anything that signals "where contracts go to live" without overloading existing terms.

## Inherited design constraint (load-bearing)

**The sister project never becomes a hosted runtime either.** It scaffolds, configures, and invokes the publisher's own platform — Cloudflare, Vercel, Fly, Lambda, whatever. The publisher owns the account, the secrets, the URL, the data. The sister project never holds traffic for publishers.

If the sister project ever needs to hold traffic, that is Layer 3 territory and a separate (paid) product. The §0 invariant from `prompt.md` ("not a wire protocol, not a network stack") applies here too.

## v1 candidate deploy target

**Cloudflare Workers** is the strong default. Reasons:

- Global edge by default → publisher's contract serves fast from anywhere.
- Built-in secrets via `wrangler secret put` → keys never touch the sister project.
- Native `/.well-known/...` serving with no config gymnastics.
- Custom domain support is one-shot.
- Generous free tier → zero-cost trial for the v1 user persona (Priya, mid-sized B2B SaaS).
- `wrangler deploy` is a single command we can wrap cleanly.

## Sketch of v1 CLI surface (subject to change)

```
<sister> init my-agent --target=cloudflare        # scaffold project linked to Airlock
<sister> deploy                                    # wraps wrangler deploy with the right config
<sister> domain add api.priya.com                  # configures custom domain + well-known routing
<sister> secret set OPENAI_API_KEY                 # delegates to wrangler secret put
<sister> logs                                      # tail the publisher's runtime logs
```

## Open questions (to grill when this project gets its own plan session)

1. **Final name.**
2. **One deploy target or two for v1.** Cloudflare-first is the default; ship Vercel/Fly/Lambda only after Workers is real and the abstraction is proven.
3. **Codegen handoff.** Does the sister project re-read the Airlock contract directly, or consume `airlock codegen` output? Probably both — read the contract for metadata, consume codegen for handler stubs.
4. **Contract version updates.** When the publisher releases v2 of their contract, does the sister project auto-redeploy, or wait for an explicit trigger? Implication for blue/green and rollback.
5. **License.** Match Airlock — Apache-2.0 — to preserve the neutrality story.
6. **Repo layout.** Sibling repo (`airlock-deploy`) or monorepo with Airlock? Default to sibling for clear license boundaries and independent versioning.

## Composition contract with Airlock

The boundary between Airlock and this project is:

```
Airlock outputs:                            This project consumes:
  dist/.well-known/airlock.yaml             - serves at well-known URL
  dist/.well-known/airlock/index.html       - serves at well-known URL
  dist/.well-known/airlock/llms.txt         - serves at well-known URL
  handlers/*.ts (from airlock codegen)      - wires into the runtime
  contract.yaml (the source)                - reads for metadata only
```

This project must not modify the Airlock-produced files. It treats them as immutable inputs to the deploy step.
