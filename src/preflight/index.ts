/**
 * Pre-flight checker. The sandbox pipeline truncated — returns the Verdict
 * without producing a synthesized response or taking any side effect.
 *
 * Library form:
 *   const result = preflight(contract, { skill: "confirm_po", input: {...} });
 *
 * CLI:
 *   airlock-config preflight contract.yaml --skill confirm_po --input '{"...":"..."}'
 */

import type { AirlockConfig } from "../validate/types.js";
import {
  evaluateRequest,
  prepareContract,
  type EvaluateInput,
  type Verdict,
} from "../pipeline/index.js";

export function preflight(contract: AirlockConfig, req: EvaluateInput): Verdict {
  const prepared = prepareContract(contract);
  return evaluateRequest(prepared, req);
}

export type { Verdict, EvaluateInput };
