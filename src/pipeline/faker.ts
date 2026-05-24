/**
 * Deterministic, schema-derived response faker for the sandbox. See ADR 0005.
 *
 * When the publisher has no authored example matching the computed verdict, the
 * sandbox falls back here: walk the skill's output JSON Schema and synthesise a
 * valid payload, echoing same-named input fields where the types are compatible.
 *
 * Determinism: the same {skillId, input} pair always produces the same output.
 * No LLM, no network, no clock — pure function over the contract + request.
 *
 * Not for production response fidelity. Publishers who care about realism
 * author examples; the faker exists so that the *absence* of an example
 * doesn't leave consumers with an empty body.
 */

import type { AirlockConfig } from "../validate/types.js";

export type FakeOptions = {
  /** The schema to fake against (skill.output or tool.output_schema). */
  schema: Record<string, unknown>;
  /** The contract — needed to resolve `#/schemas/Foo` references. */
  contract: AirlockConfig;
  /** The inbound request payload. Used for same-name input echo. */
  input: unknown;
  /** Stable identifier used in the seed (skill or tool id). */
  subjectId: string;
};

export function fakeFromSchema(opts: FakeOptions): unknown {
  const rng = mulberry32(seedFor(opts.subjectId, opts.input));
  return walk(opts.schema, opts, rng, []);
}

function seedFor(subjectId: string, input: unknown): number {
  return fnv1a(`${subjectId}::${stableStringify(input)}`);
}

function walk(
  node: unknown,
  opts: FakeOptions,
  rng: () => number,
  path: string[],
): unknown {
  if (node === null || typeof node !== "object") return undefined;
  const schema = node as Record<string, unknown>;

  // Resolve $ref into the contract's #/schemas bundle.
  if (typeof schema.$ref === "string") {
    const resolved = resolveRef(schema.$ref, opts.contract);
    if (!resolved) return undefined;
    return walk(resolved, opts, rng, path);
  }

  // Honour explicit enums (always pick the first — deterministic and obviously valid).
  if (Array.isArray(schema.enum) && schema.enum.length > 0) {
    return schema.enum[0];
  }

  // Honour const.
  if (Object.prototype.hasOwnProperty.call(schema, "const")) {
    return schema.const;
  }

  const type = inferType(schema);

  switch (type) {
    case "object":
      return walkObject(schema, opts, rng, path);
    case "array":
      return walkArray(schema, opts, rng, path);
    case "string":
      return fakeString(schema, rng, path);
    case "number":
    case "integer":
      return fakeNumber(schema, rng, type === "integer");
    case "boolean":
      return rng() > 0.5;
    case "null":
      return null;
    default:
      return undefined;
  }
}

function walkObject(
  schema: Record<string, unknown>,
  opts: FakeOptions,
  rng: () => number,
  path: string[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const properties = (schema.properties ?? {}) as Record<string, Record<string, unknown>>;
  const required = new Set((schema.required as string[] | undefined) ?? []);
  const inputAtPath = readPath(opts.input, path);

  for (const [name, propSchema] of Object.entries(properties)) {
    const echoed = tryEcho(propSchema, inputAtPath, name);
    if (echoed !== undefined) {
      out[name] = echoed;
      continue;
    }
    // Skip optional properties beyond the first three by deterministic coin
    // flip — produces realistic-feeling responses that don't always include
    // every optional field, while staying reproducible.
    if (!required.has(name) && Object.keys(out).length >= 3 && rng() < 0.5) {
      continue;
    }
    const v = walk(propSchema, opts, rng, [...path, name]);
    if (v !== undefined) out[name] = v;
  }
  return out;
}

function walkArray(
  schema: Record<string, unknown>,
  opts: FakeOptions,
  rng: () => number,
  path: string[],
): unknown[] {
  const items = schema.items;
  if (!items || typeof items !== "object") return [];
  // One sample element. Predictable and small.
  const element = walk(items as Record<string, unknown>, opts, rng, [...path, "0"]);
  return element === undefined ? [] : [element];
}

function tryEcho(
  propSchema: Record<string, unknown>,
  inputObj: unknown,
  name: string,
): unknown | undefined {
  if (!inputObj || typeof inputObj !== "object") return undefined;
  const obj = inputObj as Record<string, unknown>;
  if (!Object.prototype.hasOwnProperty.call(obj, name)) return undefined;
  const value = obj[name];
  if (value === null || value === undefined) return undefined;
  return typeMatches(value, propSchema) ? value : undefined;
}

function typeMatches(value: unknown, schema: Record<string, unknown>): boolean {
  const t = inferType(schema);
  if (t === "string") return typeof value === "string";
  if (t === "number") return typeof value === "number";
  if (t === "integer") return typeof value === "number" && Number.isInteger(value);
  if (t === "boolean") return typeof value === "boolean";
  if (t === "array") return Array.isArray(value);
  if (t === "object") return typeof value === "object" && value !== null && !Array.isArray(value);
  if (t === "null") return value === null;
  return false;
}

function inferType(schema: Record<string, unknown>): string {
  if (typeof schema.type === "string") return schema.type;
  if (Array.isArray(schema.type) && typeof schema.type[0] === "string") return schema.type[0];
  if (schema.properties || schema.required || schema.additionalProperties !== undefined) return "object";
  if (schema.items) return "array";
  return "unknown";
}

function fakeString(
  schema: Record<string, unknown>,
  rng: () => number,
  path: string[],
): string {
  const format = schema.format;
  if (format === "date") return seededDate(rng);
  if (format === "date-time") return `${seededDate(rng)}T${seededTime(rng)}Z`;
  if (format === "email") return `sample-${seededWord(rng)}@example.com`;
  if (format === "uri" || format === "url") return `https://example.com/${seededWord(rng)}`;
  if (format === "uuid") return seededUuid(rng);
  if (typeof schema.const === "string") return schema.const;
  const hint = (schema.title as string) ?? path[path.length - 1] ?? "value";
  return `sample-${hint}-${seededWord(rng)}`;
}

function fakeNumber(schema: Record<string, unknown>, rng: () => number, integer: boolean): number {
  const min = typeof schema.minimum === "number" ? schema.minimum : 0;
  const max = typeof schema.maximum === "number" ? schema.maximum : min + 100;
  const v = min + rng() * (max - min);
  return integer ? Math.floor(v) : Math.round(v * 100) / 100;
}

function seededWord(rng: () => number): string {
  const letters = "abcdefghijklmnopqrstuvwxyz";
  let out = "";
  for (let i = 0; i < 6; i++) {
    out += letters[Math.floor(rng() * letters.length)];
  }
  return out;
}

function seededDate(rng: () => number): string {
  const year = 2026;
  const month = String(1 + Math.floor(rng() * 12)).padStart(2, "0");
  const day = String(1 + Math.floor(rng() * 28)).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function seededTime(rng: () => number): string {
  const h = String(Math.floor(rng() * 24)).padStart(2, "0");
  const m = String(Math.floor(rng() * 60)).padStart(2, "0");
  const s = String(Math.floor(rng() * 60)).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

function seededUuid(rng: () => number): string {
  const hex = "0123456789abcdef";
  let out = "";
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) {
      out += "-";
    } else if (i === 14) {
      out += "4";
    } else if (i === 19) {
      out += hex[8 + Math.floor(rng() * 4)];
    } else {
      out += hex[Math.floor(rng() * 16)];
    }
  }
  return out;
}

function readPath(root: unknown, path: string[]): unknown {
  let cur: unknown = root;
  for (const seg of path) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

function resolveRef(ref: string, contract: AirlockConfig): Record<string, unknown> | undefined {
  // We only handle the in-contract ref form: "#/schemas/Foo".
  if (!ref.startsWith("#/schemas/")) return undefined;
  const key = ref.slice("#/schemas/".length);
  const schemas = (contract.schemas ?? {}) as Record<string, Record<string, unknown>>;
  return schemas[key];
}

/**
 * Stable JSON stringify — sorts object keys so that {a:1,b:2} and {b:2,a:1}
 * produce the same seed. We don't want the order in which a consumer happens to
 * serialise their request to change the synthesised response.
 */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const keys = Object.keys(value as Record<string, unknown>).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`).join(",")}}`;
}

/**
 * FNV-1a 32-bit. Tiny, dependency-free, good enough for seeding a PRNG.
 */
function fnv1a(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Mulberry32 — small, fast, deterministic seeded PRNG.
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
