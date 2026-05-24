/**
 * A2A wire-protocol adapter: hand-rolled JSON-RPC 2.0 dispatcher over our
 * existing pipeline. v0.4.1 MVP implements three methods (SendMessage, GetTask,
 * CancelTask) and rejects the others cleanly with JSON-RPC -32601.
 *
 * The adapter is pure transport: it does NOT define its own pipeline. It calls
 * `evaluateRequest()` and `synthesizeDetailEnvelope()` from src/pipeline,
 * wraps the resulting Verdict into an A2A Task, and stores it.
 *
 * Reference: A2A v1.0 §9.4 (Core Methods) and §4.1.3 (TaskState).
 */

import type { AirlockConfig } from "../validate/types.js";
import type { Verdict } from "../pipeline/index.js";
import type { Task, TaskState } from "./tasks.js";
import { TaskStore } from "./tasks.js";
import {
  evaluateRequest,
  prepareContract,
  synthesizeDetailEnvelope,
  type PreparedContract,
} from "../pipeline/index.js";

export type JsonRpcRequest = {
  jsonrpc: "2.0";
  id: string | number | null;
  method: string;
  params?: unknown;
};

export type JsonRpcResponse =
  | { jsonrpc: "2.0"; id: string | number | null; result: unknown }
  | { jsonrpc: "2.0"; id: string | number | null; error: JsonRpcError };

export type JsonRpcError = {
  code: number;
  message: string;
  data?: unknown;
};

export class A2AAdapter {
  private prepared: PreparedContract;
  private contract: AirlockConfig;
  private tasks = new TaskStore();

  constructor(contract: AirlockConfig) {
    this.contract = contract;
    this.prepared = prepareContract(contract);
  }

  /** For tests. */
  taskStore(): TaskStore {
    return this.tasks;
  }

  /**
   * Handle a single JSON-RPC envelope (already parsed). Returns the response
   * envelope. Throws only for fatal internal errors; protocol errors are
   * encoded as JSON-RPC error responses.
   */
  handle(req: unknown): JsonRpcResponse {
    if (!isValidEnvelope(req)) {
      return makeError(null, -32600, "invalid JSON-RPC envelope");
    }

    switch (req.method) {
      case "SendMessage":
        return this.sendMessage(req);
      case "GetTask":
        return this.getTask(req);
      case "CancelTask":
        return this.cancelTask(req);

      case "SendStreamingMessage":
      case "ListTasks":
      case "SubscribeToTask":
      case "CreateTaskPushNotificationConfig":
      case "GetTaskPushNotificationConfig":
      case "ListTaskPushNotificationConfigs":
      case "DeleteTaskPushNotificationConfig":
      case "GetExtendedAgentCard":
        return makeError(
          req.id,
          -32601,
          `method "${req.method}" deferred to v0.5; v0.4.1 MVP supports SendMessage, GetTask, CancelTask`,
        );

      default:
        return makeError(req.id, -32601, `method "${req.method}" is not defined by A2A v1.0`);
    }
  }

  private sendMessage(req: JsonRpcRequest): JsonRpcResponse {
    const params = req.params as
      | {
          message?: { parts?: Array<{ skill?: string; data?: unknown }> };
          taskId?: string;
          contextId?: string;
        }
      | undefined;

    const part = params?.message?.parts?.[0];
    const skill = part?.skill;
    const input = part?.data;

    if (typeof skill !== "string") {
      return makeError(
        req.id,
        -32602,
        "SendMessage requires params.message.parts[0].skill (string) — the skill id to invoke",
      );
    }

    const verdict = evaluateRequest(this.prepared, { skill, input });
    const envelope = synthesizeDetailEnvelope(this.contract, skill, verdict, input);
    const verdictWithDetail: Verdict =
      envelope.source === "none" ? verdict : { ...verdict, detail: envelope.value };

    const task = this.tasks.create({
      ...(params?.taskId ? { taskId: params.taskId } : {}),
      ...(params?.contextId ? { contextId: params.contextId } : {}),
      state: verdictToTaskState(verdict),
      artifact: {
        verdict: verdictWithDetail,
        detail_source: envelope.source,
      },
    });

    return { jsonrpc: "2.0", id: req.id, result: task };
  }

  private getTask(req: JsonRpcRequest): JsonRpcResponse {
    const params = req.params as { taskId?: string } | undefined;
    const taskId = params?.taskId;
    if (typeof taskId !== "string") {
      return makeError(req.id, -32602, "GetTask requires params.taskId (string)");
    }
    const task = this.tasks.get(taskId);
    if (!task) {
      return makeError(req.id, -32602, `task "${taskId}" not found`);
    }
    return { jsonrpc: "2.0", id: req.id, result: task };
  }

  private cancelTask(req: JsonRpcRequest): JsonRpcResponse {
    const params = req.params as { taskId?: string } | undefined;
    const taskId = params?.taskId;
    if (typeof taskId !== "string") {
      return makeError(req.id, -32602, "CancelTask requires params.taskId (string)");
    }
    const task = this.tasks.cancel(taskId);
    if (!task) {
      return makeError(req.id, -32602, `task "${taskId}" not found`);
    }
    return { jsonrpc: "2.0", id: req.id, result: task };
  }
}

function isValidEnvelope(req: unknown): req is JsonRpcRequest {
  if (typeof req !== "object" || req === null) return false;
  const r = req as Record<string, unknown>;
  if (r.jsonrpc !== "2.0") return false;
  if (typeof r.method !== "string") return false;
  // id is required for requests (not notifications); we allow null per the spec.
  if (!("id" in r)) return false;
  return true;
}

function makeError(
  id: string | number | null,
  code: number,
  message: string,
  data?: unknown,
): JsonRpcResponse {
  const error: JsonRpcError = { code, message };
  if (data !== undefined) error.data = data;
  return { jsonrpc: "2.0", id, error };
}

/**
 * Map an Airlock Config Verdict's code to an A2A v1.0 TaskState. Mirrors the
 * table in docs/a2a-bridge.md.
 */
export function verdictToTaskState(verdict: Verdict): TaskState {
  switch (verdict.code) {
    case "ACCEPTED_BY_RULE":
    case "ACCEPTED_LIKELY":
    case "COMPLETED":
    case "COUNTER_OFFER_LIKELY":
    case "HUMAN_REVIEW_LIKELY":
    case "DEPENDS_ON_STATE":
      return "TASK_STATE_COMPLETED";
    case "OUT_OF_SCOPE":
    case "REFUSED_BY_POLICY":
    case "WRONG_AGENT":
      return "TASK_STATE_REJECTED";
    case "UNAUTHENTICATED":
    case "UNAUTHORIZED":
      return "TASK_STATE_AUTH_REQUIRED";
    case "MISSING_INPUT":
    case "SCHEMA_INVALID":
    case "MALFORMED_INPUT":
    case "RATE_LIMITED":
    case "FAILED":
    case "ESCALATED":
      return "TASK_STATE_FAILED";
    case "INPUT_REQUIRED":
      return "TASK_STATE_INPUT_REQUIRED";
    case "SUBMITTED":
      return "TASK_STATE_SUBMITTED";
    case "WORKING":
      return "TASK_STATE_WORKING";
    case "CANCELED":
      return "TASK_STATE_CANCELED";
    default: {
      // Exhaustiveness check at compile-time.
      const _exhaustive: never = verdict.code;
      void _exhaustive;
      return "TASK_STATE_FAILED";
    }
  }
}

export type { Task, TaskState };
