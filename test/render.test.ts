import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { buildFromFile, buildSite } from "../src/render/index.js";

const SUPPLIER = resolve(__dirname, "..", "examples", "supplier-agent.airlock.yaml");
const EXAMPLES_DIR = resolve(__dirname, "..", "examples");

describe("buildFromFile (single contract bundle)", () => {
  it("produces the expected static bundle layout with v0.4 sections", () => {
    const out = mkdtempSync(join(tmpdir(), "airlock-build-"));
    try {
      const result = buildFromFile(SUPPLIER, { outDir: out });
      expect(result.files).toEqual(
        expect.arrayContaining([
          ".well-known/airlock.yaml",
          ".well-known/airlock/index.html",
          ".well-known/airlock/llms.txt",
          "index.html",
          ".nojekyll",
        ]),
      );

      const html = readFileSync(join(out, ".well-known/airlock/index.html"), "utf-8");
      expect(html).toContain("acme-supplier-agent");
      expect(html.toLowerCase()).toContain("category");
      expect(html).toContain("procurement");
      expect(html.toLowerCase()).toContain("compliance");
      expect(html).toContain("SOC2_TYPE_2");
      expect(html.toLowerCase()).toContain("pricing");
      expect(html.toLowerCase()).toContain("data access");
      // Rule summaries surface
      expect(html).toContain("Auto-accept delivery date adjustments");

      const llms = readFileSync(join(out, ".well-known/airlock/llms.txt"), "utf-8");
      expect(llms).toContain("# acme-supplier-agent");
      expect(llms).toContain("## Category (binding)");
      expect(llms).toContain("## Compliance (binding)");
      expect(llms).toContain("PROMISE");
      expect(llms).toContain("ESTIMATE");
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });
});

describe("buildSite (product home + every example)", () => {
  it("renders the home at root and each example under examples/<agent>/", () => {
    const out = mkdtempSync(join(tmpdir(), "airlock-site-"));
    try {
      const result = buildSite({ outDir: out, examplesDir: EXAMPLES_DIR });
      expect(result.files).toEqual(
        expect.arrayContaining([
          "index.html",
          ".nojekyll",
          "examples/acme-supplier-agent/.well-known/airlock.yaml",
          "examples/acme-supplier-agent/.well-known/airlock/index.html",
          "examples/acme-supplier-agent/.well-known/airlock/llms.txt",
          "examples/acme-supplier-agent/index.html",
          "examples/hello-agent/.well-known/airlock.yaml",
          "examples/hello-agent/index.html",
        ]),
      );

      const home = readFileSync(join(out, "index.html"), "utf-8");
      // Home page is the product page, not a per-contract page
      expect(home).toContain("Make your business agent discoverable");
      expect(home).toContain("Browse a sample contract");
      expect(home).not.toContain("__AIRLOCK_CONTRACT__"); // home has no inlined contract
      // Featured CTA points at the supplier-agent demo
      expect(home).toContain("examples/acme-supplier-agent");

      // Each contract still renders correctly under its sub-path
      const supplierHtml = readFileSync(
        join(out, "examples/acme-supplier-agent/.well-known/airlock/index.html"),
        "utf-8",
      );
      expect(supplierHtml).toContain("acme-supplier-agent");
      expect(supplierHtml).toContain("__AIRLOCK_CONTRACT__");
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });
});
