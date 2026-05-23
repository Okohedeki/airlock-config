# Contracts are published as static files at well-known URLs

**Status:** accepted

A publisher exposes their Airlock contract by hosting a static file at `https://<host>/.well-known/airlock.yaml` (machine spec) and a rendered docs site at `/.well-known/airlock/` (HTML + LLM-friendly markdown). Consumers fetch the file from any URL the publisher hands out; auto-discovery uses the well-known path; an optional GitHub-list registry indexes self-listed publishers. Airlock generates the bundle; the publisher serves it on whatever static infrastructure they already use. Airlock itself never hosts anything.

## Why

This is the literal OpenAPI analogue: a static file at a well-known path, tooling reads it, the publisher's actual stack is untouched. It delivers the publisher's stated requirement ("expose my agents so others understand the rules without me building infrastructure") with the lowest possible operational cost — a static file behind their existing HTTPS. It also keeps Airlock honest about scope (see ADR 0001): we are not a runtime, we never see traffic, we never hold secrets. The publisher chooses any combination of three discovery channels — well-known URI, directly shared URL, GitHub-list registry — without Airlock taking on platform responsibilities. Deployment, which is a meaningful concern on its own, is split into a sister project so Airlock can stay narrowly scoped.

## Consequences

- The output of `airlock build` is a static directory the publisher hosts. Format: `dist/.well-known/airlock.yaml`, `dist/.well-known/airlock/index.html`, `dist/.well-known/airlock/llms.txt`.
- A sister project (see `docs/airlock-deploy-sister-project.md`) handles "scaffold + deploy an agent that serves this contract." Airlock and the deploy project are intentionally separable.
- The registry is a public GitHub repo with a single JSON file. No accounts, no moderation, no hosted index service. A hosted registry with accounts/curation is Layer 3.
- Hard to reverse once developers adopt the file-based model. If we ever ship a hosted gateway later, it must compose with the file-based contract (read the same YAML), not replace it.
