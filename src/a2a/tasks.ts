/**
 * In-memory task store for the A2A adapter.
 *
 * Single-process, non-durable, no eviction. Fits the existing sandbox
 * philosophy (dev-time tooling, single-tenant). Restart-resilience and
 * multi-process scenarios are out of scope.
 */

import { randomUUID } from "node:crypto";
import type { Verdict } from "../pipeline/index.js";

/**
 * A2A v1.0 TaskState enum. Reference: §4.1.3 of the spec.
 */
export type TaskState =
  | "TASK_STATE_SUBMITTED"
  | "TASK_STATE_WORKING"
  | "TASK_STATE_COMPLETED"
  | "TASK_STATE_FAILED"
  | "TASK_STATE_CANCELED"
  | "TASK_STATE_INPUT_REQUIRED"
  | "TASK_STATE_REJECTED"
  | "TASK_STATE_AUTH_REQUIRED";

export type Task = {
  id: string;
  contextId?: string;
  state: TaskState;
  /** The Airlock Config Verdict + synthesised body live in the artifact body. */
  artifact: {
    verdict: Verdict;
    detail_source: "example" | "synthesized" | "none";
  };
  createdAt: string;
  updatedAt: string;
};

export class TaskStore {
  private store = new Map<string, Task>();

  create(input: {
    state: TaskState;
    artifact: Task["artifact"];
    taskId?: string;
    contextId?: string;
  }): Task {
    const now = new Date().toISOString();
    const task: Task = {
      id: input.taskId ?? randomUUID(),
      ...(input.contextId ? { contextId: input.contextId } : {}),
      state: input.state,
      artifact: input.artifact,
      createdAt: now,
      updatedAt: now,
    };
    this.store.set(task.id, task);
    return task;
  }

  get(taskId: string): Task | undefined {
    return this.store.get(taskId);
  }

  cancel(taskId: string): Task | undefined {
    const task = this.store.get(taskId);
    if (!task) return undefined;
    if (
      task.state === "TASK_STATE_COMPLETED" ||
      task.state === "TASK_STATE_FAILED" ||
      task.state === "TASK_STATE_REJECTED" ||
      task.state === "TASK_STATE_CANCELED"
    ) {
      // Terminal — cancel is a no-op for completed tasks.
      return task;
    }
    const updated: Task = {
      ...task,
      state: "TASK_STATE_CANCELED",
      updatedAt: new Date().toISOString(),
    };
    this.store.set(task.id, updated);
    return updated;
  }

  /** For tests. */
  size(): number {
    return this.store.size;
  }

  /** For tests. */
  clear(): void {
    this.store.clear();
  }
}
