import { notify } from "@research-assistant/workbench-sdk/feedback";
import { overviewFieldTitle } from "@research-assistant/core/ai";
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import type {
  AiCandidate,
  AiRun,
  AiTaskPreview,
  AiTaskSpecDraft,
  LlmModelSelection,
  OverviewFieldId,
  PaperOverviewUnitCandidateV1,
} from "@research-assistant/core/ai";

import type { AiAssistanceGateway } from "@research-assistant/workbench-sdk/ai-assistance";
import { aiAssistanceErrorMessage } from "@research-assistant/workbench-sdk/ai-assistance";
import { LlmRoutePicker } from "@research-assistant/workbench-sdk/model-route-picker";



interface AiOverviewRetryPanelProps {
  readonly candidate: AiCandidate;
  readonly payload: PaperOverviewUnitCandidateV1;
  readonly gateway: AiAssistanceGateway;
  readonly disabled: boolean;
}

function createTask(
  candidate: AiCandidate,
  payload: PaperOverviewUnitCandidateV1,
  targetFields: readonly OverviewFieldId[],
  modelSelection: LlmModelSelection | undefined,
): AiTaskSpecDraft | undefined {
  const evidence = candidate.evidenceBundle.items[0];
  if (evidence === undefined) return undefined;
  return {
    taskKind: "paper_overview",
    providerId: "",
    ...(modelSelection === undefined ? {} : { modelSelection }),
    userGoal: `只补充这些未完成字段：${targetFields.map(field => overviewFieldTitle(payload, field)).join("、")}。`,
    pipelineVersion: "paper-overview-runtime-v1",
    promptVersion: "paper-overview-field-retry-v1",
    outputSchemaVersion: 1,
    maxInputTokens: 16_000,
    maxOutputTokens: 3_000,
    timeoutMs: 90_000,
    scopeItems: [{
      itemKind: "attachment",
      objectId: evidence.attachmentId,
      contentSha256: evidence.contentSha256,
    }],
    overviewFields: targetFields,
    baseCandidateId: candidate.id,
    baseCandidateRevision: candidate.currentRevision,
  };
}

function isActiveRunStatus(status: AiRun["status"]): boolean {
  return status === "queued" || status === "resolving_scope" || status === "retrieving"
    || status === "extracting_evidence" || status === "generating" || status === "validating";
}

export function AiOverviewRetryPanel({
  candidate,
  payload,
  gateway,
  disabled,
}: AiOverviewRetryPanelProps): React.JSX.Element | null {
  const retryableFields = payload.fields
    .filter((field) => field.status !== "filled")
    .map((field) => field.field);
  const [selected, setSelected] = useState<ReadonlySet<OverviewFieldId>>(
    () => new Set(),
  );
  const [preview, setPreview] = useState<AiTaskPreview>();
  const [pendingTask, setPendingTask] = useState<AiTaskSpecDraft>();
  const [cloudConsent, setCloudConsent] = useState(false);
  const [activeRunId, setActiveRunId] = useState<string>();
  const [cancelingRunId, setCancelingRunId] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [modelSelection, setModelSelection] = useState<LlmModelSelection>();

  useEffect(() => {
    setSelected(new Set());
    setPreview(undefined);
    setPendingTask(undefined);
    setCloudConsent(false);
    setActiveRunId(undefined);


  }, [candidate.id, candidate.currentRevision]);

  useEffect(() => {
    if (activeRunId === undefined) return;
    let active = true;
    let timeoutId: number | undefined;
    const poll = async (): Promise<void> => {
      try {
        const run = await gateway.getRun(activeRunId);
        if (!active) return;
        if (run.status === "needs_review" || run.status === "partial") {
          setActiveRunId(undefined);
          notify.info(run.status === "partial"
            ? `字段重试部分完成（${run.id.slice(0, 8)}…）；请检查本次运行错误。`
            : `字段重试已完成（${run.id.slice(0, 8)}…）；已保存新的 AI revision。`);
          return;
        }
        if (run.status === "failed" || run.status === "canceled") {
          setActiveRunId(undefined);
          const message = run.errorMessage?.trim() || (run.status === "canceled" ? "字段重试已取消" : "字段重试失败");
          if (run.status === "canceled") notify.info(message);
          else notify.error(message);
          return;
        }
        timeoutId = window.setTimeout(() => void poll(), 1_000);
      } catch (reason) {
        if (!active) return;
        setActiveRunId(undefined);
        notify.error(`无法继续跟踪字段重试：${aiAssistanceErrorMessage(reason)}`);
      }
    };
    timeoutId = window.setTimeout(() => void poll(), 700);
    return () => {
      active = false;
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    };
  }, [activeRunId, gateway]);

  if (retryableFields.length === 0) return null;
  async function prepareRetry(): Promise<void> {
    const targetFields = retryableFields.filter((field) => selected.has(field));
    const task = createTask(candidate, payload, targetFields, modelSelection);
    if (task === undefined || targetFields.length === 0) return;
    setBusy(true);
    try {
      setPreview(await gateway.previewTask(task));
      setPendingTask(task);
      setCloudConsent(false);
    } catch (reason) { notify.error(aiAssistanceErrorMessage(reason)); }
    finally { setBusy(false); }
  }

  async function startRetry(): Promise<void> {
    if (preview === undefined || pendingTask === undefined) return;
    setBusy(true);
    try {
      const run = await gateway.startRun({
        ...pendingTask,
        confirmedScopeHash: preview.scopeHash,
        ...(preview.requiresCloudConsent ? { cloudConsentVersion: "ai-cloud-consent-v1" } : {}),
      });
      setPreview(undefined); setPendingTask(undefined);
      if (isActiveRunStatus(run.status)) {
        setActiveRunId(run.id);
        notify.info(`重试运行已启动（${run.id.slice(0, 8)}…）。完成后结果会保存为新的 AI revision。`);
        return;
      }
      if (run.status === "failed" || run.status === "canceled") {
        const message = run.errorMessage?.trim() || (run.status === "canceled" ? "字段重试已取消" : "字段重试失败");
        if (run.status === "canceled") notify.info(message);
        else notify.error(message);
        return;
      }
      notify.info(`字段重试已完成（${run.id.slice(0, 8)}…）；已保存新的 AI revision。`);
    } catch (reason) { notify.error(aiAssistanceErrorMessage(reason)); }
    finally { setBusy(false); }
  }

  async function cancelActiveRun(): Promise<void> {
    if (activeRunId === undefined || cancelingRunId !== undefined) return;
    const runId = activeRunId;
    setCancelingRunId(runId);
    try {
      const requested = await gateway.cancelRun(runId);
      if (requested) {
        setActiveRunId(undefined);
        notify.info(`已请求取消字段重试（${runId.slice(0, 8)}…）`);
      } else {
        notify.info(`字段重试 ${runId.slice(0, 8)}… 当前不可取消；将继续跟踪运行状态。`);
      }
    } catch (reason) { notify.error(aiAssistanceErrorMessage(reason)); }
    finally { setCancelingRunId(undefined); }
  }

  const controlsDisabled = disabled || busy || activeRunId !== undefined;

  return <details className="ai-overview-retry" open={preview !== undefined || activeRunId !== undefined}>
    <summary>重试未完成字段</summary>
    <p>只替换下方勾选字段；其他字段及人工修改逐字保留。重试复用原候选已冻结的证据。</p>
    {activeRunId !== undefined && <div aria-live="polite" className="structured-reading-run-progress">
      <small>AI 正在重试所选字段；完成后保存新的 AI revision。</small>
      <button disabled={cancelingRunId === activeRunId} onClick={() => void cancelActiveRun()} type="button"><X aria-hidden="true" size={14} />{cancelingRunId === activeRunId ? "取消中" : "取消重试"}</button>
    </div>}
    <div className="ai-overview-retry-fields">
      {retryableFields.map((field) => <label key={field}>
        <input checked={selected.has(field)} disabled={controlsDisabled || preview !== undefined}
          onChange={(event) => setSelected((current) => {
            const next = new Set(current);
            if (event.target.checked) next.add(field); else next.delete(field);
            return next;
          })} type="checkbox" />
        {overviewFieldTitle(candidate.revisions.find(value => value.revision === candidate.currentRevision)?.payload.kind === "paper_overview_unit_v1" ? candidate.revisions.find(value => value.revision === candidate.currentRevision)?.payload as PaperOverviewUnitCandidateV1 : {}, field)}
      </label>)}
    </div>
    <LlmRoutePicker disabled={controlsDisabled || preview !== undefined} gateway={gateway} onSelection={setModelSelection} taskKind="paper_overview" />
    {preview === undefined && <div className="paper-overview-actions"><button
      disabled={controlsDisabled || selected.size === retryableFields.length}
      onClick={() => setSelected(new Set(retryableFields))} type="button">选择全部未完成字段</button>
      <button disabled={controlsDisabled || selected.size === 0}
        onClick={() => setSelected(new Set())} type="button">清空选择</button></div>}
    {preview === undefined ? <button disabled={controlsDisabled || selected.size === 0}
      onClick={() => void prepareRetry()} type="button">预览重试外发范围</button> : <>
      <div className="paper-overview-scope"><b>{preview.providerId} · {preview.modelId}</b><small>复用 {preview.evidencePreview.length} 条冻结证据 · {preview.scopeHash.slice(0, 12)}…</small></div>
      <div className="paper-overview-evidence">{preview.evidencePreview.map((evidence) => <details key={evidence.citationKey}><summary>{evidence.citationKey} · 第 {evidence.pageLabel ?? evidence.pageIndex + 1} 页</summary><q>{evidence.quoteExact}</q><small>SHA-256 {evidence.contentSha256}</small></details>)}</div>
      {preview.requiresCloudConsent && <label className="paper-overview-consent"><input checked={cloudConsent} onChange={(event) => setCloudConsent(event.target.checked)} type="checkbox" />我确认仅把以上可见的冻结证据发送到云端 provider。</label>}
      <div className="paper-overview-actions"><button disabled={busy} onClick={() => { setPreview(undefined); setPendingTask(undefined); }} type="button">取消预览</button><button disabled={busy || preview.requiresCloudConsent && !cloudConsent} onClick={() => void startRetry()} type="button">启动所选字段重试</button></div>
    </>}
  </details>;
}
