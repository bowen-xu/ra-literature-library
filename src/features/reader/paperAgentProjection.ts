import type {
  AgentConversationProjection,
  AgentItemProjection,
  AgentModelIdentity,
  AgentTurnOutcome,
} from "@research-assistant/core/agent";
import { agentTurnFailureCategory, agentTurnFailureReason, agentTurnReconnecting, agentTurnUnconfirmedReceipts } from "@research-assistant/core/agent";
import type { AgentFailureCategory } from "@research-assistant/core/agent";
import type { PaperAiReadingMessage } from "@research-assistant/core/ai";

export interface PaperAgentActivityItem {
  readonly id: string;
  readonly kind: "tool-call" | "tool-result";
  readonly name?: string;
  readonly content: string;
  readonly error?: boolean;
  readonly completed: boolean;
}

export interface PaperAgentActivityGroup {
  readonly id: string;
  readonly items: readonly PaperAgentActivityItem[];
}

export type PaperAgentTurnEntry =
  | { readonly kind: "message"; readonly message: PaperAiReadingMessage }
  | { readonly kind: "activity"; readonly group: PaperAgentActivityGroup };

export interface PaperAgentTurnView {
  readonly id: string;
  readonly contextSnapshotId: string;
  readonly providerId: string;
  readonly modelId: string;
  readonly reasoningEffort?: string;
  readonly outcome: AgentTurnOutcome | null;
  readonly reconnecting:boolean;
  readonly failureReason?: string;
  readonly failureCategory?: AgentFailureCategory;
  readonly unconfirmedReceipts?: readonly string[];
  readonly messages: readonly PaperAiReadingMessage[];
  readonly entries: readonly PaperAgentTurnEntry[];
}

/** Convert durable shared-agent projection data into the reader's presentation shape.
 * This deliberately drops tool items and never treats their arguments as chat text. */
export function projectPaperAgentTurns(
  projection: AgentConversationProjection,
): readonly PaperAgentTurnView[] {
  return projection.turnOrder.flatMap((turnId) => {
    const turn = projection.turns.get(turnId);
    if (turn === undefined) return [];
    const messages = turn.itemOrder.flatMap((itemId): PaperAiReadingMessage[] => {
      const item = turn.items.get(itemId);
      if (item === undefined || (item.kind.type !== "userMessage" && item.kind.type !== "assistantMessage")) return [];
      return [{ id: itemId, role: item.kind.type === "userMessage" ? "user" : "assistant", content: item.text,
        ...(item.kind.type === "assistantMessage" && item.phase !== undefined ? { phase: item.phase } : {}) }];
    });
    const entries: PaperAgentTurnEntry[] = [];
    for (let index = 0; index < turn.itemOrder.length; index += 1) {
      const itemId = turn.itemOrder[index];
      if (!itemId) continue;
      const item = turn.items.get(itemId);
      if (!item) continue;
      if (item.kind.type === "userMessage" || item.kind.type === "assistantMessage") {
        entries.push({ kind: "message", message: { id: itemId, role: item.kind.type === "userMessage" ? "user" : "assistant", content: item.text,
          ...(item.kind.type === "assistantMessage" && item.phase !== undefined ? { phase: item.phase } : {}) } });
        continue;
      }
      const items: PaperAgentActivityItem[] = [];
      while (index < turn.itemOrder.length) {
        const groupedId = turn.itemOrder[index];
        const grouped = groupedId ? turn.items.get(groupedId) : undefined;
        if (!grouped || (grouped.kind.type !== "toolCall" && grouped.kind.type !== "toolResult")) break;
        let call: AgentItemProjection | undefined;
        if (grouped.kind.type === "toolResult") {
          for (const candidate of turn.items.values()) {
            if (candidate.kind.type === "toolCall" && candidate.kind.callId === grouped.kind.callId) {
              call = candidate;
              break;
            }
          }
        }
        items.push({
          id: groupedId!,
          kind: grouped.kind.type === "toolCall" ? "tool-call" : "tool-result",
          ...(grouped.kind.type === "toolCall" ? { name: grouped.kind.name } : call?.kind.type === "toolCall" ? { name: call.kind.name } : {}),
          content: grouped.text,
          ...(grouped.kind.type === "toolResult" && grouped.kind.isError !== undefined ? { error: grouped.kind.isError } : {}),
          completed: grouped.completed,
        });
        index += 1;
      }
      index -= 1;
      if (items.length > 0) entries.push({ kind: "activity", group: { id: items[0]!.id, items } });
    }
    const base = {
      id: turnId,
      contextSnapshotId: turn.contextSnapshotId,
      ...modelView(turn.model),
      outcome: turn.outcome,
      reconnecting:agentTurnReconnecting(turn),
      ...(agentTurnUnconfirmedReceipts(turn).length ? { unconfirmedReceipts: agentTurnUnconfirmedReceipts(turn) } : {}),
      messages,
      entries,
    };
    const failureReason = agentTurnFailureReason(turn);
    const failureCategory = agentTurnFailureCategory(turn);
    return [failureReason === undefined ? base : { ...base, failureReason, ...(failureCategory === undefined ? {} : { failureCategory }) }];
  });
}

function modelView(model: AgentModelIdentity): Pick<PaperAgentTurnView, "providerId" | "modelId" | "reasoningEffort"> {
  return {
    providerId: model.providerId,
    modelId: model.modelId,
    ...(model.revision === null ? {} : { reasoningEffort: model.revision }),
  };
}
