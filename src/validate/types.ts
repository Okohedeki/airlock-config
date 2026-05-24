/**
 * TypeScript types for an Airlock Config contract. These mirror schema/airlock-config.schema.json.
 * The JSON Schema is the source of truth; these types are a convenience for in-code work.
 */

export type AirlockConfig = {
  airlock_config: string;
  agent: Agent;
  category: Category;
  a2a?: A2AInfo;
  region?: Region;
  compliance?: ComplianceEntry[];
  auth_model?: AuthModel;
  pricing?: Pricing;
  permissions?: Permissions;
  guardrails?: Guardrails;
  tags?: string[];
  schemas?: Record<string, unknown>;
  skills: Skill[];
  authority?: AuthorityRule[];
  instant_failures?: InstantFailure[];
  actions?: Actions;
  sla?: Record<string, SLA>;
  lifecycle?: Lifecycle;
  deprecation?: Deprecation;
};

/**
 * Optional A2A (Agent2Agent) bridge hints. Informational per ADR 0004/0007:
 * derived Agent Card fields fall back to these when present, otherwise to
 * sensible defaults computed from existing Airlock Config fields.
 */
export type A2AInfo = {
  endpoint_url?: string;
  documentation_url?: string;
  capabilities?: {
    streaming?: boolean;
    push_notifications?: boolean;
    state_transition_history?: boolean;
  };
  default_input_modes?: string[];
  default_output_modes?: string[];
};

export type Agent = {
  name: string;
  version: string;
  description?: string;
  channels?: Channel[];
  homepage?: string;
  contact?: { name?: string; url?: string; email?: string };
};

export type Channel = "http" | "a2a" | "email" | "edi";

export type Category = {
  industry: Industry;
  capability: Capability;
  subcategory?: string;
};

export type Region = {
  data_residency?: RegionCode[];
  serves_regions?: RegionCode[];
};

export type ComplianceEntry = {
  standard: ComplianceStandard;
  status: "certified" | "self_attested" | "in_progress";
  attestation_url?: string;
  verified_at?: string;
};

export type AuthModel = {
  methods: AuthMethod[];
  enrollment: "open" | "approval_required" | "invite_only" | "enterprise_only";
  support_url?: string;
};

export type Pricing = {
  model: "free" | "metered" | "subscription" | "enterprise" | "usage_tiered";
  unit?: PricingUnit;
  currency?: string;
  price_url?: string;
  free_tier?: { description?: string; limits?: string };
};

export type Permissions = {
  pii?: "none" | "minimal" | "moderate" | "extensive";
  data_classes?: DataClass[];
  retention?: string;
  third_party_sharing?: "none" | "subprocessors_only" | "broad";
};

export type Guardrails = {
  refused_topics?: string[];
  refused_actions?: string[];
  required_authentication?: boolean;
};

export type Skill = {
  id: string;
  description?: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  examples?: Example[];
};

export type Example = {
  name?: string;
  description?: string;
  in: unknown;
  out?: unknown;
  expected_verdict?: ExpectedVerdict;
};

export type ExpectedVerdict = {
  code: StatusCode;
  binding?: Binding;
  ref?: string;
};

export type AuthorityRule = {
  id: string;
  summary?: string;
  keywords?: string[];
  description?: string;
  skill: string;
  field?: string;
  binding_class: BindingClass;
  when: string;
  then: RuleOutcome;
  else?: RuleOutcome;
};

export type RuleOutcome = {
  code: StatusCode;
  action?: ActionCode;
  escalate?: "human" | "fallback_agent";
  message?: string;
};

export type InstantFailure = {
  id: string;
  summary?: string;
  keywords?: string[];
  description?: string;
  skill?: string;
  when: string;
  code: InstantFailureCode;
  message?: string;
};

export type Actions = {
  exposes?: ActionCode[];
};

export type SLA = {
  respond_within?: string;
  on_breach?: ActionCode | StatusCode;
};

export type Lifecycle = {
  states?: LifecycleCode[];
};

export type Deprecation = {
  replaced_by_url: string;
  sunset: string;
  reason?: string;
};

export type BindingClass = "deterministic" | "judgment";
export type Binding = "PROMISE" | "ESTIMATE";

/**
 * Curated v0.5 vocabularies (unchanged from v0.4). Adding values requires an ADR.
 * Mirror of docs/taxonomies.md.
 */

export type Industry =
  | "logistics"
  | "procurement"
  | "fintech"
  | "healthcare"
  | "retail"
  | "manufacturing"
  | "legal"
  | "hr"
  | "customer_support"
  | "dev_tools"
  | "data_analytics"
  | "marketing"
  | "real_estate"
  | "education"
  | "energy"
  | "government"
  | "media"
  | "other";

export type Capability =
  | "transaction_processing"
  | "lookup"
  | "scheduling"
  | "notification"
  | "data_extraction"
  | "data_enrichment"
  | "decision_support"
  | "negotiation"
  | "workflow_orchestration"
  | "content_generation"
  | "monitoring"
  | "translation"
  | "summarization"
  | "other";

export type RegionCode =
  | "us-east"
  | "us-west"
  | "us-central"
  | "ca"
  | "eu-west"
  | "eu-central"
  | "uk"
  | "apac-east"
  | "apac-southeast"
  | "apac-south"
  | "anz"
  | "latam"
  | "mea"
  | "global";

export type ComplianceStandard =
  | "SOC2_TYPE_1"
  | "SOC2_TYPE_2"
  | "ISO_27001"
  | "ISO_27701"
  | "HIPAA"
  | "HITRUST"
  | "GDPR"
  | "CCPA"
  | "PCI_DSS"
  | "FedRAMP_MODERATE"
  | "FedRAMP_HIGH"
  | "EU_AI_ACT";

export type AuthMethod =
  | "none"
  | "api_key"
  | "oauth2_client_credentials"
  | "oauth2_auth_code"
  | "mtls"
  | "signed_jwt"
  | "webauthn";

export type PricingUnit =
  | "per_call"
  | "per_skill_invocation"
  | "per_token"
  | "per_month"
  | "per_seat_per_month"
  | "per_year";

export type DataClass =
  | "pii"
  | "phi"
  | "payment_card"
  | "financial"
  | "health"
  | "government_id"
  | "biometric"
  | "location"
  | "behavioral"
  | "credentials"
  | "business_confidential"
  | "public";

/**
 * Phase 1–4 status codes (pre-flight). Phases 5–6 are real-response only.
 */
export type StatusCode =
  // Phase 1 — Identification (PROMISE)
  | "OUT_OF_SCOPE"
  | "WRONG_AGENT"
  | "UNAUTHENTICATED"
  | "UNAUTHORIZED"
  // Phase 2 — Input validation (PROMISE)
  | "SCHEMA_INVALID"
  | "MISSING_INPUT"
  | "MALFORMED_INPUT"
  // Phase 3 — Deterministic rules (PROMISE)
  | "ACCEPTED_BY_RULE"
  | "REFUSED_BY_POLICY"
  | "RATE_LIMITED"
  // Phase 4 — Soft outcomes (ESTIMATE)
  | "ACCEPTED_LIKELY"
  | "COUNTER_OFFER_LIKELY"
  | "HUMAN_REVIEW_LIKELY"
  | "DEPENDS_ON_STATE"
  // Phase 5 — Lifecycle (real responses)
  | LifecycleCode;

export type LifecycleCode =
  | "SUBMITTED"
  | "WORKING"
  | "INPUT_REQUIRED"
  | "COMPLETED"
  | "FAILED"
  | "CANCELED"
  | "ESCALATED";

export type InstantFailureCode =
  | "OUT_OF_SCOPE"
  | "WRONG_AGENT"
  | "UNAUTHENTICATED"
  | "UNAUTHORIZED"
  | "SCHEMA_INVALID"
  | "MISSING_INPUT"
  | "MALFORMED_INPUT";

export type ActionCode =
  | "UNILATERAL_COMMIT"
  | "COUNTER_OFFER"
  | "PARTIAL_FULFILLMENT"
  | "ESCALATED_TO_HUMAN";

/**
 * Code phase classification — drives the semantic lint pass.
 */
export const PROMISE_CODES: ReadonlySet<StatusCode> = new Set<StatusCode>([
  "OUT_OF_SCOPE",
  "WRONG_AGENT",
  "UNAUTHENTICATED",
  "UNAUTHORIZED",
  "SCHEMA_INVALID",
  "MISSING_INPUT",
  "MALFORMED_INPUT",
  "ACCEPTED_BY_RULE",
  "REFUSED_BY_POLICY",
  "RATE_LIMITED",
]);

export const ESTIMATE_CODES: ReadonlySet<StatusCode> = new Set<StatusCode>([
  "ACCEPTED_LIKELY",
  "COUNTER_OFFER_LIKELY",
  "HUMAN_REVIEW_LIKELY",
  "DEPENDS_ON_STATE",
]);

export const ACTION_CODES: ReadonlySet<ActionCode> = new Set<ActionCode>([
  "UNILATERAL_COMMIT",
  "COUNTER_OFFER",
  "PARTIAL_FULFILLMENT",
  "ESCALATED_TO_HUMAN",
]);

/**
 * Recommended (not closed) vocabulary for guardrails. The lint warns on values
 * outside this set but does not reject them — the publisher may need a refusal
 * term we haven't anticipated. Mirror of docs/taxonomies.md.
 */
export const RECOMMENDED_REFUSED_TOPICS: ReadonlySet<string> = new Set([
  "financial_advice",
  "medical_diagnosis",
  "legal_counsel",
  "investment_recommendation",
  "political_endorsement",
  "self_harm",
  "violent_content",
  "regulated_substances",
]);

export const RECOMMENDED_REFUSED_ACTIONS: ReadonlySet<string> = new Set([
  "transfer_funds_to_new_payee",
  "share_credentials",
  "share_pii_outside_jurisdiction",
  "delete_production_data",
  "execute_unauthorized_code",
  "auto_publish_to_external_channel",
  "auto_sign_legal_document",
]);
