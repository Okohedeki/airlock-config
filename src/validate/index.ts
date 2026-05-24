/**
 * Validate an Airlock contract. Runs the two passes:
 *   1. Structural (JSON Schema)
 *   2. Semantic lint
 *
 * Returns a unified result. Callers (CLI, library users) get one place to look.
 */

import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";

import { validateStructure, type StructuralError } from "./structural.js";
import { lintContract, type LintFinding } from "./lint.js";
import type { AirlockContract } from "./types.js";

export type ValidationIssue =
  | ({ kind: "structural" } & StructuralError)
  | ({ kind: "lint" } & LintFinding);

export type ValidationResult = {
  ok: boolean;
  contract: AirlockContract | null;
  issues: ValidationIssue[];
};

export function validateContract(input: unknown): ValidationResult {
  // Friendly migration message for pre-v0.3 contracts before structural noise.
  const versionIssue = checkAirlockVersion(input);
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

  const contract = input as AirlockContract;
  const lint = lintContract(contract);
  const issues: ValidationIssue[] = lint.findings.map((f) => ({
    kind: "lint",
    ...f,
  }));

  return { ok: lint.ok, contract, issues };
}

function checkAirlockVersion(input: unknown): ValidationIssue | null {
  if (typeof input !== "object" || input === null) return null;
  const v = (input as { airlock?: unknown }).airlock;
  if (typeof v !== "string") return null;
  if (/^0\.4(\.\d+)?$/.test(v)) return null;
  if (/^0\.5(\.\d+)?$/.test(v)) return null;
  if (/^0\.[123](\.\d+)?$/.test(v)) {
    return {
      kind: "structural",
      path: "/airlock",
      message:
        `contract declares airlock="${v}", but v0.4 is the current major. ` +
        `See docs/migration-v03-to-v04.md for the field-by-field migration.`,
      keyword: "version",
    };
  }
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

export type { AirlockContract } from "./types.js";
export type { StructuralError } from "./structural.js";
export type { LintFinding } from "./lint.js";
