import { useNotificationState } from "@research-assistant/workbench-sdk/feedback";
import { useCallback, useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import type {
  AiRun,
  AiTaskKind,
  AiTaskPreview,
  AiTaskSpecDraft,
  LlmModelSelection,
} from "@research-assistant/core/ai";

import {
  aiAssistanceErrorMessage,
  getAiAssistanceGateway,
  type AiAssistanceGateway,
} from "@research-assistant/workbench-sdk/ai-assistance";
import { LlmRoutePicker } from "@research-assistant/workbench-sdk/model-route-picker";
import "./AiTaskLaunchPreview.css";

interface AiTaskLaunchPreviewProps {
  readonly heading: string;
  readonly eyebrow?: string;
  readonly description: string;
  readonly startLabel: string;
  readonly gateway?: AiAssistanceGateway;
  readonly prepareDraft: (selection?: LlmModelSelection) => Promise<AiTaskSpecDraft>;
  readonly taskKind: AiTaskKind;
  readonly onCancel: () => void;
  readonly onStarted: (run: AiRun) => void;
  readonly trackRunInPlace?: boolean;
}

function isActiveRunStatus(status: AiRun["status"]): boolean {
  return status === "queued" || status === "resolving_scope" || status === "retrieving"
    || status === "extracting_evidence" || status === "generating" || status === "validating";
}

function isUnknownRunOutcome(reason: unknown): boolean {
  return typeof reason === "object" && reason !== null && "code" in reason
    && (reason.code === "data_operation_outcome_unknown" || reason.code === "ai_run_terminal_outcome_unknown");
}

export function AiTaskLaunchPreview({
  heading,
  eyebrow = "AI CANDIDATE",
  description,
  startLabel,
  gateway: suppliedGateway,
  prepareDraft,
  taskKind,
  onCancel,
  onStarted,
  trackRunInPlace = false,
}: AiTaskLaunchPreviewProps): React.JSX.Element {
  const defaultGateway = useMemo(() => getAiAssistanceGateway(), []);
  const gateway = suppliedGateway ?? defaultGateway;
  const [modelSelection, setModelSelection] = useState<LlmModelSelection>();
  const [draft, setDraft] = useState<AiTaskSpecDraft>();
  const [preview, setPreview] = useState<AiTaskPreview>();
  const [cloudConsent, setCloudConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [starting, setStarting] = useState(false);
  const [activeRunId, setActiveRunId] = useState<string>();
  const [unconfirmedMessage, setUnconfirmedMessage] = useState<string>();
  const [cancelingRunId, setCancelingRunId] = useState<string>();
  const [, setError] = useNotificationState("error");
  const [, setNotice] = useNotificationState("info");

  const handleModelSelection = useCallback((selection: LlmModelSelection | undefined) => {
    setModelSelection(selection);
  }, []);

  useEffect(() => {
    if (activeRunId === undefined || unconfirmedMessage !== undefined) return;
    let active = true;
    let timeoutId: number | undefined;
    const poll = async (): Promise<void> => {
      try {
        const run = await gateway.getRun(activeRunId);
        if (!active) return;
        if (run.status === "needs_review" || run.status === "partial") {
          setActiveRunId(undefined);
          setNotice(run.status === "partial"
            ? `AI 运行部分完成（${run.id.slice(0, 8)}…）；已生成候选已保存，运行错误可在 AI 运行记录查看。`
            : `AI 运行已完成（${run.id.slice(0, 8)}…）；候选已保存为 AI 待审查记录。`);
          onStarted(run);
          return;
        }
        if (run.status === "failed" || run.status === "canceled") {
          setActiveRunId(undefined);
          const message = run.errorMessage?.trim() || (run.status === "canceled" ? "AI 运行已取消" : "AI 运行失败");
          if (run.status === "canceled") setNotice(message);
          else setError(message);
          return;
        }
        timeoutId = window.setTimeout(() => void poll(), 1_000);
      } catch (reason) {
        if (!active) return;
        const message = `无法继续跟踪 AI 运行：${aiAssistanceErrorMessage(reason)}`;
        if (isUnknownRunOutcome(reason)) setUnconfirmedMessage(message);
        else { setActiveRunId(undefined); setError(message); }
      }
    };
    timeoutId = window.setTimeout(() => void poll(), 700);
    return () => {
      active = false;
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    };
  }, [activeRunId, gateway, onStarted, unconfirmedMessage]);

  async function prepare(): Promise<void> {
    setLoading(true); setError(undefined); setNotice(undefined);
    try {
      const nextDraft = await prepareDraft(modelSelection);
      const nextPreview = await gateway.previewTask(nextDraft);
      setDraft(nextDraft);
      setPreview(nextPreview);
      setCloudConsent(false);
    } catch (reason) { setError(aiAssistanceErrorMessage(reason)); }
    finally { setLoading(false); }
  }

  async function start(): Promise<void> {
    if (draft === undefined || preview === undefined) return;
    setStarting(true); setError(undefined); setNotice(undefined);
    try {
      const run = await gateway.startRun({
        ...draft,
        confirmedScopeHash: preview.scopeHash,
        ...(preview.requiresCloudConsent
          ? { cloudConsentVersion: "ai-cloud-consent-v1" }
          : {}),
      });
      if (trackRunInPlace && isActiveRunStatus(run.status)) {
        setDraft(undefined);
        setPreview(undefined);
        setActiveRunId(run.id);
        setNotice(`AI 运行已启动（${run.id.slice(0, 8)}…）；完成后会保存为 AI 候选记录。`);
        return;
      }
      onStarted(run);
    } catch (reason) {
      const message = aiAssistanceErrorMessage(reason);
      if (isUnknownRunOutcome(reason)) setUnconfirmedMessage(message);
      else setError(message);
    }
    finally { setStarting(false); }
  }

  async function cancelActiveRun(): Promise<void> {
    if (activeRunId === undefined || cancelingRunId !== undefined || unconfirmedMessage !== undefined) return;
    const runId = activeRunId;
    setCancelingRunId(runId);
    setError(undefined);
    try {
      const requested = await gateway.cancelRun(runId);
      if (requested) {
        setActiveRunId(undefined);
        setNotice(`已请求取消 AI 运行（${runId.slice(0, 8)}…）`);
      } else {
        setNotice(`AI 运行 ${runId.slice(0, 8)}… 当前不可取消；将继续跟踪运行状态。`);
      }
    } catch (reason) {
      setError(aiAssistanceErrorMessage(reason));
    } finally {
      setCancelingRunId(undefined);
    }
  }

  const canStart = preview !== undefined
    && (!preview.requiresCloudConsent || cloudConsent)
    && !starting
    && activeRunId === undefined
    && unconfirmedMessage === undefined;
  const controlsLocked = loading || starting || activeRunId !== undefined || unconfirmedMessage !== undefined;

  return (
    <div className="selection-card ai-selection-preview">
      <div className="ai-selection-heading">
        <div><span className="eyebrow">{eyebrow}</span><strong>{heading}</strong></div>
        <button disabled={controlsLocked} onClick={onCancel} type="button">返回人工操作</button>
      </div>
      <p>{description}</p>


      {(activeRunId !== undefined || unconfirmedMessage !== undefined) && (
        <div aria-live="polite" className="ai-launch-run-progress">
          <small>{unconfirmedMessage ?? "AI 正在运行；完成后会保存为 AI 候选记录。"}</small>
          {unconfirmedMessage === undefined && <button disabled={cancelingRunId === activeRunId} onClick={() => void cancelActiveRun()} type="button">
            <X aria-hidden="true" size={14} />{cancelingRunId === activeRunId ? "取消中" : "取消运行"}
          </button>}
        </div>
      )}
      <LlmRoutePicker disabled={controlsLocked || preview !== undefined} gateway={gateway} onSelection={handleModelSelection} taskKind={taskKind} />
      {preview === undefined ? (
        <button className="primary-button" disabled={controlsLocked} onClick={() => void prepare()} type="button">
          {loading ? "正在读取设置…" : "生成外发预览"}
        </button>
      ) : (
        <>
          <div className="ai-scope-summary">
            <span>{preview.providerId} · {preview.modelId}</span>
            <small>范围哈希 {preview.scopeHash.slice(0, 12)}… · {preview.evidencePreview.length} 条结构化证据</small>
          </div>
          <div className="ai-outgoing-evidence">
            {preview.evidencePreview.map((item) => (
              <article key={item.citationKey}>
                <header><b>{item.citationKey}</b><span>{item.relationKind === "direct_quote" ? "精确引文" : "上下文"}</span></header>
                <q>{item.relationKind === "direct_quote" ? item.quoteExact : item.contextText}</q>
                <small>{item.paperTitle} · 第 {item.pageLabel ?? item.pageIndex + 1} 页 · SHA-256 {item.contentSha256.slice(0, 12)}…</small>
              </article>
            ))}
          </div>
          {preview.requiresCloudConsent && <label className="ai-cloud-consent"><input checked={cloudConsent} onChange={(event) => setCloudConsent(event.target.checked)} type="checkbox" />我确认仅将以上可见证据发送到该云端 provider。</label>}
          <div className="form-actions">
            <button disabled={controlsLocked} onClick={() => { setPreview(undefined); setDraft(undefined); }} type="button">重新预览</button>
            <button className="primary-button" disabled={!canStart} onClick={() => void start()} type="button">{starting ? "正在启动…" : startLabel}</button>
          </div>
        </>
      )}
    </div>
  );
}
