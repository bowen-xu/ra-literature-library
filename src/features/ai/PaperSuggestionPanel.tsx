import { notify } from "@research-assistant/workbench-sdk/feedback";
import { useCallback, useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import type {
  AiCandidate,
  AiEvidenceItem,
  AiKnowledgeCandidatePayloadV1,
  AiRun,
  AiSuggestionCandidateKind,
  AiTaskPreview,
  AiTaskSpecDraft,
  LlmModelSelection,
} from "@research-assistant/core/ai";
import type { LiteratureItem } from "@research-assistant/core/literature";

import {
  aiAssistanceErrorMessage,
  getAiAssistanceGateway,
  type AiAssistanceGateway,
} from "@research-assistant/workbench-sdk/ai-assistance";
import { LlmRoutePicker } from "@research-assistant/workbench-sdk/model-route-picker";

const suggestionKinds: readonly {
  readonly kind: AiSuggestionCandidateKind;
  readonly label: string;
  readonly goal: string;
}[] = [
  { kind: "attention_suggestion_v1", label: "阅读注意力建议", goal: "指出值得回到原文重点核对的内容及理由。" },
];

const suggestionKindLabels: Readonly<Record<AiSuggestionCandidateKind, string>> = {
  concept_suggestion_v1: "关键概念",
  definition_suggestion_v1: "定义",
  relation_suggestion_v1: "概念关系",
  attention_suggestion_v1: "阅读注意力",
};

interface PaperSuggestionPanelProps {
  readonly gateway?: AiAssistanceGateway;
  readonly item: LiteratureItem;
  readonly onOpenAttachment: (attachment: LiteratureItem["attachments"][number]) => void;
}

function suggestionTask(
  modelSelection: LlmModelSelection | undefined,
  attachmentId: string,
  candidateKind: AiSuggestionCandidateKind,
): AiTaskSpecDraft {
  const selected = suggestionKinds.find((item) => item.kind === candidateKind);
  return {
    taskKind: "paper_suggestions",
    providerId: "",
    ...(modelSelection === undefined ? {} : { modelSelection }),
    userGoal: selected?.goal ?? "生成有原文依据、必须人工审查的阅读建议。",
    pipelineVersion: "paper-suggestions-runtime-v1",
    promptVersion: "paper-suggestions-grounded-v1",
    outputSchemaVersion: 1,
    maxInputTokens: 16_000,
    maxOutputTokens: 3_000,
    timeoutMs: 90_000,
    scopeItems: [{ itemKind: "attachment", objectId: attachmentId }],
    suggestionCandidateKind: candidateKind,
  };
}

function isActiveRunStatus(status: AiRun["status"]): boolean {
  return status === "queued" || status === "resolving_scope" || status === "retrieving"
    || status === "extracting_evidence" || status === "generating" || status === "validating";
}

function isUnknownRunOutcome(reason: unknown): boolean {
  return typeof reason === "object" && reason !== null && "code" in reason
    && (reason.code === "data_operation_outcome_unknown" || reason.code === "ai_run_terminal_outcome_unknown");
}

function currentSuggestionPayload(candidate: AiCandidate): AiKnowledgeCandidatePayloadV1 | undefined {
  const payload = candidate.revisions.find((revision) =>
    revision.revision === candidate.currentRevision)?.payload;
  return payload?.kind === "concept_suggestion_v1"
    || payload?.kind === "definition_suggestion_v1"
    || payload?.kind === "relation_suggestion_v1"
    || payload?.kind === "attention_suggestion_v1" ? payload : undefined;
}

function isPaperSuggestionCandidate(candidate: AiCandidate, paperId: string): boolean {
  return currentSuggestionPayload(candidate) !== undefined
    && candidate.evidenceBundle.items.some((evidence) => evidence.paperId === paperId);
}

function runTimestamp(candidate: AiCandidate): number {
  return Date.parse(candidate.updatedAt) || Date.parse(candidate.createdAt) || 0;
}

function SuggestionEvidenceList({
  evidenceItemIds,
  evidenceByCitationKey,
  item,
  onOpenAttachment,
}: {
  readonly evidenceItemIds: readonly string[];
  readonly evidenceByCitationKey: ReadonlyMap<string, AiEvidenceItem>;
  readonly item: LiteratureItem;
  readonly onOpenAttachment: (attachment: LiteratureItem["attachments"][number]) => void;
}): React.JSX.Element {
  const evidenceItems = evidenceItemIds
    .map((id) => evidenceByCitationKey.get(id))
    .filter((evidence): evidence is AiEvidenceItem => evidence !== undefined);

  if (evidenceItems.length === 0) {
    return <small>来源片段未在当前候选包中找到。</small>;
  }

  return (
    <div className="paper-suggestion-evidence-list">
      {evidenceItems.map((evidence) => {
        const attachment = item.attachments.find((candidate) =>
          candidate.id === evidence.attachmentId);
        return (
          <details key={evidence.id}>
            <summary>
              {evidence.citationKey} · 第 {evidence.pageLabel ?? evidence.pageIndex + 1} 页
            </summary>
            <q>{evidence.quoteExact}</q>
            {evidence.contextText.trim() !== "" && <p>{evidence.contextText}</p>}
            <div>
              <small>锚点 {evidence.currentAnchorStatus} · SHA-256 {evidence.contentSha256.slice(0, 12)}…</small>
              {attachment !== undefined && (
                <button onClick={() => onOpenAttachment(attachment)} type="button">
                  打开 PDF
                </button>
              )}
            </div>
          </details>
        );
      })}
    </div>
  );
}

function PaperSuggestionCandidateCard({
  candidate,
  item,
  onOpenAttachment,
}: {
  readonly candidate: AiCandidate;
  readonly item: LiteratureItem;
  readonly onOpenAttachment: (attachment: LiteratureItem["attachments"][number]) => void;
}): React.JSX.Element | null {
  const payload = currentSuggestionPayload(candidate);
  if (payload === undefined) return null;

  const evidenceByCitationKey = new Map(candidate.evidenceBundle.items.map((evidence) =>
    [evidence.citationKey, evidence] as const));
  const meta = `${candidate.providerId} · ${candidate.modelId} · run ${candidate.runId.slice(0, 8)}… · v${candidate.currentRevision}`;

  return (
    <article className="paper-suggestion-candidate-card">
      <header>
        <div>
          <b>{suggestionKindLabels[payload.kind]}</b>
          <small>{meta}</small>
        </div>
        <span>{candidate.reviewState}</span>
      </header>
      <div className="paper-suggestion-items">
        {payload.kind === "concept_suggestion_v1" && payload.suggestions.map((suggestion) => (
          <section key={suggestion.id}>
            <header>
              <b>{suggestion.term}</b>
              <span>{suggestion.epistemicRole}</span>
            </header>
            <p>{suggestion.explanation}</p>
            {[suggestion.disambiguation, suggestion.domain, suggestion.tradition, suggestion.period]
              .filter((value): value is string => value !== undefined && value.trim() !== "")
              .length > 0 && (
              <small>
                {[suggestion.disambiguation, suggestion.domain, suggestion.tradition, suggestion.period]
                  .filter((value): value is string => value !== undefined && value.trim() !== "")
                  .join(" · ")}
              </small>
            )}
            <SuggestionEvidenceList evidenceByCitationKey={evidenceByCitationKey}
              evidenceItemIds={suggestion.evidenceItemIds} item={item}
              onOpenAttachment={onOpenAttachment} />
          </section>
        ))}
        {payload.kind === "definition_suggestion_v1" && payload.suggestions.map((suggestion) => (
          <section key={suggestion.id}>
            <header>
              <b>{suggestion.term}</b>
              <span>{suggestion.epistemicRole}</span>
            </header>
            <p>{suggestion.statement}</p>
            {suggestion.scopeNote !== undefined && <small>{suggestion.scopeNote}</small>}
            <SuggestionEvidenceList evidenceByCitationKey={evidenceByCitationKey}
              evidenceItemIds={suggestion.evidenceItemIds} item={item}
              onOpenAttachment={onOpenAttachment} />
          </section>
        ))}
        {payload.kind === "relation_suggestion_v1" && payload.suggestions.map((suggestion) => (
          <section key={suggestion.id}>
            <header>
              <b>{suggestion.subjectTerm} / {suggestion.objectTerm}</b>
              <span>{suggestion.predicateKind}</span>
            </header>
            {suggestion.scopeNote !== undefined && <p>{suggestion.scopeNote}</p>}
            <SuggestionEvidenceList evidenceByCitationKey={evidenceByCitationKey}
              evidenceItemIds={suggestion.evidenceItemIds} item={item}
              onOpenAttachment={onOpenAttachment} />
          </section>
        ))}
        {payload.kind === "attention_suggestion_v1" && payload.suggestions.map((suggestion) => (
          <section key={suggestion.id}>
            <header>
              <b>{suggestion.title}</b>
              <span>{suggestion.priority}</span>
            </header>
            <p>{suggestion.reason}</p>
            <SuggestionEvidenceList evidenceByCitationKey={evidenceByCitationKey}
              evidenceItemIds={suggestion.evidenceItemIds} item={item}
              onOpenAttachment={onOpenAttachment} />
          </section>
        ))}
      </div>
    </article>
  );
}

export function PaperSuggestionPanel({
  gateway: providedGateway,
  item,
  onOpenAttachment,
}: PaperSuggestionPanelProps): React.JSX.Element {
  const defaultGateway = useMemo(() => getAiAssistanceGateway(), []);
  const gateway = providedGateway ?? defaultGateway;
  const [modelSelection, setModelSelection] = useState<LlmModelSelection>();
  const [attachmentId, setAttachmentId] = useState(item.attachments[0]?.id ?? "");
  const candidateKind: AiSuggestionCandidateKind = "attention_suggestion_v1";
  const [preview, setPreview] = useState<AiTaskPreview>();
  const [pendingTask, setPendingTask] = useState<AiTaskSpecDraft>();
  const [cloudConsent, setCloudConsent] = useState(false);
  const [activeRunId, setActiveRunId] = useState<string>();
  const [unconfirmedMessage, setUnconfirmedMessage] = useState<string>();
  const [cancelingRunId, setCancelingRunId] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [candidates, setCandidates] = useState<readonly AiCandidate[]>([]);
  const [candidatesLoading, setCandidatesLoading] = useState(false);
  const [isPanelOpen, setIsPanelOpen] = useState(false);

  const refreshCandidates = useCallback(async (): Promise<number> => {
    setCandidatesLoading(true);

    try {
      const loaded = await gateway.listCandidates();
      const paperCandidates = loaded
        .filter((candidate) => isPaperSuggestionCandidate(candidate, item.id))
        .sort((left, right) => runTimestamp(right) - runTimestamp(left));
      setCandidates(paperCandidates);
      return paperCandidates.length;
    } catch (reason) {
      notify.error(`无法读取本论文的 AI 候选：${aiAssistanceErrorMessage(reason)}`);
      return 0;
    } finally {
      setCandidatesLoading(false);
    }
  }, [gateway, item.id]);

  useEffect(() => {
    setAttachmentId(item.attachments[0]?.id ?? "");
    setPreview(undefined);
    setPendingTask(undefined);
    setActiveRunId(undefined);
    setUnconfirmedMessage(undefined);


    setIsPanelOpen(false);
  }, [gateway, item.id]);

  useEffect(() => {
    void refreshCandidates();
  }, [refreshCandidates]);

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
          await refreshCandidates();
          notify.info(run.status === "partial"
            ? `建议运行部分完成（${run.id.slice(0, 8)}…）；已生成的候选会显示在下方。`
            : `建议运行已完成（${run.id.slice(0, 8)}…）；候选已显示在下方。`);
          return;
        }
        if (run.status === "failed" || run.status === "canceled") {
          setActiveRunId(undefined);
          const message = run.errorMessage?.trim() || (run.status === "canceled" ? "建议运行已取消" : "建议运行失败");
          if (run.status === "canceled") notify.info(message);
          else notify.error(message);
          return;
        }
        timeoutId = window.setTimeout(() => void poll(), 1_000);
      } catch (reason) {
        if (!active) return;
        const message = aiAssistanceErrorMessage(reason);
        if (isUnknownRunOutcome(reason)) setUnconfirmedMessage(message);
        else setActiveRunId(undefined);
        notify.error(`无法继续跟踪建议运行：${message}`);
      }
    };
    timeoutId = window.setTimeout(() => void poll(), 700);
    return () => {
      active = false;
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    };
  }, [activeRunId, gateway, refreshCandidates, unconfirmedMessage]);

  async function prepare(): Promise<void> {
    if (attachmentId === "") return;
    setBusy(true);


    try {
      const task = suggestionTask(modelSelection, attachmentId, candidateKind);
      setPreview(await gateway.previewTask(task));
      setPendingTask(task);
      setCloudConsent(false);
    } catch (reason) {
      notify.error(aiAssistanceErrorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  async function start(): Promise<void> {
    if (preview === undefined || pendingTask === undefined) return;
    setBusy(true);

    try {
      const run = await gateway.startRun({
        ...pendingTask,
        confirmedScopeHash: preview.scopeHash,
        ...(preview.requiresCloudConsent ? { cloudConsentVersion: "ai-cloud-consent-v1" } : {}),
      });
      setPreview(undefined);
      setPendingTask(undefined);
      if (isActiveRunStatus(run.status)) {
        setActiveRunId(run.id);
        notify.info(`建议运行已启动（${run.id.slice(0, 8)}…）；完成后会在下方显示候选。`);
        return;
      }
      if (run.status === "failed" || run.status === "canceled") {
        const message = run.errorMessage?.trim() || (run.status === "canceled" ? "建议运行已取消" : "建议运行失败");
        if (run.status === "canceled") notify.info(message);
        else notify.error(message);
        return;
      }
      await refreshCandidates();
      notify.info(`建议运行已完成（${run.id.slice(0, 8)}…）；候选已显示在下方。`);
    } catch (reason) {
      if (isUnknownRunOutcome(reason)) {
        setUnconfirmedMessage(aiAssistanceErrorMessage(reason));
        setPreview(undefined);
        setPendingTask(undefined);
      }
      notify.error(aiAssistanceErrorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  async function cancelActiveRun(): Promise<void> {
    if (activeRunId === undefined || cancelingRunId !== undefined || unconfirmedMessage !== undefined) return;
    const runId = activeRunId;
    setCancelingRunId(runId);
    try {
      const requested = await gateway.cancelRun(runId);
      if (requested) {
        setActiveRunId(undefined);
        notify.info(`已请求取消建议运行（${runId.slice(0, 8)}…）`);
      } else {
        notify.info(`建议运行 ${runId.slice(0, 8)}… 当前不可取消；将继续跟踪运行状态。`);
      }
    } catch (reason) {
      notify.error(aiAssistanceErrorMessage(reason));
    } finally {
      setCancelingRunId(undefined);
    }
  }

  const selectedAttachment = item.attachments.find((attachment) => attachment.id === attachmentId);
  const controlsDisabled = busy || activeRunId !== undefined || unconfirmedMessage !== undefined;
  const visibleCandidates = candidates.filter((candidate) => candidate.candidateKind === candidateKind);
  const selectedSuggestionLabel = suggestionKindLabels[candidateKind];
  return (
    <details className="paper-overview-ai paper-suggestion-panel" onToggle={(event) =>
      setIsPanelOpen(event.currentTarget.open)} open={isPanelOpen}>
      <summary>阅读注意力建议</summary>
      <p>
        按需生成阅读建议，独立于结构化阅读提取。
      </p>
      <details className="paper-suggestion-supplement" open={preview !== undefined || activeRunId !== undefined || unconfirmedMessage !== undefined}>
        <summary>补充阅读注意力建议</summary>
        <p>按需生成值得回到原文重点核对的内容；注意力优先级不是事实置信度。</p>
      {(activeRunId !== undefined || unconfirmedMessage !== undefined) && (
        <div aria-live="polite" className="structured-reading-run-progress">
          <small>{unconfirmedMessage ?? "AI 正在生成阅读建议；完成后会在下方显示本论文候选。"}</small>
          {unconfirmedMessage === undefined && <button disabled={cancelingRunId === activeRunId} onClick={() => void cancelActiveRun()} type="button"><X aria-hidden="true" size={14} />{cancelingRunId === activeRunId ? "取消中" : "取消建议"}</button>}
        </div>
      )}
      {item.attachments.length === 0 ? (
        <p>先添加 PDF 附件，才能形成可回跳的来源建议。</p>
      ) : (
        <div className="paper-overview-ai-controls">
          <label>
            PDF
            <select
              disabled={controlsDisabled || preview !== undefined}
              onChange={(event) => setAttachmentId(event.target.value)}
              value={attachmentId}
            >
              {item.attachments.map((attachment) => (
                <option key={attachment.id} value={attachment.id}>{attachment.displayName}</option>
              ))}
            </select>
          </label>
          <LlmRoutePicker disabled={controlsDisabled || preview !== undefined} gateway={gateway} onSelection={setModelSelection} taskKind="paper_suggestions" />
          {preview === undefined ? (
            <div className="paper-overview-actions">
              <button
                disabled={controlsDisabled}
                onClick={() => void prepare()}
                type="button"
              >
                预览并抽取
              </button>
              {selectedAttachment !== undefined && (
                <button onClick={() => onOpenAttachment(selectedAttachment)} type="button">
                  打开 PDF／更新索引
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="paper-overview-scope">
                <b>
                  {suggestionKinds.find((kind) => kind.kind === preview.suggestionCandidateKind)?.label}
                  {` · ${preview.providerId} · ${preview.modelId}`}
                </b>
                <small>
                  候选类型、附件 SHA 与 {preview.evidencePreview.length} 个片段已冻结 ·
                  {` ${preview.scopeHash.slice(0, 12)}…`}
                </small>
              </div>
              <div className="paper-overview-evidence">
                {preview.evidencePreview.map((evidence) => (
                  <details key={evidence.citationKey}>
                    <summary>
                      {evidence.citationKey} · 第 {evidence.pageLabel ?? evidence.pageIndex + 1} 页
                    </summary>
                    <q>{evidence.quoteExact}</q>
                    <small>SHA-256 {evidence.contentSha256}</small>
                  </details>
                ))}
              </div>
              {preview.requiresCloudConsent && (
                <label className="paper-overview-consent">
                  <input
                    checked={cloudConsent}
                    onChange={(event) => setCloudConsent(event.target.checked)}
                    type="checkbox"
                  />
                  我确认仅把以上可见片段发送到云端 provider。
                </label>
              )}
              <div className="paper-overview-actions">
                <button
                  disabled={busy}
                  onClick={() => {
                    setPreview(undefined);
                    setPendingTask(undefined);
                  }}
                  type="button"
                >
                  重新选择
                </button>
                <button
                  disabled={busy || preview.requiresCloudConsent && !cloudConsent}
                  onClick={() => void start()}
                  type="button"
                >
                  生成候选
                </button>
              </div>
            </>
          )}
        </div>
      )}
      <section className="paper-suggestion-candidates" aria-label="本论文 AI 候选">
        <header>
          <div>
            <b>{selectedSuggestionLabel}候选</b>
            <small>{visibleCandidates.length} 条当前类型 · {candidates.length} 条本论文候选</small>
          </div>
          <button disabled={candidatesLoading} onClick={() => void refreshCandidates()} type="button">
            {candidatesLoading ? "读取中" : "刷新"}
          </button>
        </header>
        {!candidatesLoading && candidates.length === 0 && (
          <p>尚无本论文 AI 候选。选择 PDF 后可先预览外发片段，再生成阅读注意力建议。</p>
        )}
        {!candidatesLoading && candidates.length > 0 && visibleCandidates.length === 0 && (
          <p>当前建议类型还没有候选。</p>
        )}
        <div className="paper-suggestion-candidate-list">
          {visibleCandidates.map((candidate) => (
            <PaperSuggestionCandidateCard candidate={candidate} item={item}
              key={candidate.id} onOpenAttachment={onOpenAttachment} />
          ))}
        </div>
      </section>
      </details>
    </details>
  );
}
