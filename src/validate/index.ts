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
