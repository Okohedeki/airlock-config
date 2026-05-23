/**
 * Browser-side playground entry point.
 *
 * Reads the contract from `globalThis.__AIRLOCK_CONTRACT__` (inlined by the
 * renderer) and exposes `window.airlock.evaluate(skillId, input, mode)`.
 *
 * Pure client-side evaluation — no fetch, no localhost, no hosted runtime.
 * Same expression engine + pipeline as the Node sandbox, just bundled for
 * the browser via esbuild.
 */

import {
  evaluateRequest,
  prepareContract,
  synthesizeDetail,
  type Verdict,
} from "../pipeline/index.js";
import type { AirlockContract } from "../validate/types.js";

type Mode = "skills" | "preflight";

type AirlockGlobal = {
  __AIRLOCK_CONTRACT__?: AirlockContract;
  airlock?: {
    contract: AirlockContract;
    evaluate: (skillId: string, input: unknown, mode?: Mode) => Verdict;
  };
};

const g = globalThis as typeof globalThis & AirlockGlobal;
const contract = g.__AIRLOCK_CONTRACT__;

if (!contract) {
  // eslint-disable-next-line no-console
  console.error(
    "[airlock playground] no __AIRLOCK_CONTRACT__ found on globalThis — was the contract inlined?",
  );
} else {
  const prepared = prepareContract(contract);

  g.airlock = {
    contract,
    evaluate(skillId: string, input: unknown, mode: Mode = "skills"): Verdict {
      const verdict = evaluateRequest(prepared, { skill: skillId, input });
      if (mode === "preflight") return verdict;
      const detail = synthesizeDetail(contract, skillId, verdict);
      return detail === undefined ? verdict : { ...verdict, detail };
    },
  };
}
