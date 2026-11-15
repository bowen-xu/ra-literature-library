import {SystemDocumentDialog} from "@research-assistant/workbench-sdk/settings";
import {FileText as DocumentIcon} from "lucide-react";
import { structuredResourceSources } from "./resources/structuredResourceSources";
import { usePaperStructuredResources } from "./resources/usePaperStructuredResources";
import { StructuredResourceReview } from "./resources/StructuredResourceReview";
import { prepareInitialReadingTemplate } from "./resources/prepareInitialReadingTemplate";
import { useNotificationState } from "@research-assistant/workbench-sdk/feedback";
import type { PaperTemplateSnapshot } from "@research-assistant/core/ai";
import { TemplateReadingRecords } from "./TemplateReadingRecords";
import { PaperPortraitPanel, type PortraitTemplateState } from "./PaperPortraitPanel";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Sparkles, Trash2, RefreshCw, Square } from "lucide-react";
import type { AiCandidate, AiTaskSpecDraft, LlmModelSelection, PaperAnalysisWorkflow } from "@research-assistant/core/ai";
import type { LiteratureItem } from "@research-assistant/core/literature";
import type {
  KnowledgeEpistemicRole,
  PaperReadingProfileSelection,
  StructuredReadingUnitKind,
  StructuredReadingUnit,
} from "@research-assistant/core/knowledge";
import type { ResearchProject } from "@research-assistant/core/project";

import {
  aiAssistanceErrorMessage,
  getAiAssistanceGateway,
  type AiAssistanceGateway,
} from "@research-assistant/workbench-sdk/ai-assistance";
import {
  getResearchKnowledgeGateway,
  researchKnowledgeErrorMessage,
  type ResearchKnowledgeGateway,
} from "../../services/knowledgeGateway";
import { notify } from "@research-assistant/workbench-sdk/feedback";
import { ControlHint } from "@research-assistant/workbench-sdk/overlay";
import { ContentTrustIndicator } from "@research-assistant/workbench-sdk/ui";
import { publishPaperReadingChanged, subscribePaperReadingChanged } from "./readingPanelEvents";
import { invalidatePaperCandidateRequest, loadPaperCandidates } from "./paperCandidateRequests";
import { latestReadingSources, type ReadingFieldSource } from "./readingFieldSources";
import "./PaperOverviewPanel.css";
import { ReadingProfileSelector } from "./ReadingProfileSelector";
import { SourcePdfPicker } from "./SourcePdfPicker";
import { ReadingDisplaySettings, ReadingModelSettings, useReadingTextSize } from "./ReadingPanelSettings";
import { StructuredReadingCandidatePanel } from "./StructuredReadingCandidatePanel";
import { ReadingGenerationDialog } from "./ReadingGenerationDialog";
import { candidateFieldSelection, resolveReadingSelection, readReadingPresentation, saveReadingPresentation, overwriteFieldSelection, mergeReadingSelection, type ReadingPresentation, type ReadingOverwriteScope } from "./readingPresentation";
import { candidateBelongsToPaper } from "./structuredReadingReviewModel";
import { ReferenceVerificationPanel } from "../synthesis/ReferenceVerificationPanel";
import { getDoclingParserGateway, type DoclingParserGateway } from "@research-assistant/workbench-sdk/docling";
import { getLiteratureGateway, type LiteratureGateway } from "../../services/literatureGateway";
import { DoclingDeveloperActions } from "./DoclingDeveloperActions";
import { preparePaperAnalysisAssets } from "./paperAnalysisPreparation";
import { getPaperAnalysisActivity } from "./paperAnalysisActivity";
import { ReadingDetailsLoading, useReadingDetailsReady } from "./ReadingDetailsLoading";

const overviewFields = [
  "research_question", "approach", "key_result", "conclusion", "limitation", "open_question",
  "argument", "objection", "response",
] as const;
type OverviewField = Exclude<StructuredReadingUnitKind, "other">;
type OverviewRole = Exclude<KnowledgeEpistemicRole, "assertion" | "definition">;

const fieldLabels: Readonly<Record<OverviewField, string>> = {
  research_question: "研究问题",
  approach: "方法／论证路径",
  key_result: "关键结果",
  conclusion: "结论",
  limitation: "局限",
  open_question: "开放问题",
  argument: "核心论证",
  objection: "异议／反例",
  response: "回应",
};

interface FieldDraft {
  readonly body: string;
  readonly role: OverviewRole;
  readonly unit?: StructuredReadingUnit;
}

interface PaperOverviewPanelProps {
  readonly onInitialLoadSettled?: (ready: boolean) => void;
  readonly currentAttachmentId?: string;
  readonly onReadingSourcesChanged?: (sources: readonly ReadingFieldSource[]) => void;
  readonly readingHighlightsVisible?: boolean;
  readonly onReadingHighlightsVisibleChanged?: () => void;
  readonly item: LiteratureItem;
  readonly aiGateway?: AiAssistanceGateway;
  readonly doclingGateway?: DoclingParserGateway;
  readonly knowledgeGateway?: ResearchKnowledgeGateway;
  readonly literatureGateway?: LiteratureGateway;
  readonly project?: ResearchProject;
  readonly onOpenAttachment: (attachment: LiteratureItem["attachments"][number]) => void;
  readonly onPaperReviewChanged: () => Promise<void>;
}

function emptyDraft(field: OverviewField): FieldDraft {
  return {
    body: "",
    role: field === "research_question" || field === "open_question" ? "question" : "working_note",
  };
}

export async function launchPaperOverviewRun(
  gateway: Pick<AiAssistanceGateway, "previewTask" | "startRun">,
  task: AiTaskSpecDraft,
) {
  const scope = await gateway.previewTask(task);
  return gateway.startRun({
    ...task,
    confirmedScopeHash: scope.scopeHash,
    ...(scope.requiresCloudConsent ? { cloudConsentVersion: "ai-cloud-consent-v1" } : {}),
  });
}

export async function listOverviewCandidatesForPaper(
  gateway: Pick<AiAssistanceGateway, "listCandidates">,
  paperId: string,
): Promise<readonly AiCandidate[]> {
  const candidates = await loadPaperCandidates(gateway, paperId);
  return candidates.filter((candidate) => candidateBelongsToPaper(candidate, paperId));
}

function aiExtractionLabel(
  phase: "idle" | "preparing" | "parsing" | "rendering" | "extracting",
): string {
  switch (phase) {
    case "preparing": return "准备中";
    case "parsing": return "解析中";
    case "rendering": return "准备图表";
    case "extracting": return "提取中";
    case "idle": return "AI 提取";
  }
}

function latestAttempt(
  workflow: PaperAnalysisWorkflow,
  status?: "failed" | "interrupted" | "succeeded",
): PaperAnalysisWorkflow["turns"][number]["attempts"][number] | undefined {
  return workflow.turns.flatMap((turn) => turn.attempts)
    .filter((attempt) => status === undefined || attempt.status === status)
    .at(-1);
}

function workflowFailureMessage(workflow: PaperAnalysisWorkflow): string {
  const attempt = latestAttempt(workflow, "failed") ?? latestAttempt(workflow, "interrupted");
  return attempt?.errorMessage ?? "论文分析未完成；请查看错误码后决定是否重试。";
}

export function PaperOverviewPanel({
  item,
  ...props
}: PaperOverviewPanelProps): React.JSX.Element {
  return <ScopedPaperOverviewPanel key={item.id} item={item} {...props} />;
}

function ScopedPaperOverviewPanel({
  onInitialLoadSettled,
  currentAttachmentId,
  onReadingSourcesChanged,
  readingHighlightsVisible,
  onReadingHighlightsVisibleChanged,
  aiGateway: providedAiGateway,
  doclingGateway: providedDoclingGateway,
  item,
  knowledgeGateway: providedKnowledgeGateway,
  literatureGateway: providedLiteratureGateway,
  onOpenAttachment,
  onPaperReviewChanged,
}: PaperOverviewPanelProps): React.JSX.Element {
  const [showDocuments,setShowDocuments]=useState(false);
  const [initialRequestsSettled, setInitialRequestsSettled] = useState(false);
  const [referencesReady, setReferencesReady] = useState(false);
  const defaultKnowledgeGateway = useMemo(() => getResearchKnowledgeGateway(), []);
  const defaultAiGateway = useMemo(() => getAiAssistanceGateway(), []);
  const defaultDoclingGateway = useMemo(() => getDoclingParserGateway(), []);
  const defaultLiteratureGateway = useMemo(() => getLiteratureGateway(), []);
  const knowledgeGateway = providedKnowledgeGateway ?? defaultKnowledgeGateway;
  const aiGateway = providedAiGateway ?? defaultAiGateway;
  const doclingGateway = providedDoclingGateway ?? defaultDoclingGateway;
  const literatureGateway = providedLiteratureGateway ?? defaultLiteratureGateway;
  const currentPaperId = useRef(item.id);
  currentPaperId.current = item.id;
  const pdfAttachments = useMemo(
    () => item.attachments.filter(({ mimeType }) => mimeType === "application/pdf"),
    [item.attachments],
  );
  const pdfAttachmentIdsKey = pdfAttachments.map(({ id }) => id).join("|");
  const [drafts, setDrafts] = useState<Readonly<Record<OverviewField, FieldDraft>>>(() =>
    Object.fromEntries(overviewFields.map((field) => [field, emptyDraft(field)])) as Record<OverviewField, FieldDraft>);
  const [activeFields, setActiveFields] = useState<readonly OverviewField[]>(
    overviewFields.slice(0, 6),
  );
  const [aiProfileSelection, setAiProfileSelection] = useState<PaperReadingProfileSelection>();
  const [modelSelection, setModelSelection] = useState<LlmModelSelection>();
  const draftResourceId = useRef(crypto.randomUUID());
  const [readingTextSize, setReadingTextSize] = useReadingTextSize();
  const [editingField, setEditingField] = useState<OverviewField>();
  const [editingValue, setEditingValue] = useState("");
  const unified = usePaperStructuredResources(item.id);
  const canonicalBlocked = unified.available && (unified.loading || !!unified.error || !unified.reading);
  const [attachmentIds, setAttachmentIds] = useState<readonly string[]>(
    pdfAttachments[0] === undefined ? [] : [pdfAttachments[0].id],
  );
  const [legacyPaperTemplate, setPaperTemplate] = useState<PaperTemplateSnapshot>();
  const paperTemplate=unified.available ? unified.template : legacyPaperTemplate;
  const [portraitTemplateState, setPortraitTemplateState] = useState<PortraitTemplateState>("loading");
  const [allFormalUnits, setAllFormalUnits] = useState<readonly StructuredReadingUnit[]>([]);
  const handleConfirmedTemplate = useCallback((template: PaperTemplateSnapshot | undefined, state: PortraitTemplateState) => {
    setPaperTemplate(template); setPortraitTemplateState(state);
  }, []);
  const [analysisCandidates, setAnalysisCandidates] = useState<readonly AiCandidate[]>([]);
  const [analysisWorkflow, setAnalysisWorkflow] = useState<PaperAnalysisWorkflow>();
  const [presentation, setPresentation] = useState<ReadingPresentation | undefined>(() => unified.available ? undefined : readReadingPresentation(item.id));
  const [generationDialog, setGenerationDialog] = useState<"regenerate" | "clear">();
  const generationButtonRef = useRef<HTMLButtonElement>(null);
  const clearButtonRef = useRef<HTMLButtonElement>(null);
  const [generationHovered, setGenerationHovered] = useState(false);
  const [mutationBusy, setBusy] = useState(false);
  const analysisActivity = useMemo(() => getPaperAnalysisActivity(aiGateway, item.id), [aiGateway, item.id]);
  const activity = useSyncExternalStore(analysisActivity.subscribe, analysisActivity.getSnapshot);
  const busy = mutationBusy || activity.phase !== "idle";
  const cancelRequested = activity.cancelRequested;
  const [overviewCandidateError, setOverviewCandidateError] = useNotificationState("error");

  async function loadManualOverview(): Promise<void> {
    const units = await knowledgeGateway.listReadingUnits(undefined, item.id);
    applyManualOverview(units);
  }

  function applyManualOverview(units: readonly StructuredReadingUnit[]): void {
    if (currentPaperId.current !== item.id) return;
    setAllFormalUnits(units);
    const next = Object.fromEntries(overviewFields.map((field) => {
      const unit = units.find((candidate) => candidate.unitKind === field && candidate.templateField === undefined);
      return [field, unit === undefined ? emptyDraft(field) : {
        body: unit.body,
        role: unit.epistemicRole,
        unit,
      }];
    })) as Record<OverviewField, FieldDraft>;
    setDrafts(next);
  }

  const candidateRequest = useRef(0);
  async function loadAnalysisCandidates(): Promise<readonly AiCandidate[]> {
    const request = ++candidateRequest.current;
    try {
      const candidates = (await loadPaperCandidates(aiGateway, item.id)).filter((candidate) =>
        candidateBelongsToPaper(candidate, item.id));
      if (currentPaperId.current === item.id && request === candidateRequest.current) {
        setAnalysisCandidates(candidates);
        setOverviewCandidateError(undefined);
      }
      return candidates;
    } catch (reason: unknown) {
      if (currentPaperId.current === item.id && request === candidateRequest.current) {
        setAnalysisCandidates([]);
        setOverviewCandidateError(`无法读取本论文 AI 候选：${aiAssistanceErrorMessage(reason)}`);
      }
      throw reason;
    }
  }

  useEffect(() => {
    let active = true;
    if (!unified.available) setPresentation(readReadingPresentation(item.id));
    setGenerationDialog(undefined);
    setAiProfileSelection(undefined);
    setOverviewCandidateError(undefined);
    const manual = loadManualOverview().catch((reason: unknown) => {
      if (active) notify.error(researchKnowledgeErrorMessage(reason));
    });
    const candidates = loadAnalysisCandidates().catch(() => undefined);
    const workflow = aiGateway.getLatestPaperAnalysisWorkflow(item.id).then((workflow) => {
      if (active) { setAnalysisWorkflow(workflow); analysisActivity.adopt(workflow); }
    }).catch(() => undefined);
    void Promise.allSettled([manual, candidates, workflow]).then(() => {
      if (active) setInitialRequestsSettled(true);
    });
    return () => { active = false; candidateRequest.current++; };
  }, [aiGateway, item.id, knowledgeGateway, unified.available]);

  useEffect(() => subscribePaperReadingChanged(item.id, () => {
    if (!unified.available) setPresentation(readReadingPresentation(item.id));
    void loadAnalysisCandidates().catch(() => undefined);
    void loadManualOverview().catch(reason => notify.error(researchKnowledgeErrorMessage(reason)));
    void aiGateway.getLatestPaperAnalysisWorkflow(item.id).then(workflow => {
      if (currentPaperId.current === item.id) setAnalysisWorkflow(workflow);
      analysisActivity.adopt(workflow);
    }).catch(() => undefined);
  }, draftResourceId.current), [aiGateway, item.id, knowledgeGateway, unified.available]);
  async function readingSaved(): Promise<void> {
    invalidatePaperCandidateRequest(aiGateway, item.id);
    await Promise.all([loadManualOverview(), loadAnalysisCandidates()]); publishPaperReadingChanged(item.id, draftResourceId.current);
  }

  useEffect(() => {
    setAttachmentIds(pdfAttachments[0] === undefined ? [] : [pdfAttachments[0].id]);
  }, [item.id]);

  useEffect(() => {
    const availableIds = new Set(pdfAttachments.map(({ id }) => id));
    setAttachmentIds((current) => current.filter((id) => availableIds.has(id)));
  }, [pdfAttachmentIdsKey]);

  const handleProfileSelectionChanged = useCallback((
    fields: readonly StructuredReadingUnitKind[],
    confirmedSelection?: PaperReadingProfileSelection,
  ) => {
    const next = overviewFields.filter((field) => fields.includes(field));
    setActiveFields((current) => current.length === next.length
      && current.every((field, index) => field === next[index]) ? current : next);
    setAiProfileSelection(confirmedSelection);
  }, []);

  function updatePresentation(value: ReadingPresentation): boolean {
    try { saveReadingPresentation(item.id, value); if (currentPaperId.current === item.id) setPresentation(value); publishPaperReadingChanged(item.id, draftResourceId.current); return true; }
    catch (reason) { notify.error(`无法保存阅读显示设置：${aiAssistanceErrorMessage(reason)}`); return false; }
  }
  async function clearReading(): Promise<void> {
    if (busy || canonicalBlocked) return;
    if (!unified.available) {
      if (updatePresentation({fields: [], hiddenUnitIds: allFormalUnits.map(unit => unit.id)}))
        notify.success("结构化阅读记录已清空，操作记录保留。");
      return;
    }
    const reading = unified.reading;
    if (!reading) return;
    setBusy(true);
    try {
      const cleared = await unified.gateway.review({resourceId: reading.id,
        expectedRevision: reading.revision, requestId: crypto.randomUUID(), action: "clear"});
      if (currentPaperId.current === item.id) unified.changed(cleared);
      notify.success("结构化阅读记录已清空，操作记录与模板绑定保留。");
    } catch (reason) {
      notify.error(`无法清空结构化阅读记录：${aiAssistanceErrorMessage(reason)}`);
    } finally { setBusy(false); }
  }
  async function startAiExtraction(scope?: ReadingOverwriteScope): Promise<void> {
    if (busy) return;
    if (canonicalBlocked) {
      notify.info("统一阅读资源尚未恢复，请先等待加载完成或重试迁移。原内容保持不变。");
      return;
    }
    const previousSelection = selectedReadingFields;
    const targets = scope === undefined ? [] : overwriteFieldSelection(previousSelection, analysisCandidates, scope, allFormalUnits);
    if (scope !== undefined && targets.length === 0 && previousSelection.length > 0) { notify.info("所选范围没有可覆盖的阅读数据。"); return; }
    if (scope !== undefined && scope !== "all" && targets.length === 0) { notify.info("所选范围没有可覆盖的阅读数据。"); return; }
    const previousPresentation = { fields: previousSelection, hiddenUnitIds: presentation?.hiddenUnitIds ?? [] };

    if (attachmentIds.length === 0) {
      notify.warning("请至少选择一个来源 PDF");
      return;
    }
    if (!unified.available && paperTemplate === undefined && (aiProfileSelection === undefined || aiProfileSelection.profiles.length === 0)) {
      notify.info(portraitTemplateState === "rejected" ? "当前文献画像已丢弃，历史模板不会用于提取。请重新生成画像，或选择阅读框架。"
        : portraitTemplateState === "unconfirmed" ? "当前画像没有可用模板。请重新生成画像，或选择阅读框架后提取。"
        : portraitTemplateState === "loading" ? "正在读取文献画像，请稍后重试。"
        : portraitTemplateState === "error" ? "文献画像读取失败，请重试读取画像，或选择阅读框架后提取。"
        : "请先生成文献画像，或选择一个结构化阅读框架。");
      return;
    }
    const clientRequestId = analysisActivity.begin();
    if (clientRequestId === undefined) return;
    if (!unified.available && !updatePresentation(previousPresentation)) { analysisActivity.finish(clientRequestId); return; }
    try {
      const extractionTemplate=unified.available&&paperTemplate===undefined
        ?await prepareInitialReadingTemplate(unified.gateway,item.id):paperTemplate;
      if(analysisActivity.isCanceled(clientRequestId))return;
      const imageAssets = await preparePaperAnalysisAssets({
        aiGateway,
        attachmentIds,
        doclingGateway,
        isCanceled: () => analysisActivity.isCanceled(clientRequestId),
        literatureGateway,
        paperId: item.id,
        setPhase: phase => analysisActivity.phase(clientRequestId, phase),
      });
      if (imageAssets === undefined) return;
      analysisActivity.phase(clientRequestId, "extracting");
      const workflow = await aiGateway.startPaperAnalysis({
        clientRequestId,
        ...(analysisCandidates.length === 0 ? {} : { regenerate: true }),
        paperId: item.id,
        attachmentIds,
        overviewProfileSelectionRevision: extractionTemplate === undefined ? aiProfileSelection?.revision ?? 0 : 0,
        ...(extractionTemplate === undefined ? {} : { paperTemplateRef: "templateResourceId" in extractionTemplate ? {templateResourceId:extractionTemplate.templateResourceId,templateResourceRevision:extractionTemplate.templateResourceRevision} : {portraitCandidateId:extractionTemplate.portraitCandidateId,portraitRevision:extractionTemplate.portraitRevision} }),
        ...(modelSelection === undefined ? {} : { modelSelection }),
        imageAssets,
      });
      if (currentPaperId.current === item.id) setAnalysisWorkflow(workflow);
      invalidatePaperCandidateRequest(aiGateway, item.id);
      const refreshed = await loadAnalysisCandidates();
      if (workflow.status !== "canceled" && workflow.status !== "failed" && !analysisActivity.isCanceled(clientRequestId) && workflow.turns.some(turn => turn.kind === "paper_overview" && turn.status === "succeeded")) {
        const generated = refreshed.find(candidate => candidate.id === workflow.turns.find(turn => turn.kind === "paper_overview")?.candidateId);
        if (!unified.available && generated !== undefined) {
          // Preserve any field edited or reviewed while the provider was running.
          const refreshedUnits = await knowledgeGateway.listReadingUnits(undefined, item.id);
          applyManualOverview(refreshedUnits);
          const unchangedUnit = (id: string): boolean => allFormalUnits.find(unit => unit.id === id)?.revision === refreshedUnits.find(unit => unit.id === id)?.revision;
          const safeTargets = targets.filter(target => {
            const before = analysisCandidates.find(candidate => candidate.id === target.candidateId);
            const after = refreshed.find(candidate => candidate.id === target.candidateId);
            return before?.currentRevision === after?.currentRevision && JSON.stringify(before?.overviewFieldConfirmations) === JSON.stringify(after?.overviewFieldConfirmations)
              && (before?.overviewFieldConfirmations.filter(value => value.fieldKind === target.fieldId).every(value => unchangedUnit(value.targetReadingUnitId)) ?? true);
          });
          const replacedUnits = allFormalUnits.filter(unit => unchangedUnit(unit.id) && (scope === "all" && !analysisCandidates.some(candidate => candidate.overviewFieldConfirmations.some(value => value.targetReadingUnitId === unit.id))
            || safeTargets.some(target => analysisCandidates.find(candidate => candidate.id === target.candidateId)?.overviewFieldConfirmations.some(value => value.fieldKind === target.fieldId && value.targetReadingUnitId === unit.id))));
          const protectedFields = new Set(refreshedUnits.filter(unit => !unchangedUnit(unit.id)).map(unit => unit.templateField?.fieldId ?? unit.unitKind));
          const nextFields = scope === undefined || previousSelection.length === 0 ? candidateFieldSelection(generated) : mergeReadingSelection(previousSelection, generated, safeTargets);
          updatePresentation({ fields: nextFields.filter(field => !protectedFields.has(field.fieldId) || previousSelection.some(previous => previous.candidateId === field.candidateId && previous.fieldId === field.fieldId)), hiddenUnitIds: [...new Set([...previousPresentation.hiddenUnitIds, ...replacedUnits.map(unit => unit.id)])] });
        }
      }
      publishPaperReadingChanged(item.id, draftResourceId.current);
      if (workflow.status === "canceled") {
        notify.info("论文分析已取消；已完成的结构化阅读候选会保留。");
      } else if (workflow.status === "failed") {
        notify.error(workflowFailureMessage(workflow));
      } else notify.success("结构化阅读已完成。");
    } catch (reason) {
      if (typeof reason === "object" && reason !== null && "code" in reason
        && (reason.code === "data_operation_outcome_unknown" || reason.code === "ai_run_terminal_outcome_unknown")) {
        const message = aiAssistanceErrorMessage(reason);
        analysisActivity.unknown(clientRequestId, message);
        notify.error(message);
      }
      else if (analysisActivity.isCanceled(clientRequestId)) notify.info("论文分析已取消。");
      else notify.error(aiAssistanceErrorMessage(reason));
    }
    finally {
      void unified.reload();
      analysisActivity.finish(clientRequestId);
    }
  }

  async function cancelAnalysis(): Promise<void> {
    if (activity.phase === "idle" || activity.phase === "unknown" || cancelRequested) return;
    try {
      const accepted = await analysisActivity.cancel();
      if (accepted === undefined || analysisActivity.getSnapshot().phase === "unknown") return;
      notify.info(accepted
        ? "正在取消当前论文分析阶段；已完成结果会保留。"
        : "将在当前本地准备步骤完成后停止，不会启动新的模型请求。");
    } catch (reason) {
      if (analysisActivity.getSnapshot().phase !== "unknown") notify.error(aiAssistanceErrorMessage(reason));
    }
  }

  function beginEditing(field: OverviewField): void {
    if (busy) return;
    setEditingField(field);
    setEditingValue(drafts[field].body);
  }

  function cancelEditing(): void {
    setEditingField(undefined);
    setEditingValue("");
  }

  async function saveEditedField(field: OverviewField): Promise<void> {
    if (editingField !== field || busy) return;
    const current = drafts[field];
    const body = editingValue.trim();
    if (body === current.body.trim()) {
      cancelEditing();
      return;
    }
    if (body === "") {
      notify.warning("结构化阅读字段不能为空；如需删除请使用后续的删除操作。");
      return;
    }
    setBusy(true);
    try {
      await knowledgeGateway.saveReadingUnit({
        ...(current.unit === undefined ? {} : { id: current.unit.id, expectedRevision: current.unit.revision }),
        paperId: item.id,
        unitKind: field,
        title: `结构化阅读 · ${fieldLabels[field]}`,
        body,
        epistemicRole: current.role,
        changeReason: current.unit === undefined ? "manual_structured_reading_create" : "manual_structured_reading_edit",
      });
      await loadManualOverview();
      cancelEditing();
      publishPaperReadingChanged(item.id, draftResourceId.current);
      notify.success(`${fieldLabels[field]}已保存`);
    } catch (reason: unknown) {
      notify.error(researchKnowledgeErrorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  const displayedFields = activeFields.length > 0
    ? activeFields
    : overviewFields.filter((field) => drafts[field].unit !== undefined);
  const formalUnits = overviewFields.flatMap((field) => drafts[field].unit === undefined ? [] : [drafts[field].unit]);
  const latestReading = [...analysisCandidates].filter(candidate => candidateBelongsToPaper(candidate, item.id) && candidate.reviewState !== "rejected").sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const selectedReadingFields = useMemo(() => resolveReadingSelection(unified.available ? undefined : presentation, analysisCandidates, latestReading), [unified.available, presentation, analysisCandidates, latestReading]);
  const hasReading = unified.available ? !!unified.reading && unified.reading.content !== null : selectedReadingFields.length > 0 || allFormalUnits.some(unit => !(presentation?.hiddenUnitIds ?? []).includes(unit.id));
  const inlineUnitIds = analysisCandidates.flatMap(candidate => candidate.overviewFieldConfirmations.filter(value => value.active || value.reviewResetAt !== undefined).map(value => value.targetReadingUnitId));
  const visibleUnits = allFormalUnits.filter(unit => !(presentation?.hiddenUnitIds ?? []).includes(unit.id));
  const failedAttempt = analysisWorkflow?.status === "failed"
    ? latestAttempt(analysisWorkflow, "failed") ?? latestAttempt(analysisWorkflow, "interrupted")
    : undefined;
  const readingSources = useMemo(() => {
    if(unified.reading)return structuredResourceSources(unified.reading.id,unified.reading.content,unified.sources);
    if(unified.available)return [];
    return analysisCandidates.flatMap(candidate => latestReadingSources([candidate], item.id, paperTemplate).filter(source => selectedReadingFields.some(field => field.candidateId === candidate.id && field.fieldId === source.fieldId)));
  }, [analysisCandidates, item.id, paperTemplate, selectedReadingFields,unified.available,unified.reading,unified.sources]);
  useEffect(() => { onReadingSourcesChanged?.(readingSources); }, [onReadingSourcesChanged, readingSources]);
  const detailsReady = useReadingDetailsReady(initialRequestsSettled && !unified.loading && portraitTemplateState !== "loading" && referencesReady, onInitialLoadSettled);

  return <div className="paper-reading-details" aria-busy={!detailsReady}>
    {!detailsReady && <ReadingDetailsLoading />}
    <section hidden={!detailsReady} className="paper-overview-panel structured-reading-panel" data-reading-text-size={readingTextSize}>
    <SourcePdfPicker headerActions={<><DoclingDeveloperActions gateway={doclingGateway} item={item} /><ReadingModelSettings gateway={aiGateway} busy={busy} onSelection={setModelSelection} /></>} attachments={pdfAttachments} busy={busy} {...(currentAttachmentId === undefined ? {} : { currentAttachmentId })} onOpen={onOpenAttachment} onSelectionChange={setAttachmentIds} selectedAttachmentIds={attachmentIds} />
    <PaperPortraitPanel resourceManaged={unified.available} resourceBlocked={unified.loading || !!unified.error} key={item.id} item={item} gateway={aiGateway} selectedAttachmentIds={attachmentIds} onSourceSelectionChanged={setAttachmentIds} onConfirmedTemplateChanged={handleConfirmedTemplate} {...(unified.portrait ? {managedResource:unified.portrait,resourceGateway:unified.gateway,onResourceChanged:unified.changed,...(unified.paperTemplate ? {paperTemplateResource:unified.paperTemplate} : {})} : {})} />
    {unified.available && !unified.loading && (unified.error || !unified.reading) && <div role="alert">
      <p>{unified.error ?? "统一阅读资源尚未就绪。"} 原内容已保留，恢复前暂停生成。</p>
      <button type="button" onClick={() => void unified.reload()}>重试迁移阅读内容</button>
    </div>}
    {showDocuments && <SystemDocumentDialog workflow="reading" onClose={()=>setShowDocuments(false)}/>}
    <header className="structured-reading-header">
      <div><h3>结构化阅读记录{!hasReading && "（待生成）"}</h3></div>
      <div className="structured-reading-header-actions">
        <ControlHint content="打开阅读指令文档"><button type="button" className="reading-icon-action" aria-label="打开阅读指令文档" onClick={()=>setShowDocuments(true)}><DocumentIcon size={15}/></button></ControlHint>
        {hasReading && <ControlHint content="清空结构化阅读记录"><button type="button" className="reading-icon-action" aria-label="清空结构化阅读记录" disabled={busy} ref={clearButtonRef} onClick={() => setGenerationDialog("clear")}><Trash2 size={15} aria-hidden="true" /></button></ControlHint>}
        {activity.phase === "unknown" ? <ControlHint content="提取结果待核对"><button aria-label="提取结果待核对" disabled className="structured-reading-ai-action" type="button"><Sparkles aria-hidden="true" size={15} /></button></ControlHint>
        : activity.phase !== "idle" ? <ControlHint content={cancelRequested ? "正在取消" : "取消提取"}><button className="reading-icon-action structured-reading-cancel-action" aria-label={cancelRequested ? "正在取消" : "取消提取"} disabled={cancelRequested}
          onClick={() => void cancelAnalysis()} type="button">
          <Square aria-hidden="true" size={15} fill="currentColor" />
        </button></ControlHint> : <ControlHint content={hasReading ? "重新生成结构化阅读" : "提取结构化阅读"}><button aria-label={hasReading ? "重新生成结构化阅读" : "提取结构化阅读"} disabled={mutationBusy || canonicalBlocked} className="structured-reading-ai-action" ref={generationButtonRef}
          onMouseEnter={() => setGenerationHovered(true)} onMouseLeave={() => setGenerationHovered(false)} onFocus={() => setGenerationHovered(true)} onBlur={() => setGenerationHovered(false)}
          onClick={() => hasReading ? setGenerationDialog("regenerate") : void startAiExtraction()} type="button">
          {hasReading && generationHovered ? <RefreshCw aria-hidden="true" size={15} /> : <Sparkles aria-hidden="true" size={15} />}
        </button></ControlHint>}
        <ReadingDisplaySettings textSize={readingTextSize} onTextSizeChanged={setReadingTextSize} highlightsVisible={readingHighlightsVisible} onHighlightsChanged={onReadingHighlightsVisibleChanged} />
      </div>
    </header>
    {generationDialog !== undefined && <ReadingGenerationDialog mode={generationDialog} finalFocus={generationDialog === "clear" ? clearButtonRef : generationButtonRef} onClose={() => setGenerationDialog(undefined)} onConfirm={scope => {
      const mode = generationDialog; setGenerationDialog(undefined);
      if (mode === "clear") void clearReading();
      else void startAiExtraction(scope);
    }} />}
    {activity.phase === "unknown" && <p role="alert">{activity.error}</p>}
    {busy && activity.phase !== "unknown" && (
      <div aria-live="polite" className="structured-reading-run-progress">
        <small><b>{aiExtractionLabel(activity.phase)}</b> · AI 正在按冻结论文上下文生成结构化阅读。</small>
      </div>
    )}
    {analysisWorkflow?.status === "failed" && !analysisWorkflow.turns.some(turn => turn.kind === "paper_overview" && turn.status === "succeeded") && <div className="structured-reading-workflow-error" role="alert">
      <span>{workflowFailureMessage(analysisWorkflow)}</span>
      <details>
        <summary>调试详情</summary>
        <small>turn {analysisWorkflow.turns.find((turn) => turn.status === "failed" || turn.status === "interrupted")?.kind ?? "unknown"}
          {failedAttempt?.aiRunId === undefined ? "" : ` · run ${failedAttempt.aiRunId}`}
          {failedAttempt?.errorCode === undefined ? "" : ` · ${failedAttempt.errorCode}`}</small>
      </details>
    </div>}
    {!unified.available && paperTemplate === undefined && <ReadingProfileSelector busy={busy} gateway={knowledgeGateway} onSelectionChanged={handleProfileSelectionChanged} paperId={item.id} />}
    {overviewCandidateError !== undefined && <button onClick={() => void loadAnalysisCandidates().catch(() => undefined)} type="button">重试读取候选</button>}
    {unified.reading ? <StructuredResourceReview resource={unified.reading} gateway={unified.gateway} onChanged={unified.changed}/> : !unified.available && <StructuredReadingCandidatePanel
      fieldSelection={selectedReadingFields}
      template={paperTemplate}
      candidates={analysisCandidates.filter((candidate) => candidateBelongsToPaper(candidate, item.id))}
      formalUnits={visibleUnits}
      knowledgeGateway={knowledgeGateway}
      gateway={aiGateway}
      item={item}
      onCandidatesChanged={(update) => { setAnalysisCandidates((current) => {
        const overview = current.filter((candidate) => candidateBelongsToPaper(candidate, item.id));
        const next = typeof update === "function" ? update(overview) : update;
        return [...current.filter((candidate) => !candidateBelongsToPaper(candidate, item.id)), ...next];
      }); publishPaperReadingChanged(item.id, draftResourceId.current); }}
      onKnowledgeChanged={readingSaved}
      onPaperReviewChanged={onPaperReviewChanged}
    />}
    {!unified.available && hasReading && <TemplateReadingRecords candidates={analysisCandidates} aiGateway={aiGateway} template={paperTemplate} units={visibleUnits} excludedUnitIds={inlineUnitIds} gateway={knowledgeGateway} onSaved={readingSaved} />}
    {!unified.available && hasReading && (paperTemplate !== undefined && formalUnits.length === 0 ? null : displayedFields.length === 0 ? <p className="structured-reading-empty">生成画像后可按本文模板提取，也可先选择通用阅读框架。</p> : <div className="structured-reading-fields">
      {displayedFields.filter(field => drafts[field].unit !== undefined && visibleUnits.some(unit => unit.id === drafts[field].unit?.id)).filter(field => !inlineUnitIds.includes(drafts[field].unit?.id ?? "")).filter(field => drafts[field].unit !== undefined || !analysisCandidates.some(candidate => candidate.reviewState !== "rejected" && (() => { const payload = candidate.revisions.find(value => value.revision === candidate.currentRevision)?.payload; return payload?.kind === "paper_overview_unit_v1" && payload.paperTemplate === undefined && payload.fields.some(value => value.field === field); })())).map((field) => {
        const draft = drafts[field];
        const isEditing = editingField === field;
        return <article className="structured-reading-field" data-reading-field={field} key={field} onDoubleClick={() => beginEditing(field)} onKeyDown={(event) => {
          if (event.target === event.currentTarget && (event.key === "Enter" || event.key === "F2")) { event.preventDefault(); beginEditing(field); }
        }} tabIndex={0}>
          <header><div><ContentTrustIndicator showHint size="small" status={draft.unit === undefined ? "neutral" : "trusted"} subjectLabel={fieldLabels[field]} /><b>{fieldLabels[field]}</b></div></header>
          {isEditing ? <textarea autoFocus disabled={busy} onBlur={() => void saveEditedField(field)} onChange={(event) => setEditingValue(event.target.value)} onKeyDown={(event) => {
            if (event.key === "Escape") { event.preventDefault(); cancelEditing(); }
            else if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) { event.preventDefault(); void saveEditedField(field); }
          }} rows={4} value={editingValue} /> : <p>{draft.body.trim() === "" ? "未填写" : draft.body}</p>}
        </article>;
      })}
    </div>)}
    <ReferenceVerificationPanel doclingGateway={doclingGateway} item={item} onOpenAttachment={onOpenAttachment} onInitialLoadSettled={setReferencesReady} />
  </section></div>;
}
