/**
 * Structural validation: pass 1 of the validator. Validates a parsed contract
 * against schema/airlock-config.schema.json using ajv. Catches missing required
 * fields, type errors, illegal enum values.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const here = dirname(fileURLToPath(import.meta.url));
// Layout: src/validate/structural.ts (dev) or dist/validate/structural.js (prod).
// schema/ lives at the package root in both layouts.
const SCHEMA_PATH = resolve(here, "..", "..", "schema", "airlock-config.schema.json");

const schema = JSON.parse(readFileSync(SCHEMA_PATH, "utf-8"));

const ajv = new Ajv2020.default({ allErrors: true, strict: false });
addFormats.default(ajv);

const validateFn = ajv.compile(schema);

export type StructuralError = {
  path: string;
  message: string;
  keyword: string;
};

export type StructuralResult =
  | { valid: true; errors: [] }
  | { valid: false; errors: StructuralError[] };

export function validateStructure(contract: unknown): StructuralResult {
  const valid = validateFn(contract);
  if (valid) return { valid: true, errors: [] };

  const errors: StructuralError[] = (validateFn.errors ?? []).map((err) => ({
    path: err.instancePath || "(root)",
    message: err.message ?? "validation error",
    keyword: err.keyword,
  }));
  return { valid: false, errors };
}
