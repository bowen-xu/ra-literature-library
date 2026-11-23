import type { PaperAiReadingPrepareResult } from "@research-assistant/core/ai";
import type { AiAssistanceGateway } from "@research-assistant/workbench-sdk/ai-assistance";
import type { DoclingParserGateway } from "@research-assistant/workbench-sdk/docling";

export interface PaperGenerationPreparation {
  readonly aiGateway: Pick<AiAssistanceGateway, "preparePaperReadingContext">;
  readonly doclingGateway: Pick<DoclingParserGateway, "parseAttachment">;
  readonly paperId: string;
  readonly attachmentIds: readonly string[];
  readonly isCanceled?: () => boolean;
  readonly setPhase?: (phase: "preparing" | "parsing") => void;
}

/** Both stages check the saved document before admitting any Agent task. */
export async function preparePaperGenerationSources({
  aiGateway, doclingGateway, paperId, attachmentIds, isCanceled = () => false, setPhase,
}: PaperGenerationPreparation): Promise<PaperAiReadingPrepareResult | undefined> {
  if (!attachmentIds.length || attachmentIds.length > 8 || new Set(attachmentIds).size !== attachmentIds.length) throw new Error("请选择 1–8 个不同的来源文件。");
  setPhase?.("preparing");
  let prepared = await aiGateway.preparePaperReadingContext(paperId, attachmentIds);
  if (isCanceled()) return;
  const missing = prepared.attachmentStatuses.filter(status => status.parseStatus !== "available");
  if (missing.length > 0) {
    setPhase?.("parsing");
    for (const status of missing) {
      if (isCanceled()) return;
      await doclingGateway.parseAttachment(paperId, status.attachmentId);
    }
    prepared = await aiGateway.preparePaperReadingContext(paperId, attachmentIds);
  }
  if (isCanceled()) return;
  if (prepared.attachmentStatuses.length !== attachmentIds.length
    || attachmentIds.some(id => !prepared.attachmentStatuses.some(status => status.attachmentId === id && status.parseStatus === "available"))) {
    throw new Error("部分来源文件尚未完成结构化解析，无法启动文献生成任务。");
  }
  return prepared;
}

/** Same admission boundary for native ports and preview ports; only I/O is injected. */
export function createPreparedPaperGenerationGateway<T extends AiAssistanceGateway>(
  gateway: T, docling: () => Pick<DoclingParserGateway, "parseAttachment">,
): T {
  const cancelled = new Set<string>();
  const pending = new Set<string>();
  const overrides: Pick<AiAssistanceGateway, "startRun" | "startPaperAnalysis" | "cancelPaperAnalysis"> = {
    startRun: async draft => {
      if (draft.taskKind === "paper_profile_classification") {
        const paperId = draft.scopeItems[0]?.parentObjectId;
        if (!paperId || draft.scopeItems.some(scope => scope.itemKind !== "attachment" || scope.parentObjectId !== paperId)) throw new Error("请选择同一文献的来源文件。");
        await preparePaperGenerationSources({aiGateway: gateway, doclingGateway: docling(), paperId, attachmentIds: draft.scopeItems.map(scope => scope.objectId)});
      }
      return gateway.startRun(draft);
    },
    startPaperAnalysis: async draft => {
      pending.add(draft.clientRequestId);
      try {
        const prepared = await preparePaperGenerationSources({aiGateway: gateway, doclingGateway: docling(), paperId: draft.paperId,
          attachmentIds: draft.attachmentIds, isCanceled: () => cancelled.has(draft.clientRequestId)});
        if (!prepared) throw Object.assign(new Error("文献生成任务已取消"), {code: "canceled"});
        pending.delete(draft.clientRequestId);
        return await gateway.startPaperAnalysis(draft);
      } finally { pending.delete(draft.clientRequestId); cancelled.delete(draft.clientRequestId); }
    },
    cancelPaperAnalysis: async id => {
      if (pending.has(id)) { cancelled.add(id); return true; }
      return gateway.cancelPaperAnalysis(id);
    },
  };
  return new Proxy(gateway, {get: (target, property) => property in overrides
    ? Reflect.get(overrides, property) : Reflect.get(target, property)});
}
