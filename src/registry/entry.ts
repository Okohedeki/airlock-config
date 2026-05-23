/**
 * Build a registry index entry from a validated v0.4 contract.
 *
 * Pure function: takes a contract + the URL it's hosted at, returns the JSON
 * the publisher would PR into the registry repo. The registry never invents
 * categorisation — every indexable field is derived directly from the
 * contract's binding blocks, so the contract is the single source of truth.
 */

import type {
  AirlockContract,
  AuthMethod,
  AuthorityRule,
  Capability,
  ComplianceStandard,
  Industry,
  InstantFailure,
  RegionCode,
} from "../validate/types.js";

export type RegistryEntry = {
  /** Stable identifier — agent name. */
  name: string;
  /** Contract version (SemVer) — agent.version. */
  version: string;
  /** Airlock spec version (`0.4`...). */
  airlock_spec: string;
  /** URL the contract is served from. */
  contract_url: string;
  /** Free-text description (used for full-text relevance ranking). */
  description?: string;
  category: {
    industry: Industry;
    capability: Capability;
    subcategory?: string;
  };
  region?: {
    data_residency?: RegionCode[];
    serves_regions?: RegionCode[];
  };
  compliance?: Array<{
    standard: ComplianceStandard;
    status: "certified" | "self_attested" | "in_progress";
  }>;
  auth_model?: {
    methods: AuthMethod[];
    enrollment: "open" | "approval_required" | "invite_only" | "enterprise_only";
  };
  pricing?: {
    model: "free" | "metered" | "subscription" | "enterprise" | "usage_tiered";
    unit?: string;
  };
  tags?: string[];
  /** Skill ids exposed. Indexers may surface this for textual matching. */
  skills: string[];
  /**
   * Indexable text from rule + instant_failure annotations. Without this the
   * registry can only filter on metadata; with it, foreign agents can search
   * for the substance of rules ("agents that auto-accept POs under $X").
   */
  rule_keywords?: string[];
  rule_summaries?: string[];
  /** ISO 8601 timestamp the entry was generated. */
  indexed_at: string;
};

export type BuildEntryOptions = {
  /** Override the timestamp (useful in tests). */
  now?: () => Date;
};

export function buildRegistryEntry(
  contract: AirlockContract,
  contractUrl: string,
  opts: BuildEntryOptions = {},
): RegistryEntry {
  const now = (opts.now ?? (() => new Date()))();

  const ruleKeywords = collectKeywords(contract.authority ?? [], contract.instant_failures ?? []);
  const ruleSummaries = collectSummaries(contract.authority ?? [], contract.instant_failures ?? []);

  const entry: RegistryEntry = {
    name: contract.agent.name,
    version: contract.agent.version,
    airlock_spec: contract.airlock,
    contract_url: contractUrl,
    description: contract.agent.description,
    category: {
      industry: contract.category.industry,
      capability: contract.category.capability,
      ...(contract.category.subcategory ? { subcategory: contract.category.subcategory } : {}),
    },
    skills: contract.skills.map((s) => s.id),
    indexed_at: now.toISOString(),
  };

  if (contract.region) {
    entry.region = {
      ...(contract.region.data_residency ? { data_residency: contract.region.data_residency } : {}),
      ...(contract.region.serves_regions ? { serves_regions: contract.region.serves_regions } : {}),
    };
  }

  if (contract.compliance && contract.compliance.length > 0) {
    entry.compliance = contract.compliance.map((c) => ({
      standard: c.standard,
      status: c.status,
    }));
  }

  if (contract.auth_model) {
    entry.auth_model = {
      methods: contract.auth_model.methods,
      enrollment: contract.auth_model.enrollment,
    };
  }

  if (contract.pricing) {
    entry.pricing = {
      model: contract.pricing.model,
      ...(contract.pricing.unit ? { unit: contract.pricing.unit } : {}),
    };
  }

  if (contract.tags && contract.tags.length > 0) {
    entry.tags = [...contract.tags];
  }

  if (ruleKeywords.length > 0) entry.rule_keywords = ruleKeywords;
  if (ruleSummaries.length > 0) entry.rule_summaries = ruleSummaries;

  return entry;
}

function collectKeywords(rules: AuthorityRule[], failures: InstantFailure[]): string[] {
  const set = new Set<string>();
  for (const r of rules) for (const k of r.keywords ?? []) set.add(k);
  for (const f of failures) for (const k of f.keywords ?? []) set.add(k);
  return [...set];
}

function collectSummaries(rules: AuthorityRule[], failures: InstantFailure[]): string[] {
  const out: string[] = [];
  for (const r of rules) if (r.summary) out.push(r.summary);
  for (const f of failures) if (f.summary) out.push(f.summary);
  return out;
}
