/**
 * Sandbox-only step: synthesize a plausible response body from the contract's
 * examples. The sandbox isn't a real agent — its job is to mimic one well enough
 * for a consumer to develop against.
 *
 * Strategy:
 *   1. Pick the first example for the matched skill whose expected_verdict.code
 *      matches the computed verdict.code.
 *   2. Use that example's `out` payload as the response body.
 *   3. If no matching example exists, return a minimal payload derived from the
 *      verdict alone (just `{ code, binding, ... }`).
 */

import type { AirlockContract, Example } from "../validate/types.js";
import type { Verdict } from "./verdict.js";
import { findSkill } from "./inputValidator.js";

export function synthesizeDetail(
  contract: AirlockContract,
  skillId: string,
  verdict: Verdict,
): unknown {
  const skill = findSkill(contract, skillId);
  if (!skill?.examples) return undefined;

  const match = skill.examples.find(
    (ex: Example) => ex.expected_verdict?.code === verdict.code,
  );
  if (!match) return undefined;
  return match.out;
}
