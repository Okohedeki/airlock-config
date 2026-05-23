/**
 * Conformance runner. Answers: "is this contract a lie?"
 *
 * For every skill example whose `expected_verdict` declares a PROMISE code
 * (or whose expected_verdict is implied by an instant_failure / authority
 * rule that's deterministic), call the target endpoint and assert the real
 * response's `code` matches.
 *
 * Estimates are NOT conformance-tested — they're explicitly best-guess.
 *
 * Usage (library):
 *   const report = await conform(contract, "http://localhost:8080");
 *
 * Usage (CLI):
 *   airlock check contract.yaml --url http://localhost:8080
 *
 * A green report is the "honest right now" attestation. Signed/portable
 * attestations are deferred to v1.1.
 */

import type {
  AirlockContract,
  Example,
  Skill,
  StatusCode,
} from "../validate/types.js";
import { PROMISE_CODES } from "../validate/types.js";

export type ConformCase = {
  skill: string;
  example: string;
  expected: StatusCode;
  actual?: StatusCode;
  passed: boolean;
  note?: string;
};

export type ConformReport = {
  ok: boolean;
  url: string;
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  cases: ConformCase[];
};

export async function conform(
  contract: AirlockContract,
  baseUrl: string,
): Promise<ConformReport> {
  const cases: ConformCase[] = [];
  const url = baseUrl.replace(/\/$/, "");

  for (const skill of contract.skills) {
    for (const ex of skill.examples ?? []) {
      const c = await runCase(url, skill, ex);
      cases.push(c);
    }
  }

  const passed = cases.filter((c) => c.passed && c.note === undefined).length;
  const skipped = cases.filter((c) => c.note?.startsWith("skipped")).length;
  const failed = cases.filter((c) => !c.passed).length;
  return {
    ok: failed === 0,
    url,
    total: cases.length,
    passed,
    failed,
    skipped,
    cases,
  };
}

async function runCase(url: string, skill: Skill, example: Example): Promise<ConformCase> {
  const exampleName = example.name ?? "(unnamed)";
  const expected = example.expected_verdict?.code;

  if (!expected) {
    return {
      skill: skill.id,
      example: exampleName,
      expected: "ACCEPTED_LIKELY",
      passed: true,
      note: "skipped: no expected_verdict declared",
    };
  }

  // Only check PROMISE codes — ESTIMATE codes are explicitly best-guess and
  // not part of the publisher's binding commitment.
  if (!PROMISE_CODES.has(expected)) {
    return {
      skill: skill.id,
      example: exampleName,
      expected,
      passed: true,
      note: "skipped: expected_verdict is ESTIMATE",
    };
  }

  let actual: StatusCode | undefined;
  let note: string | undefined;
  try {
    const res = await fetch(`${url}/skills/${skill.id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(example.in),
    });
    const body = (await res.json()) as { code?: string };
    if (typeof body.code !== "string") {
      note = `response missing 'code' field`;
    } else {
      actual = body.code as StatusCode;
    }
  } catch (err) {
    note = `request failed: ${err instanceof Error ? err.message : String(err)}`;
  }

  const passed = actual === expected;
  return {
    skill: skill.id,
    example: exampleName,
    expected,
    ...(actual !== undefined ? { actual } : {}),
    passed,
    ...(note !== undefined ? { note } : {}),
  };
}

export function formatReport(report: ConformReport): string {
  const lines: string[] = [];
  lines.push(`Conformance check vs ${report.url}`);
  lines.push("");
  for (const c of report.cases) {
    if (c.note?.startsWith("skipped")) {
      lines.push(`  ~  ${c.skill}/${c.example}  (${c.note})`);
      continue;
    }
    if (c.passed) {
      lines.push(`  ✓  ${c.skill}/${c.example}  expected=${c.expected}`);
    } else {
      lines.push(`  ✗  ${c.skill}/${c.example}  expected=${c.expected} actual=${c.actual ?? "—"}${c.note ? `  (${c.note})` : ""}`);
    }
  }
  lines.push("");
  lines.push(
    `Total: ${report.total}   Passed: ${report.passed}   Failed: ${report.failed}   Skipped: ${report.skipped}`,
  );
  lines.push(report.ok ? "OK" : "FAIL");
  return lines.join("\n");
}
