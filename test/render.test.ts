import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { buildFromFile } from "../src/render/index.js";

const HARNESS = resolve(__dirname, "..", "examples", "agent-harness.airlock.yaml");

describe("buildFromFile", () => {
  it("produces the expected static bundle layout", () => {
    const out = mkdtempSync(join(tmpdir(), "airlock-build-"));
    try {
      const result = buildFromFile(HARNESS, { outDir: out });
      expect(result.files).toEqual(
        expect.arrayContaining([
          ".well-known/airlock.yaml",
          ".well-known/airlock/index.html",
          ".well-known/airlock/llms.txt",
          "index.html",
          ".nojekyll",
        ]),
      );

      const machineSpec = readFileSync(join(out, ".well-known/airlock.yaml"), "utf-8");
      expect(machineSpec).toContain("airlock-codegen-agent");

      const html = readFileSync(join(out, ".well-known/airlock/index.html"), "utf-8");
      expect(html).toContain("<!doctype html>");
      expect(html).toContain("airlock-codegen-agent");
      expect(html).toContain("analyze_code");
      expect(html).toContain("ACCEPTED_BY_RULE");
      // The try-it form must be present, configured for in-browser eval by default
      expect(html).toContain("try-it");
      expect(html).toContain("/skills/analyze_code");
      // Inlined contract + playground bundle so the page is self-contained
      expect(html).toContain("__AIRLOCK_CONTRACT__");
      expect(html).toContain("window.airlock");
      // v0.3 harness sections must appear in the rendered HTML
      expect(html.toLowerCase()).toContain("tools");
      expect(html).toContain("bash");
      expect(html.toLowerCase()).toContain("permissions");
      expect(html.toLowerCase()).toContain("guardrails");

      const llms = readFileSync(join(out, ".well-known/airlock/llms.txt"), "utf-8");
      expect(llms).toContain("# airlock-codegen-agent");
      expect(llms).toContain("### analyze_code");
      expect(llms).toContain("PROMISE");
      // ESTIMATE appears via the run_command judgment rule
      expect(llms).toContain("ESTIMATE");
      // v0.3 sections also appear in llms.txt
      expect(llms.toLowerCase()).toContain("tools");
      expect(llms.toLowerCase()).toContain("permissions");

      const landing = readFileSync(join(out, "index.html"), "utf-8");
      expect(landing).toContain(".well-known/airlock");
      expect(landing).toContain("analyze_code");
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });

  it("throws if the contract is invalid", () => {
    const out = mkdtempSync(join(tmpdir(), "airlock-build-"));
    try {
      const broken = join(out, "broken.airlock.yaml");
      const fs = require("node:fs");
      fs.writeFileSync(broken, "airlock: \"0.3\"\nagent:\n  name: x\n");
      expect(() => buildFromFile(broken, { outDir: out })).toThrow(/Cannot build/);
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });
});
