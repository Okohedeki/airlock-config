/**
 * Compile a per-contract input validator. Resolves `#/schemas/Foo` references
 * in skill inputs by registering the contract's schemas as a $defs bundle.
 */

import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import type { AirlockContract, Skill, Tool } from "../validate/types.js";

export type InputValidator = (input: unknown) =>
  | { ok: true }
  | { ok: false; errors: Array<{ path: string; message: string }> };

export function buildInputValidators(contract: AirlockContract): Map<string, InputValidator> {
  const ajv = new Ajv2020.default({ allErrors: true, strict: false });
  addFormats.default(ajv);

  const schemas = contract.schemas ?? {};
  ajv.addSchema(
    {
      $id: "airlock://contract-schemas",
      $defs: schemas as Record<string, unknown>,
    },
    "airlock://contract-schemas",
  );

  const validators = new Map<string, InputValidator>();

  for (const skill of contract.skills) {
    const inputSchema = rewriteRefs(skill.input) as Record<string, unknown>;
    const compiled = ajv.compile(inputSchema);

    validators.set(skill.id, (input: unknown) => {
      const ok = compiled(input);
      if (ok) return { ok: true };
      const errors = (compiled.errors ?? []).map((err) => ({
        path: err.instancePath || "(root)",
        message: err.message ?? "validation error",
      }));
      return { ok: false, errors };
    });
  }

  return validators;
}

/**
 * Walk a JSON Schema fragment and rewrite any `{ "$ref": "#/schemas/Foo" }`
 * into `{ "$ref": "airlock://contract-schemas#/$defs/Foo" }` so ajv can resolve
 * against the registered schemas bundle.
 */
function rewriteRefs(node: unknown): unknown {
  if (node === null || typeof node !== "object") return node;
  if (Array.isArray(node)) return node.map(rewriteRefs);

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
    if (k === "$ref" && typeof v === "string" && v.startsWith("#/schemas/")) {
      out.$ref = `airlock://contract-schemas#/$defs/${v.slice("#/schemas/".length)}`;
    } else {
      out[k] = rewriteRefs(v);
    }
  }
  return out;
}

// Exported only for callers that need to inspect the skill they validated against.
export function findSkill(contract: AirlockContract, id: string): Skill | undefined {
  return contract.skills.find((s) => s.id === id);
}

export function findTool(contract: AirlockContract, id: string): Tool | undefined {
  return contract.tools?.find((t) => t.id === id);
}
