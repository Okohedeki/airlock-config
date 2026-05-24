/**
 * Query the registry — fetch the JSON index and filter client-side.
 *
 * v1 registry is a single registry.json in a public GitHub repo. No accounts,
 * no hosted search service. The CLI does the filtering locally so consumers
 * can compose filters however they want.
 */

import type {
  AuthMethod,
  Capability,
  ComplianceStandard,
  Industry,
  RegionCode,
} from "../validate/types.js";
import type { RegistryEntry } from "./entry.js";

export const DEFAULT_REGISTRY_URL =
  "https://raw.githubusercontent.com/Okohedeki/airlock-config-registry/main/registry.json";

export type SearchFilters = {
  /** Substring match against name + description (case-insensitive). */
  query?: string;
  industry?: Industry;
  capability?: Capability;
  /** Any of these regions in serves_regions OR data_residency. */
  region?: RegionCode;
  /** Must have at least one compliance entry whose standard matches. */
  compliance?: ComplianceStandard;
  /** Any of these auth methods is acceptable. */
  auth_method?: AuthMethod;
  /** Pricing model filter. */
  pricing_model?: "free" | "metered" | "subscription" | "enterprise" | "usage_tiered";
  /** Tag must appear in the entry's tags. */
  tag?: string;
  /** Rule keyword must appear in the entry's rule_keywords. */
  keyword?: string;
};

export type SearchOptions = {
  /** Registry URL — override for testing or alternate registries. */
  url?: string;
  /** Provide entries directly instead of fetching (used in tests). */
  entries?: RegistryEntry[];
};

export async function searchRegistry(
  filters: SearchFilters,
  opts: SearchOptions = {},
): Promise<RegistryEntry[]> {
  const entries = opts.entries ?? (await fetchRegistry(opts.url ?? DEFAULT_REGISTRY_URL));
  return entries.filter((e) => matches(e, filters));
}

export async function fetchRegistry(url: string): Promise<RegistryEntry[]> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`registry fetch failed: ${res.status} ${res.statusText} (${url})`);
  }
  const body = await res.json() as RegistryEntry[] | { entries: RegistryEntry[] };
  if (Array.isArray(body)) return body;
  if (body && Array.isArray((body as { entries?: unknown }).entries)) {
    return (body as { entries: RegistryEntry[] }).entries;
  }
  throw new Error(`registry at ${url} did not return an array of entries`);
}

function matches(e: RegistryEntry, f: SearchFilters): boolean {
  if (f.query) {
    const q = f.query.toLowerCase();
    const hay = `${e.name} ${e.description ?? ""}`.toLowerCase();
    if (!hay.includes(q)) return false;
  }
  if (f.industry && e.category.industry !== f.industry) return false;
  if (f.capability && e.category.capability !== f.capability) return false;
  if (f.region) {
    const regions = [
      ...(e.region?.data_residency ?? []),
      ...(e.region?.serves_regions ?? []),
    ];
    if (!regions.includes(f.region)) return false;
  }
  if (f.compliance) {
    const standards = (e.compliance ?? []).map((c) => c.standard);
    if (!standards.includes(f.compliance)) return false;
  }
  if (f.auth_method) {
    const methods = e.auth_model?.methods ?? [];
    if (!methods.includes(f.auth_method)) return false;
  }
  if (f.pricing_model && e.pricing?.model !== f.pricing_model) return false;
  if (f.tag && !(e.tags ?? []).includes(f.tag)) return false;
  if (f.keyword && !(e.rule_keywords ?? []).includes(f.keyword)) return false;
  return true;
}
