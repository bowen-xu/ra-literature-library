import { useSyncExternalStore } from "react";
import type { AiRun } from "@research-assistant/core/ai";
import type { AiAssistanceGateway } from "@research-assistant/workbench-sdk/ai-assistance";
import { aiAssistanceErrorMessage } from "@research-assistant/workbench-sdk/ai-assistance";
import { notify } from "@research-assistant/workbench-sdk/feedback";
import { publishPaperReadingChanged } from "./readingPanelEvents";

interface RunState {
  readonly recovering: boolean;
  readonly conversationId: string | undefined;
  readonly preparing: boolean;
  readonly runId: string | undefined;
  readonly canceling: boolean;
  readonly error: string | undefined;
  readonly creationUnknown: boolean;
  readonly terminalUnknown: boolean;
}
interface RunStore {
  readonly snapshot: () => RunState;
  readonly subscribe: (listener: () => void) => () => void;
  readonly start: (prepare: () => Promise<AiRun>) => Promise<void>;
  readonly cancel: () => Promise<void>;
  readonly retry: () => void;
  readonly disposable: () => boolean;
}
const idle: RunState = { recovering: false, conversationId: undefined, preparing: false, runId: undefined, canceling: false, error: undefined, creationUnknown: false, terminalUnknown: false };
// UI observation only: the native gateway owns execution. Retain active IDs across
// navigation, poll only while observed, and bound inactive session entries to 128.
const gateways = new WeakMap<AiAssistanceGateway, Map<string, RunStore>>();

function createStore(gateway: AiAssistanceGateway, paperId: string): RunStore {
  let state = idle, epoch = 0, polling = false;
  // Older isolated component fixtures may omit this capability; production gateways provide it.
  let recovered = typeof gateway.getLatestPaperPortraitRun !== "function", recoveryPending = false;
  if (!recovered) state = { ...idle, recovering: true };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const listeners = new Set<() => void>();
  const sourceId = crypto.randomUUID();
  function publish(next: RunState): void {
    state = next;
    listeners.forEach(listener => listener());
  }
  function stop(): void {
    epoch++;
    clearTimeout(timer);
    timer = undefined;
    polling = false;
  }
  async function poll(): Promise<void> {
    const runId = state.runId;
    if (!runId || !listeners.size || polling || timer !== undefined || state.error) return;
    const token = epoch;
    polling = true;
    try {
      const run = await gateway.getRun(runId);
      if (token !== epoch || state.runId !== runId) return;
      const conversationId = run.sharedConversationId ?? state.conversationId;
      if (["needs_review", "partial", "failed", "canceled"].includes(run.status)) {
        publish({ ...idle, conversationId });
        // Both rails must reload even if the initiating rail has been unmounted.
        publishPaperReadingChanged(paperId, sourceId);
        if (run.status === "needs_review" || run.status === "partial")
          notify.success("文献画像已生成，可直接用于结构化提取，也可先修改。");
        else notify.info(run.errorMessage ?? (run.status === "canceled" ? "画像生成已取消。" : "画像生成失败，请重试。"));
      } else {
        if (conversationId !== state.conversationId || run.cancelRequested && !state.canceling)
          publish({ ...state, conversationId, canceling: state.canceling || run.cancelRequested });
        timer = setTimeout(() => { timer = undefined; void poll(); }, 800);
      }
    } catch (reason) {
      if (token === epoch && state.runId === runId) {
        const terminalUnknown = typeof reason === "object" && reason !== null && "code" in reason
          && (reason.code === "ai_run_terminal_outcome_unknown" || reason.code === "data_operation_outcome_unknown");
        const message = aiAssistanceErrorMessage(reason);
        // Losing observation is not a failed task: retain its ID and prevent a
        // duplicate generation until the user retries observation or cancels.
        publish({ ...state, error: message, terminalUnknown, canceling: terminalUnknown ? false : state.canceling });
        notify.error(terminalUnknown ? message : "无法读取画像生成状态，请重试读取；后台任务未被取消。");
      }
    } finally {
      if (token === epoch) polling = false;
    }
  }
  async function recover(): Promise<void> {
    if (recovered || recoveryPending) return;
    recoveryPending = true;
    publish({ ...state, recovering: true, error: undefined });
    try {
      const latest = await gateway.getLatestPaperPortraitRun(paperId);
      recovered = true;
      const active = latest && !["needs_review", "partial", "failed", "canceled"].includes(latest.status);
      publish({ ...idle, conversationId: latest?.sharedConversationId,
        runId: active ? latest.id : undefined, canceling: active ? latest.cancelRequested : false });
      void poll();
    } catch (reason) {
      publish({ ...state, recovering: false, error: aiAssistanceErrorMessage(reason) });
      notify.error("无法恢复画像任务，请重试读取；已有内容保持不变。");
    } finally { recoveryPending = false; }
  }
  return {
    snapshot: () => state,
    disposable: () => !listeners.size && !recoveryPending && !state.preparing && !state.runId && !state.creationUnknown,
    subscribe(listener) {
      listeners.add(listener);
      if (!recovered) void recover(); else void poll();
      return () => { listeners.delete(listener); if (!listeners.size) stop(); };
    },
    async start(prepare) {
      if (!recovered || state.preparing || state.runId || state.error) return;
      const previousConversation = state.conversationId;
      publish({ ...idle, conversationId: previousConversation, preparing: true });
      try {
        const run = await prepare();
        publish({ ...idle, conversationId: run.sharedConversationId ?? previousConversation, runId: run.id, canceling: run.cancelRequested });
        void poll();
      } catch (reason) {
        const message = aiAssistanceErrorMessage(reason);
        const creationUnknown = typeof reason === "object" && reason !== null
          && "code" in reason && (reason.code === "data_operation_outcome_unknown" || reason.code === "ai_run_terminal_outcome_unknown");
        publish({ ...idle, conversationId: previousConversation,
          ...(creationUnknown ? { error: message, creationUnknown: true } : {}) });
        notify.error(message);
      }
    },
    async cancel() {
      const runId = state.runId;
      if (!runId || state.canceling || state.terminalUnknown) return;
      publish({ ...state, canceling: true });
      try {
        await gateway.cancelRun(runId);
        if (state.runId === runId && !state.terminalUnknown) { stop(); publish({ ...state, error: undefined }); void poll(); }
      } catch (reason) {
        if (state.runId === runId && !state.terminalUnknown) {
          publish({ ...state, canceling: false });
          notify.error(aiAssistanceErrorMessage(reason));
        }
      }
    },
    retry() { if (state.creationUnknown || state.terminalUnknown) return; if (!recovered) { void recover(); return; } stop(); publish({ ...state, error: undefined }); void poll(); },
  };
}

/** One observation owner per runtime gateway and paper, shared by both reading rails. */
export function usePaperPortraitRun(gateway: AiAssistanceGateway, paperId: string) {
  let papers = gateways.get(gateway);
  if (!papers) { papers = new Map(); gateways.set(gateway, papers); }
  let store = papers.get(paperId);
  if (!store) {
    for (const [id, entry] of papers) {
      if (papers.size < 128) break;
      if (entry.disposable()) papers.delete(id);
    }
    store = createStore(gateway, paperId);
    papers.set(paperId, store);
  }
  const state = useSyncExternalStore(store.subscribe, store.snapshot);
  return { ...state, start: store.start, cancel: store.cancel, retry: store.retry };
}
