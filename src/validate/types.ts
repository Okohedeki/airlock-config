/**
 * TypeScript types for an Airlock contract. These mirror schema/airlock.schema.json.
 * The JSON Schema is the source of truth; these types are a convenience for in-code work.
 */

export type AirlockContract = {
  airlock: string;
  agent: Agent;
  schemas?: Record<string, unknown>;
  skills: Skill[];
  tools?: Tool[];
  hooks?: Hook[];
  mcp_servers?: MCPServer[];
  permissions?: Permissions;
  guardrails?: Guardrails;
  secrets?: SecretDecl[];
  delegates_to?: string[];
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
  harness?: Harness;
};

export type Harness = {
  framework?: string;
  model?: string;
  runtime?: string;
  limits?: {
    max_tokens?: number;
    max_turns?: number;
    max_tool_calls_per_turn?: number;
    timeout?: string;
  };
};

export type Channel = "http" | "a2a" | "email" | "edi";

export type Skill = {
  id: string;
  description?: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  examples?: Example[];
};

export type Tool = {
  id: string;
  description?: string;
  input_schema: Record<string, unknown>;
  output_schema?: Record<string, unknown>;
  side_effects?: ToolSideEffect[];
  source?: {
    kind: "mcp" | "builtin" | "plugin";
    server?: string;
  };
  limits?: {
    timeout?: string;
    max_calls_per_skill?: number;
  };
};

export type ToolSideEffect =
  | "fs.read"
  | "fs.write"
  | "network"
  | "shell"
  | "process"
  | "compute-only";

export type Hook = {
  event: HookEvent;
  mode: HookMode;
  description?: string;
  skill?: string;
  tool?: string;
};

export type HookEvent =
  | "before_skill"
  | "after_skill"
  | "pre_tool_use"
  | "post_tool_use"
  | "on_error"
  | "on_stop";

export type HookMode = "observe" | "mutate" | "block";

export type MCPServer = {
  name: string;
  endpoint?: string;
  auth_posture?: "none" | "oauth" | "api-key" | "mtls" | "shared-secret";
  allowed_tools?: string[];
};

export type Permissions = {
  allowed?: PermissionEntry[];
  disallowed?: PermissionEntry[];
};

export type PermissionEntry = PermissionObject | string;

export type PermissionObject = {
  resource: PermissionResource;
  op: string;
  scope?: string;
  reason?: string;
};

export type PermissionResource =
  | "fs"
  | "network"
  | "tool"
  | "mcp"
  | "env"
  | "secret";

export const PERMISSION_RESOURCES: ReadonlySet<PermissionResource> = new Set<
  PermissionResource
>(["fs", "network", "tool", "mcp", "env", "secret"]);

export type Guardrails = {
  refused_topics?: string[];
  refused_actions?: string[];
  required_authentication?: boolean;
};

export type SecretDecl = {
  name: string;
  purpose?: string;
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

/**
 * Authority rules target exactly one of `skill` or `tool` (enforced by the JSON
 * Schema oneOf). The TypeScript surface keeps both optional for ergonomics; the
 * pipeline checks which is set.
 */
export type AuthorityRule = {
  id: string;
  description?: string;
  skill?: string;
  tool?: string;
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
