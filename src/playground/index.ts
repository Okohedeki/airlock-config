/**
 * Browser-side playground entry point.
 *
 * Reads the contract from `globalThis.__AIRLOCK_CONFIG_CONTRACT__` (inlined by
 * the renderer) and exposes `window.airlockConfig.evaluate(skillId, input, mode)`.
 *
 * Pure client-side evaluation — no fetch, no localhost, no hosted runtime.
 * Same expression engine + pipeline as the Node sandbox, just bundled for
 * the browser via esbuild.
 */

import {
  evaluateRequest,
  prepareContract,
  synthesizeDetailEnvelope,
  type Verdict,
} from "../pipeline/index.js";
import type { AirlockConfig } from "../validate/types.js";

type Mode = "skills" | "preflight";

type AirlockConfigResult = {
  verdict: Verdict;
  /** "example" | "synthesized" | "none" — same as the sandbox's X-Airlock-Config-Detail-Source header. */
  detailSource: "example" | "synthesized" | "none";
};

type AirlockConfigGlobal = {
  __AIRLOCK_CONFIG_CONTRACT__?: AirlockConfig;
  airlockConfig?: {
    contract: AirlockConfig;
    evaluate: (skillId: string, input: unknown, mode?: Mode) => AirlockConfigResult;
  };
};

const g = globalThis as typeof globalThis & AirlockConfigGlobal;
const contract = g.__AIRLOCK_CONFIG_CONTRACT__;

if (!contract) {
  // eslint-disable-next-line no-console
  console.error(
    "[airlock-config playground] no __AIRLOCK_CONFIG_CONTRACT__ found on globalThis — was the contract inlined?",
  );
} else {
  const prepared = prepareContract(contract);

  g.airlockConfig = {
    contract,
    evaluate(skillId: string, input: unknown, mode: Mode = "skills"): AirlockConfigResult {
      const verdict = evaluateRequest(prepared, { skill: skillId, input });
      if (mode === "preflight") {
        return { verdict, detailSource: "none" };
      }
      const env = synthesizeDetailEnvelope(contract, skillId, verdict, input);
      const withDetail: Verdict =
        env.source === "none" ? verdict : { ...verdict, detail: env.value };
      return { verdict: withDetail, detailSource: env.source };
    },
  };
}
