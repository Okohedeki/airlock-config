/**
 * Sandbox-only step: synthesize a plausible response body. Two layers:
 *
 *   1. Example replay (preserves v0.1 behaviour): pick the first authored
 *      example for the matched skill whose expected_verdict.code matches the
 *      computed verdict.
 *
 *   2. Schema-derived faker (new in v0.3, per ADR 0005): when no example
 *      matches, walk the skill's output JSON Schema and synthesise a
 *      deterministic, valid payload that echoes same-named input fields.
 *
 * The returned envelope distinguishes the two so the sandbox/playground can
 * label responses for the consumer.
 */

import type { AirlockContract, Example } from "../validate/types.js";
import type { Verdict } from "./verdict.js";
import { findSkill, findTool } from "./inputValidator.js";
import { fakeFromSchema } from "./faker.js";

export type SynthesizedDetail = {
  value: unknown;
  source: "example" | "synthesized" | "none";
  exampleName?: string;
};

/**
 * Backwards-compatible thin wrapper that returns the raw value or undefined.
 * Prefer synthesizeDetailEnvelope() in new code so the source label is preserved.
 */
export function synthesizeDetail(
  contract: AirlockContract,
  skillId: string,
  verdict: Verdict,
  input?: unknown,
): unknown {
  const env = synthesizeDetailEnvelope(contract, skillId, verdict, input);
  return env.source === "none" ? undefined : env.value;
}

export function synthesizeDetailEnvelope(
  contract: AirlockContract,
  skillId: string,
  verdict: Verdict,
  input?: unknown,
): SynthesizedDetail {
  const skill = findSkill(contract, skillId);
  if (!skill) return { value: undefined, source: "none" };

  // 1. Example replay
  const match = skill.examples?.find(
    (ex: Example) => ex.expected_verdict?.code === verdict.code,
  );
  if (match && match.out !== undefined) {
    return { value: match.out, source: "example", exampleName: match.name };
  }

  // 2. Schema-derived faker fallback — only for codes that imply a successful
  //    body. Refusal codes get no synthesised payload; their reason text is enough.
  if (!CODES_WITH_BODY.has(verdict.code)) {
    return { value: undefined, source: "none" };
  }
  if (!skill.output || Object.keys(skill.output).length === 0) {
    return { value: undefined, source: "none" };
  }

  const value = fakeFromSchema({
    schema: skill.output as Record<string, unknown>,
    contract,
    input,
    subjectId: skillId,
  });
  return { value, source: "synthesized" };
}

/**
 * Synthesize a tool-invocation envelope. Used when the sandbox simulates a
 * tool call (POST /tools/:id). Mirrors synthesizeDetailEnvelope but reads the
 * tool's output_schema.
 */
export function synthesizeToolEnvelope(
  contract: AirlockContract,
  toolId: string,
  verdict: Verdict,
  input?: unknown,
): SynthesizedDetail {
  const tool = findTool(contract, toolId);
  if (!tool || !tool.output_schema) return { value: undefined, source: "none" };
  if (!CODES_WITH_BODY.has(verdict.code)) {
    return { value: undefined, source: "none" };
  }
  const value = fakeFromSchema({
    schema: tool.output_schema as Record<string, unknown>,
    contract,
    input,
    subjectId: toolId,
  });
  return { value, source: "synthesized" };
}

/**
 * Status codes that imply a successful response payload exists. Refusal /
 * validation codes return verdict-only — no synthesised body.
 */
const CODES_WITH_BODY = new Set<string>([
  "ACCEPTED_BY_RULE",
  "ACCEPTED_LIKELY",
  "COUNTER_OFFER_LIKELY",
  "HUMAN_REVIEW_LIKELY",
  "DEPENDS_ON_STATE",
  "SUBMITTED",
  "WORKING",
  "INPUT_REQUIRED",
  "COMPLETED",
]);
