/**
 * Sandbox-only step: synthesize a plausible response body. Two layers:
 *
 *   1. Example replay: pick the first authored example for the matched skill
 *      whose expected_verdict.code matches the computed verdict.
 *
 *   2. Schema-derived faker (ADR 0005): when no example matches, walk the
 *      skill's output JSON Schema and synthesise a deterministic, valid
 *      payload that echoes same-named input fields.
 *
 * The returned envelope distinguishes the two so the sandbox/playground can
 * label responses for the consumer.
 */

import type { AirlockConfig, Example } from "../validate/types.js";
import type { Verdict } from "./verdict.js";
import { findSkill } from "./inputValidator.js";
import { fakeFromSchema } from "./faker.js";

export type SynthesizedDetail = {
  value: unknown;
  source: "example" | "synthesized" | "none";
  exampleName?: string;
};

/**
 * Backwards-compatible thin wrapper that returns the raw value or undefined.
 * Prefer synthesizeDetailEnvelope() so the source label is preserved.
 */
export function synthesizeDetail(
  contract: AirlockConfig,
  skillId: string,
  verdict: Verdict,
  input?: unknown,
): unknown {
  const env = synthesizeDetailEnvelope(contract, skillId, verdict, input);
  return env.source === "none" ? undefined : env.value;
}

export function synthesizeDetailEnvelope(
  contract: AirlockConfig,
  skillId: string,
  verdict: Verdict,
  input?: unknown,
): SynthesizedDetail {
  const skill = findSkill(contract, skillId);
  if (!skill) return { value: undefined, source: "none" };

  const match = skill.examples?.find(
    (ex: Example) => ex.expected_verdict?.code === verdict.code,
  );
  if (match && match.out !== undefined) {
    return { value: match.out, source: "example", exampleName: match.name };
  }

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
