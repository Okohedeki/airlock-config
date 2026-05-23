/**
 * The Verdict — what pre-flight returns; what the sandbox/real agent embeds
 * in every response. See docs/adr/0002-trustworthy-in-between-via-binding-codes.md.
 */

import type {
  ActionCode,
  Binding,
  StatusCode,
} from "../validate/types.js";

export type Verdict = {
  code: StatusCode;
  binding: Binding;
  reason: string;
  /** Pointer to the rule, instant_failure, or schema location that produced this verdict. */
  ref?: string;
  /** Action the agent commits to (or is likely to) take. */
  action?: ActionCode;
  /** Structured payload — synthesized response for sandbox; counter-offer terms; redirect URL; etc. */
  detail?: unknown;
};
