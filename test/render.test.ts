import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { buildFromFile } from "../src/render/index.js";

const PROCUREMENT = resolve(__dirname, "..", "examples", "procurement.airlock.yaml");

describe("buildFromFile", () => {
  it("produces the expected static bundle layout", () => {
    const out = mkdtempSync(join(tmpdir(), "airlock-build-"));
    try {
      const result = buildFromFile(PROCUREMENT, { outDir: out });
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
      expect(machineSpec).toContain("acme-supplier-agent");

      const html = readFileSync(join(out, ".well-known/airlock/index.html"), "utf-8");
      expect(html).toContain("<!doctype html>");
      expect(html).toContain("acme-supplier-agent");
      expect(html).toContain("confirm_po");
      expect(html).toContain("ACCEPTED_BY_RULE");
      // The try-it form must be present so visitors can hit the local sandbox
      expect(html).toContain("try-it");
      expect(html).toContain("/skills/confirm_po");

      const llms = readFileSync(join(out, ".well-known/airlock/llms.txt"), "utf-8");
      expect(llms).toContain("# acme-supplier-agent");
      expect(llms).toContain("### confirm_po");
      expect(llms).toContain("PROMISE");
      expect(llms).toContain("ESTIMATE");

      const landing = readFileSync(join(out, "index.html"), "utf-8");
      expect(landing).toContain(".well-known/airlock");
      expect(landing).toContain("confirm_po");
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });

  it("throws if the contract is invalid", () => {
    const out = mkdtempSync(join(tmpdir(), "airlock-build-"));
    try {
      // The validator catches missing required fields — but to invoke buildFromFile
      // with an invalid contract, we'd need a separate file. Skip-style: write one.
      const broken = join(out, "broken.airlock.yaml");
      const fs = require("node:fs");
      fs.writeFileSync(broken, "airlock: \"0.1\"\nagent:\n  name: x\n");
      expect(() => buildFromFile(broken, { outDir: out })).toThrow(/Cannot build/);
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });
});
