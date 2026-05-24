# Migrating from Airlock v0.4 to Airlock Config v0.5

v0.5 renames the project, the CLI, the file, the YAML key, the well-known path, the headers, and the A2A extension URI to use `airlock-config` / `airlock_config`. The schema *shape* is unchanged from v0.4 — every field, every closed vocabulary, every authority-rule expression, every binding code carries over verbatim. Only the names change. See [ADR 0008](./adr/0008-rename-to-airlock-config.md) for the reframe.

## TL;DR

1. Bump `airlock: "0.4"` → `airlock_config: "0.5"` (key *and* value).
2. Rename your file from `*.airlock.yaml` → `*.airlock-config.yaml`.
3. Serve it from `/.well-known/airlock-config.yaml` (was `/.well-known/airlock.yaml`).
4. Reinstall the toolchain: `npm install -g airlock-config` (was `airlock`).
5. Replace `airlock <cmd>` with `airlock-config <cmd>` in any scripts, READMEs, CI.
6. If you parsed our debug headers, rename `X-Airlock-Detail-Source` → `X-Airlock-Config-Detail-Source` (same for `-Example`).
7. If you derive an A2A Agent Card from the contract, the extension URI on the back-pointer is now `airlock-config-contract` (was `airlock-contract`).
8. If you embed our JSON Schema via `$id`, the new URL is `https://okohedeki.github.io/airlock-config/schema/0.5/airlock-config.schema.json`.

## One-shot rename recipe

For a single contract:

```sh
# 1. rename the file
mv my-agent.airlock.yaml my-agent.airlock-config.yaml

# 2. rename the top-level key + bump the version
sed -i.bak 's/^airlock: "0\.4"/airlock_config: "0.5"/' my-agent.airlock-config.yaml
rm my-agent.airlock-config.yaml.bak
```

For a directory of contracts:

```sh
find . -name "*.airlock.yaml" | while read f; do
  new="${f%.airlock.yaml}.airlock-config.yaml"
  mv "$f" "$new"
  sed -i.bak 's/^airlock: "0\.4"/airlock_config: "0.5"/' "$new"
  rm "$new.bak"
done
```

If your contract was already `airlock: "0.4.1"` or another v0.4 patch, the `sed` pattern is `s/^airlock: "0\.4[^"]*"/airlock_config: "0.5"/`.

## Rename table (everything that changes)

| Surface | v0.4 | v0.5 |
|---|---|---|
| Top-level YAML key | `airlock: "0.4"` | `airlock_config: "0.5"` |
| File extension | `.airlock.yaml` | `.airlock-config.yaml` |
| Well-known machine path | `/.well-known/airlock.yaml` | `/.well-known/airlock-config.yaml` |
| Well-known portal directory | `/.well-known/airlock/` | `/.well-known/airlock-config/` |
| npm package | `airlock` | `airlock-config` |
| CLI command | `airlock validate <file>` | `airlock-config validate <file>` |
| HTTP debug header (detail source) | `X-Airlock-Detail-Source` | `X-Airlock-Config-Detail-Source` |
| HTTP debug header (example pointer) | `X-Airlock-Detail-Example` | `X-Airlock-Config-Detail-Example` |
| A2A extension URI on Agent Card | `airlock-contract` | `airlock-config-contract` |
| Schema `$id` | `https://airlock.dev/schema/0.4/airlock.schema.json` | `https://okohedeki.github.io/airlock-config/schema/0.5/airlock-config.schema.json` |
| Registry entry field | `airlock_spec` | `airlock_config_spec` |
| GitHub repo | `Okohedeki/airlock` | `Okohedeki/airlock-config` (auto-redirects) |
| Pages site | `okohedeki.github.io/airlock` | `okohedeki.github.io/airlock-config` |

## What does *not* change

- Every field name inside the contract: `agent`, `category`, `region`, `compliance`, `auth_model`, `pricing`, `permissions`, `guardrails`, `skills`, `authority`, `instant_failures`, `actions`, `sla`, `lifecycle`, `deprecation`, `schemas`, `tags`, `a2a` — all unchanged.
- Every closed vocabulary: industry codes, capability codes, region codes, compliance standards, auth methods, pricing units, data classes, status codes, action codes — all unchanged.
- The authority-rule expression language (`when` clauses) — unchanged.
- The binding-code system (PROMISE / ESTIMATE) and phase model — unchanged.
- The sandbox routes for skills (`/skills/:id`, `/preflight/:id`) — unchanged.
- The A2A bridge wire shape (JSON-RPC 2.0, `SendMessage`/`GetTask`/`CancelTask`, Task state machine, artifact carrying the verdict body) — unchanged.

If your v0.4 contract was valid, the v0.5 file is the same file with the top-line renamed.

## Validation errors you may see

| Error | Cause | Fix |
|---|---|---|
| `contract uses top-level key "airlock"; v0.5 renamed this to "airlock_config". See docs/migration-v04-to-v05.md` | The key wasn't renamed | Rename the key and bump the version. |
| `must NOT have additional property "airlock"` | The key wasn't renamed (schema-level rejection) | Same as above. |
| `airlock_config must match pattern "^0\.5(\.\d+)?$"` | Version string still says 0.4 | Bump the value to `"0.5"`. |
| `command not found: airlock` | Toolchain wasn't reinstalled | `npm install -g airlock-config`. |
| Consumer fetches `/.well-known/airlock.yaml` and gets 404 | Path wasn't updated on your server | Serve from `/.well-known/airlock-config.yaml`. The old path is not aliased. |

## Why no backward-compat shim

The only published v0.4 contract is the project's own demo. A shim that quietly accepts both `airlock:` and `airlock_config:` would carry the old name forward indefinitely, defeating the rename's whole purpose: a buyer or a foreign agent should see *one* name. The migration cost for external adopters is the `sed` one-liner above, and the validator's error message names the doc that explains it. That's the trade.

## Why two names won't drift apart

The spec name and the project name are both **Airlock Config**. The repo, the package, the CLI, the file, the key, the path, the headers, the A2A extension URI — every externally observable surface uses one consistent token. The only places "Airlock" appears alone in v0.5 are historical: ADRs 0001–0007, the v0.3 → v0.4 migration doc, and changelog entries describing prior versions. Going forward there is no separation between "Airlock the spec" and "airlock-config the tool" — they are the same thing.
