/**
 * Validate an Airlock Config contract. Runs the two passes:
 *   1. Structural (JSON Schema)
 *   2. Semantic lint
 *
 * Returns a unified result. Callers (CLI, library users) get one place to look.
 */

import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";

import { validateStructure, type StructuralError } from "./structural.js";
import { lintContract, type LintFinding } from "./lint.js";
import type { AirlockConfig } from "./types.js";

export type ValidationIssue =
  | ({ kind: "structural" } & StructuralError)
  | ({ kind: "lint" } & LintFinding);

export type ValidationResult = {
  ok: boolean;
  contract: AirlockConfig | null;
  issues: ValidationIssue[];
};

export function validateContract(input: unknown): ValidationResult {
  // Friendly migration message for older contracts before structural noise.
  const versionIssue = checkSpecVersion(input);
  if (versionIssue) {
    return { ok: false, contract: null, issues: [versionIssue] };
  }

  const structural = validateStructure(input);
  if (!structural.valid) {
    return {
      ok: false,
      contract: null,
      issues: structural.errors.map((err) => ({ kind: "structural", ...err })),
    };
  }

  const contract = input as AirlockConfig;
  const lint = lintContract(contract);
  const issues: ValidationIssue[] = lint.findings.map((f) => ({
    kind: "lint",
    ...f,
  }));

  return { ok: lint.ok, contract, issues };
}

function checkSpecVersion(input: unknown): ValidationIssue | null {
  if (typeof input !== "object" || input === null) return null;

  // v0.4 used the `airlock:` top-level key; v0.5 renamed it to `airlock_config:`.
  // If we see the old key, give a one-shot migration hint instead of a wall of
  // ajv errors about additional properties.
  const legacy = (input as { airlock?: unknown }).airlock;
  if (typeof legacy === "string") {
    if (/^0\.[123](\.\d+)?$/.test(legacy)) {
      return {
        kind: "structural",
        path: "/airlock",
        message:
          `contract declares airlock="${legacy}", but v0.5 is the current major. ` +
          `See docs/migration-v03-to-v04.md and docs/migration-v04-to-v05.md for the field-by-field migration.`,
        keyword: "version",
      };
    }
    return {
      kind: "structural",
      path: "/airlock",
      message:
        `contract uses the v0.4 top-level key "airlock"; v0.5 renamed this to "airlock_config" and bumped the file extension to .airlock-config.yaml. ` +
        `See docs/migration-v04-to-v05.md for the one-shot sed recipe.`,
      keyword: "version",
    };
  }

  const v = (input as { airlock_config?: unknown }).airlock_config;
  if (typeof v !== "string") return null;
  if (/^0\.5(\.\d+)?$/.test(v)) return null;
  return null;
}

export function validateContractFile(path: string): ValidationResult {
  const raw = readFileSync(path, "utf-8");
  let parsed: unknown;
  try {
    parsed = path.endsWith(".json") ? JSON.parse(raw) : parseYaml(raw);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      contract: null,
      issues: [
        {
          kind: "structural",
          path: "(parse)",
          message: `failed to parse ${path}: ${message}`,
          keyword: "parse",
        },
      ],
    };
  }
  return validateContract(parsed);
}

export type { AirlockConfig } from "./types.js";
export type { StructuralError } from "./structural.js";
export type { LintFinding } from "./lint.js";
