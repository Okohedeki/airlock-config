# Rename the project to `airlock-config`

**Status:** accepted (v0.5.0)

The project, the published npm package, the CLI, the JSON Schema file, the file extension (`.airlock.yaml`), the well-known path (`/.well-known/airlock.yaml`), the top-level YAML key (`airlock:`), the HTTP debug headers (`X-Airlock-*`), and the A2A extension URI (`airlock-contract`) are all renamed to use `airlock-config` / `airlock_config`. The display brand becomes **Airlock Config**.

## Why

"Airlock" is a brand. It doesn't tell a procurement officer, a partnerships director, or a consuming AI agent what the artifact in their hands actually *is*. The artifact is a **config file** — `package.json` is the config that tells npm what to install; `tsconfig.json` is the config that tells TypeScript how to compile; `airlock-config.yaml` is the config that tells other businesses' agents how to integrate with yours. Naming the file after its job — not after a metaphor — is what ADR 0006 was reaching for. v0.5 lands it.

The rename also separates the **spec** (what the file contains) from the **toolchain** (the CLI that validates, sandboxes, builds, and registers it). Both share the `airlock-config` name, but the conceptual distinction is now legible: the spec is a config format, the toolchain is its reference implementation.

A secondary motivation is discoverability. A repo called `airlock-config` shows up under config-format searches. A repo called `airlock` shows up next to spaceship games. The buyer-facing positioning we committed to in ADR 0006 needs a name a buyer would type.

## Considered options

- **Keep `airlock`, add an `airlock-config` alias** (rejected). Two names for one artifact splits documentation, splits searches, splits registry entries. The point of the rename is clarity; aliasing reintroduces ambiguity.
- **Rename only the project/CLI; keep the wire identifiers** (rejected). Half-rename: the spec is still served at `/.well-known/airlock.yaml` under key `airlock:`. Consumers read the YAML and meet the old name first. The repo title becomes a marketing decoration over an unchanged protocol — the worst of both worlds.
- **Full rename, clean v0.5 break** (accepted). One coherent name across spec, toolchain, CLI, file, key, path, headers, and extension URI. Breaking, but the migration is mechanical (`sed`) and the only published consumer is the project's own demo. See `docs/migration-v04-to-v05.md`.
- **Rename to something other than `airlock-config`** (considered). `agent-config`, `agent-card-plus`, `b2b-agent-manifest` were each considered. `airlock-config` keeps continuity with the v0.1–v0.4 brand (Airlock as the parent concept), states what the artifact is (a config), and remains short enough to type at a shell prompt.

## Consequences

- **Breaking on the wire.** The top-level YAML key changes (`airlock` → `airlock_config`), the file extension changes (`.airlock.yaml` → `.airlock-config.yaml`), the well-known path changes (`/.well-known/airlock.yaml` → `/.well-known/airlock-config.yaml`), the HTTP debug headers change (`X-Airlock-*` → `X-Airlock-Config-*`), the A2A extension URI changes (`airlock-contract` → `airlock-config-contract`). There is no backward-compat shim; the validator emits a friendly hint when it sees a v0.4-shaped file and points at the migration doc.
- **npm package republishes.** `airlock-config@0.5.0` is the new namespace. The old `airlock` name on npm is not aliased; consumers reinstall under the new name.
- **GitHub rebrand.** Repo renames from `Okohedeki/airlock` to `Okohedeki/airlock-config`; Pages URL becomes `okohedeki.github.io/airlock-config`. GitHub auto-redirects the old URLs at the platform level.
- **Schema `$id` moves.** From `https://airlock.dev/schema/0.4/airlock.schema.json` (an aspirational domain that was never actually registered) to `https://okohedeki.github.io/airlock-config/schema/0.5/airlock-config.schema.json` (the GitHub Pages deploy that does exist). If a custom domain is acquired later, the `$id` migrates again in a follow-up minor — this is fine; consumers should follow the `$id` redirect chain.
- **Internal cost.** ~425 references across code, docs, tests, examples, workflows. The TypeScript compiler catches every missed type rename; the test suite catches every missed wire-name change. Mechanical, surfaced by tooling.
- **No real consumers to migrate.** Only the project's own demo contract is published. External adopters do not exist yet at the time of this rename, which is exactly why the breaking cut is cheap now and would be painful in six months.
- **ADRs 0001–0007 are not rewritten.** They are historical; they describe decisions made under the old name. This ADR cross-links them and updates the narrative going forward.

## A note on the cadence

v0.3 shipped, v0.4 corrected the framing (ADR 0006), v0.5 lands the corrected framing in the *name*. The cadence is fast but each version closes a specific gap: harness-shape was wrong in v0.3, the field set fixed it in v0.4, the name lands it in v0.5. Future versions are not expected to keep this pace — the externally observable surface is now stable enough to expect minor/patch evolution from here.
