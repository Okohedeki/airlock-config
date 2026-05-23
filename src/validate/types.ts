/**
 * TypeScript types for an Airlock contract. These mirror schema/airlock.schema.json.
 * The JSON Schema is the source of truth; these types are a convenience for in-code work.
 */

export type AirlockContract = {
  airlock: string;
  agent: Agent;
  schemas?: Record<string, unknown>;
  skills: Skill[];
  authority?: AuthorityRule[];
  instant_failures?: InstantFailure[];
  actions?: Actions;
  sla?: Record<string, SLA>;
  lifecycle?: Lifecycle;
  deprecation?: Deprecation;
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
 * Phase 1–4 status codes (pre-flight). Phases 5–6 are real-response only and
 * appear in different schema fields (lifecycle.states and actions.exposes).
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
