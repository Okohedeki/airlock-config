/**
 * Public library surface for Airlock Config.
 *
 * Exports the validator, sandbox, pre-flight, conformance runner, and renderer.
 */

export {
  validateContract,
  validateContractFile,
  type ValidationResult,
  type ValidationIssue,
  type AirlockConfig,
  type StructuralError,
  type LintFinding,
} from "./validate/index.js";

export type {
  Agent,
  Skill,
  AuthorityRule,
  InstantFailure,
  Actions,
  SLA,
  Lifecycle,
  Deprecation,
  Binding,
  BindingClass,
  StatusCode,
  ActionCode,
  LifecycleCode,
  Example,
  ExpectedVerdict,
  RuleOutcome,
  Channel,
} from "./validate/types.js";

export {
  startSandbox,
  startSandboxFromFile,
  type SandboxOptions,
  type RunningSandbox,
} from "./sandbox/index.js";

export { preflight } from "./preflight/index.js";

export {
  prepareContract,
  evaluateRequest,
  type Verdict,
  type EvaluateInput,
  type PreparedContract,
} from "./pipeline/index.js";

export {
  renderHTML,
  renderLLMs,
  renderLanding,
  buildStaticBundle,
  buildFromFile,
  type BuildOptions,
  type BuildResult,
} from "./render/index.js";

export {
  conform,
  formatReport,
  type ConformCase,
  type ConformReport,
} from "./conform/index.js";
