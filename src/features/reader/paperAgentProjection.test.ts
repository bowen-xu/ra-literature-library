import { describe, expect, it } from "vitest";
import type { AgentEvent } from "@research-assistant/core/agent";
import { applyAgentEvents, createAgentConversationProjection } from "@research-assistant/core/agent";
import { projectPaperAgentTurns } from "./paperAgentProjection";

const conversationId = "a1111111-1111-4111-8111-111111111111";
const turnId = "b1111111-1111-4111-8111-111111111111";
const userItem = "c1111111-1111-4111-8111-111111111111";
const assistantItem = "d1111111-1111-4111-8111-111111111111";
const toolCallItem = "c2222222-2222-4222-8222-222222222222";
const toolResultItem = "d2222222-2222-4222-8222-222222222222";
const callId = "e2222222-2222-4222-8222-222222222222";
const model = { providerId: "deepseek", modelId: "deepseek-v4-pro", revision: null };

const event = (seq: number, payload: AgentEvent["payload"]): AgentEvent => ({
  schemaVersion: 1, conversationId, seq, timestampMs: seq, requestId: turnId, payload,
});

describe("paper agent projection", () => {
  it("exposes unconfirmed receipt identity only once the turn stops", () => {
    const events: AgentEvent[] = [
      event(1, { type: "turnStarted", turnId, contextSnapshotId: userItem, model }),
      event(2, { type: "itemAccepted", turnId, itemId: toolCallItem, kind: { type: "toolCall", callId, name: "read" }, text: "{}", phase: null, source: null }),
      event(3, { type: "toolReceiptPending", turnId, callId }),
      event(4, { type: "itemStarted", turnId, itemId: toolResultItem, kind: { type: "toolResult", callId } }),
      event(5, { type: "itemCompleted", turnId, itemId: toolResultItem }),
    ];
    const active = applyAgentEvents(createAgentConversationProjection(conversationId), events);
    expect(projectPaperAgentTurns(active)[0]?.unconfirmedReceipts).toBeUndefined();
    const stopped = applyAgentEvents(active, [event(6, { type: "turnFinished", turnId, outcome: "interrupted" })]);
    expect(projectPaperAgentTurns(stopped)[0]?.unconfirmedReceipts).toEqual([callId]);
  });
  it("keeps assistant phases on separate text items within one turn", () => {
    const commentaryItem = "d3333333-3333-4333-8333-333333333333";
    const finalItem = "d4444444-4444-4444-8444-444444444444";
    const events: AgentEvent[] = [
      event(1, { type: "turnStarted", turnId, contextSnapshotId: "e1111111-1111-4111-8111-111111111111", model }),
      event(2, { type: "itemStarted", turnId, itemId: commentaryItem, kind: { type: "assistantMessage" } }),
      event(3, { type: "textDelta", turnId, itemId: commentaryItem, text: "先说明进展" }),
      event(4, { type: "itemPhaseChanged", turnId, itemId: commentaryItem, phase: "commentary" }),
      event(5, { type: "itemCompleted", turnId, itemId: commentaryItem }),
      event(6, { type: "itemStarted", turnId, itemId: finalItem, kind: { type: "assistantMessage" } }),
      event(7, { type: "textDelta", turnId, itemId: finalItem, text: "最终结论" }),
      event(8, { type: "itemPhaseChanged", turnId, itemId: finalItem, phase: "finalAnswer" }),
      event(9, { type: "itemCompleted", turnId, itemId: finalItem }),
      event(10, { type: "turnFinished", turnId, outcome: "completed" }),
    ];
    const projection = applyAgentEvents(createAgentConversationProjection(conversationId), events);
    expect(projectPaperAgentTurns(projection)[0]?.messages).toEqual([
      { id: commentaryItem, role: "assistant", content: "先说明进展", phase: "commentary" },
      { id: finalItem, role: "assistant", content: "最终结论", phase: "finalAnswer" },
    ]);
  });

  it("keeps user/assistant text while hiding tool items", () => {
    const events: AgentEvent[] = [
      event(1, { type: "turnStarted", turnId, contextSnapshotId: "e1111111-1111-4111-8111-111111111111", model }),
      event(2, { type: "itemStarted", turnId, itemId: userItem, kind: { type: "userMessage" } }),
      event(3, { type: "textDelta", turnId, itemId: userItem, text: "What is new?" }),
      event(4, { type: "itemCompleted", turnId, itemId: userItem }),
      event(5, { type: "phaseChanged", turnId, phase: "runningModel" }),
      event(6, { type: "itemStarted", turnId, itemId: assistantItem, kind: { type: "assistantMessage" } }),
      event(7, { type: "textDelta", turnId, itemId: assistantItem, text: "The main contribution is…" }),
      event(8, { type: "itemCompleted", turnId, itemId: assistantItem }),
      event(9, { type: "modelRequestStarted", turnId, attemptId: "f1111111-1111-4111-8111-111111111111", model }),
      event(10, { type: "modelResponseStarted", turnId, attemptId: "f1111111-1111-4111-8111-111111111111", responseId: "response", model }),
      event(11, { type: "modelRequestFinished", turnId, attemptId: "f1111111-1111-4111-8111-111111111111", inputTokens: 1, outputTokens: 2 }),
      event(12, { type: "turnFinished", turnId, outcome: "completed" }),
    ];
    const projection = applyAgentEvents(createAgentConversationProjection(conversationId), events);
    expect(projectPaperAgentTurns(projection)).toEqual([expect.objectContaining({
      id: turnId,
      messages: [
        { id: userItem, role: "user", content: "What is new?" },
        { id: assistantItem, role: "assistant", content: "The main contribution is…" },
      ],
      outcome: "completed",
    })]);
  });

  it("projects a preparation failure as a failed model attempt", () => {
    const events: AgentEvent[] = [
      event(1, { type: "turnStarted", turnId, contextSnapshotId: "e1111111-1111-4111-8111-111111111111", model }),
      event(2, { type: "phaseChanged", turnId, phase: "runningModel" }),
      event(3, { type: "modelRequestStarted", turnId, attemptId: "f1111111-1111-4111-8111-111111111111", model }),
      event(4, { type: "modelRequestFailed", turnId, attemptId: "f1111111-1111-4111-8111-111111111111", error: "invalid model request", retryable: false, category: "provider" }),
      event(5, { type: "turnFinished", turnId, outcome: "failed" }),
    ];
    const projection = applyAgentEvents(createAgentConversationProjection(conversationId), events);
    expect(projectPaperAgentTurns(projection)).toEqual([expect.objectContaining({
      id: turnId, outcome: "failed", failureReason: "invalid model request",
    })]);
    expect(projection.turns.get(turnId)?.attempts.get("f1111111-1111-4111-8111-111111111111")?.failureCategory).toBe("provider");
  });

  it("groups contiguous tool calls and results into one expandable activity entry", () => {
    const events: AgentEvent[] = [
      event(1, { type: "turnStarted", turnId, contextSnapshotId: "e1111111-1111-4111-8111-111111111111", model }),
      event(2, { type: "itemStarted", turnId, itemId: toolCallItem, kind: { type: "toolCall", callId, name: "research_read_source" } }),
      event(3, { type: "textDelta", turnId, itemId: toolCallItem, text: '{"sourceId":"writing:one"}' }),
      event(4, { type: "itemCompleted", turnId, itemId: toolCallItem }),
      event(5, { type: "itemStarted", turnId, itemId: toolResultItem, kind: { type: "toolResult", callId, isError: false } }),
      event(6, { type: "textDelta", turnId, itemId: toolResultItem, text: '{"status":"ok"}' }),
      event(7, { type: "itemCompleted", turnId, itemId: toolResultItem }),
      event(8, { type: "turnFinished", turnId, outcome: "completed" }),
    ];
    const projection = applyAgentEvents(createAgentConversationProjection(conversationId), events);
    const view = projectPaperAgentTurns(projection)[0]!;
    expect(view.entries).toHaveLength(1);
    expect(view.entries[0]).toMatchObject({ kind: "activity", group: { items: [{ name: "research_read_source" }, { kind: "tool-result", content: '{"status":"ok"}' }] } });
  });

  it("does not surface a transient failed attempt after a retry completes the turn", () => {
    const events: AgentEvent[] = [
      event(1, { type: "turnStarted", turnId, contextSnapshotId: "e1111111-1111-4111-8111-111111111111", model }),
      event(2, { type: "phaseChanged", turnId, phase: "runningModel" }),
      event(3, { type: "modelRequestStarted", turnId, attemptId: "f1111111-1111-4111-8111-111111111111", model }),
      event(4, { type: "modelResponseStarted", turnId, attemptId: "f1111111-1111-4111-8111-111111111111", responseId: "response-1", model }),
      event(5, { type: "modelRequestFailed", turnId, attemptId: "f1111111-1111-4111-8111-111111111111", error: "temporary outage", retryable: true, category: "providerTemporaryUnavailable" }),
      event(6, { type: "modelRequestStarted", turnId, attemptId: "f2222222-2222-4222-8222-222222222222", model }),
      event(7, { type: "modelResponseStarted", turnId, attemptId: "f2222222-2222-4222-8222-222222222222", responseId: "response-2", model }),
      event(8, { type: "modelRequestFinished", turnId, attemptId: "f2222222-2222-4222-8222-222222222222", inputTokens: 1, outputTokens: 2 }),
      event(9, { type: "turnFinished", turnId, outcome: "completed" }),
    ];
    const projection = applyAgentEvents(createAgentConversationProjection(conversationId), events);
    expect(projectPaperAgentTurns(projection)[0]).not.toHaveProperty("failureReason");
  });
});
