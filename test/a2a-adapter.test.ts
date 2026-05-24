import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { validateContractFile } from "../src/validate/index.js";
import { A2AAdapter, verdictToTaskState } from "../src/a2a/index.js";
import type { AirlockContract } from "../src/validate/types.js";

const SUPPLIER = resolve(__dirname, "..", "examples", "supplier-agent.airlock.yaml");

function loadSupplier(): AirlockContract {
  const result = validateContractFile(SUPPLIER);
  if (!result.ok || !result.contract) throw new Error("contract not valid");
  return result.contract;
}

describe("A2AAdapter — SendMessage", () => {
  it("returns TASK_STATE_COMPLETED for an accepted-by-rule skill call", () => {
    const adapter = new A2AAdapter(loadSupplier());
    const res = adapter.handle({
      jsonrpc: "2.0",
      id: 1,
      method: "SendMessage",
      params: {
        message: {
          parts: [
            {
              skill: "confirm_po",
              data: {
                reference: "PO-1234",
                entity: "known-supplier-1",
                amount: 100,
                delivery_date_change_days: -2,
              },
            },
          ],
        },
      },
    });
    expect("result" in res).toBe(true);
    if (!("result" in res)) return;
    const task = res.result as { state: string; artifact: { verdict: { code: string; binding: string } } };
    expect(task.state).toBe("TASK_STATE_COMPLETED");
    expect(task.artifact.verdict.code).toBe("ACCEPTED_BY_RULE");
    expect(task.artifact.verdict.binding).toBe("PROMISE");
  });

  it("returns TASK_STATE_REJECTED for OUT_OF_SCOPE", () => {
    const adapter = new A2AAdapter(loadSupplier());
    const res = adapter.handle({
      jsonrpc: "2.0",
      id: 2,
      method: "SendMessage",
      params: {
        message: {
          parts: [
            {
              skill: "confirm_po",
              data: { reference: "PO-9", entity: "random-vendor", amount: 10 },
            },
          ],
        },
      },
    });
    expect("result" in res).toBe(true);
    if (!("result" in res)) return;
    const task = res.result as { state: string; artifact: { verdict: { code: string; ref: string } } };
    expect(task.state).toBe("TASK_STATE_REJECTED");
    expect(task.artifact.verdict.code).toBe("OUT_OF_SCOPE");
    expect(task.artifact.verdict.ref).toBe("unknown-entity");
  });

  it("returns TASK_STATE_FAILED for MISSING_INPUT (schema violation)", () => {
    const adapter = new A2AAdapter(loadSupplier());
    const res = adapter.handle({
      jsonrpc: "2.0",
      id: 3,
      method: "SendMessage",
      params: {
        message: {
          parts: [{ skill: "confirm_po", data: { entity: "known-supplier-1", amount: 100 } }],
        },
      },
    });
    expect("result" in res).toBe(true);
    if (!("result" in res)) return;
    const task = res.result as { state: string; artifact: { verdict: { code: string } } };
    expect(task.state).toBe("TASK_STATE_FAILED");
    expect(task.artifact.verdict.code).toBe("MISSING_INPUT");
  });

  it("returns TASK_STATE_COMPLETED with the Verdict envelope in the artifact for an ESTIMATE verdict", () => {
    const adapter = new A2AAdapter(loadSupplier());
    const res = adapter.handle({
      jsonrpc: "2.0",
      id: 4,
      method: "SendMessage",
      params: {
        message: {
          parts: [
            {
              skill: "confirm_po",
              data: {
                reference: "PO-1234",
                entity: "known-supplier-1",
                amount: 100,
                delivery_date_change_days: 14,
              },
            },
          ],
        },
      },
    });
    expect("result" in res).toBe(true);
    if (!("result" in res)) return;
    const task = res.result as { state: string; artifact: { verdict: { code: string; binding: string } } };
    expect(task.state).toBe("TASK_STATE_COMPLETED");
    expect(task.artifact.verdict.code).toBe("HUMAN_REVIEW_LIKELY");
    expect(task.artifact.verdict.binding).toBe("ESTIMATE");
  });

  it("rejects malformed envelopes with -32600", () => {
    const adapter = new A2AAdapter(loadSupplier());
    const res = adapter.handle({ foo: "bar" });
    expect("error" in res).toBe(true);
    if (!("error" in res)) return;
    expect(res.error.code).toBe(-32600);
  });

  it("rejects SendMessage without a skill in message.parts[0]", () => {
    const adapter = new A2AAdapter(loadSupplier());
    const res = adapter.handle({
      jsonrpc: "2.0",
      id: 5,
      method: "SendMessage",
      params: { message: { parts: [{}] } },
    });
    expect("error" in res).toBe(true);
    if (!("error" in res)) return;
    expect(res.error.code).toBe(-32602);
  });
});

describe("A2AAdapter — GetTask / CancelTask", () => {
  it("stores tasks and lets GetTask retrieve them by id", () => {
    const adapter = new A2AAdapter(loadSupplier());
    const sent = adapter.handle({
      jsonrpc: "2.0",
      id: 1,
      method: "SendMessage",
      params: {
        message: {
          parts: [
            {
              skill: "confirm_po",
              data: { reference: "PO-1", entity: "known-supplier-1", amount: 1, delivery_date_change_days: -1 },
            },
          ],
        },
      },
    });
    expect("result" in sent).toBe(true);
    if (!("result" in sent)) return;
    const sentTask = sent.result as { id: string };

    const got = adapter.handle({
      jsonrpc: "2.0",
      id: 2,
      method: "GetTask",
      params: { taskId: sentTask.id },
    });
    expect("result" in got).toBe(true);
    if (!("result" in got)) return;
    expect((got.result as { id: string }).id).toBe(sentTask.id);
  });

  it("returns -32602 for GetTask on unknown id", () => {
    const adapter = new A2AAdapter(loadSupplier());
    const res = adapter.handle({
      jsonrpc: "2.0",
      id: 1,
      method: "GetTask",
      params: { taskId: "00000000-0000-0000-0000-000000000000" },
    });
    expect("error" in res).toBe(true);
    if (!("error" in res)) return;
    expect(res.error.code).toBe(-32602);
  });

  it("CancelTask on a completed task returns the task with terminal state preserved", () => {
    const adapter = new A2AAdapter(loadSupplier());
    const sent = adapter.handle({
      jsonrpc: "2.0",
      id: 1,
      method: "SendMessage",
      params: {
        message: {
          parts: [
            {
              skill: "confirm_po",
              data: { reference: "PO-1", entity: "known-supplier-1", amount: 1, delivery_date_change_days: -1 },
            },
          ],
        },
      },
    });
    if (!("result" in sent)) return;
    const sentTask = sent.result as { id: string; state: string };

    const cancelled = adapter.handle({
      jsonrpc: "2.0",
      id: 2,
      method: "CancelTask",
      params: { taskId: sentTask.id },
    });
    if (!("result" in cancelled)) return;
    const task = cancelled.result as { state: string };
    // Terminal state preserved per spec (no-op cancel)
    expect(task.state).toBe(sentTask.state);
  });
});

describe("A2AAdapter — deferred methods return clean MethodNotFound", () => {
  for (const method of [
    "SendStreamingMessage",
    "ListTasks",
    "SubscribeToTask",
    "CreateTaskPushNotificationConfig",
    "GetExtendedAgentCard",
  ]) {
    it(`${method} → -32601 with v0.5 pointer`, () => {
      const adapter = new A2AAdapter(loadSupplier());
      const res = adapter.handle({ jsonrpc: "2.0", id: 1, method, params: {} });
      expect("error" in res).toBe(true);
      if (!("error" in res)) return;
      expect(res.error.code).toBe(-32601);
      expect(res.error.message).toContain("deferred to v0.5");
    });
  }

  it("unknown methods → -32601 without the v0.5 pointer", () => {
    const adapter = new A2AAdapter(loadSupplier());
    const res = adapter.handle({ jsonrpc: "2.0", id: 1, method: "NopeNope", params: {} });
    if (!("error" in res)) return;
    expect(res.error.code).toBe(-32601);
    expect(res.error.message).toContain("not defined by A2A v1.0");
  });
});

describe("verdictToTaskState mapping", () => {
  // Spot check a handful of the trickier mappings.
  it("maps OUT_OF_SCOPE / REFUSED_BY_POLICY / WRONG_AGENT to TASK_STATE_REJECTED", () => {
    expect(verdictToTaskState({ code: "OUT_OF_SCOPE", binding: "PROMISE", reason: "" })).toBe("TASK_STATE_REJECTED");
    expect(verdictToTaskState({ code: "REFUSED_BY_POLICY", binding: "PROMISE", reason: "" })).toBe("TASK_STATE_REJECTED");
    expect(verdictToTaskState({ code: "WRONG_AGENT", binding: "PROMISE", reason: "" })).toBe("TASK_STATE_REJECTED");
  });

  it("maps UNAUTHENTICATED / UNAUTHORIZED to TASK_STATE_AUTH_REQUIRED", () => {
    expect(verdictToTaskState({ code: "UNAUTHENTICATED", binding: "PROMISE", reason: "" })).toBe("TASK_STATE_AUTH_REQUIRED");
    expect(verdictToTaskState({ code: "UNAUTHORIZED", binding: "PROMISE", reason: "" })).toBe("TASK_STATE_AUTH_REQUIRED");
  });

  it("maps ESTIMATE codes to TASK_STATE_COMPLETED (consumer reads the Verdict for nuance)", () => {
    expect(verdictToTaskState({ code: "ACCEPTED_LIKELY", binding: "ESTIMATE", reason: "" })).toBe("TASK_STATE_COMPLETED");
    expect(verdictToTaskState({ code: "HUMAN_REVIEW_LIKELY", binding: "ESTIMATE", reason: "" })).toBe("TASK_STATE_COMPLETED");
    expect(verdictToTaskState({ code: "DEPENDS_ON_STATE", binding: "ESTIMATE", reason: "" })).toBe("TASK_STATE_COMPLETED");
  });
});
