import { useState, type CSSProperties, type Dispatch, type SetStateAction } from "react";
import { Check } from "lucide-react";
import { overviewFieldTitle, type PaperTemplateSnapshot, type AiCandidate, type OverviewFieldId, type PaperOverviewUnitCandidateV1 } from "@research-assistant/core/ai";
import type { LiteratureItem } from "@research-assistant/core/literature";
import type { StructuredReadingUnit } from "@research-assistant/core/knowledge";
import { ContentTrustIndicator } from "@research-assistant/workbench-sdk/ui";
import { ControlHint } from "@research-assistant/workbench-sdk/overlay";
import type { AiAssistanceGateway } from "@research-assistant/workbench-sdk/ai-assistance";
import { aiAssistanceErrorMessage } from "@research-assistant/workbench-sdk/ai-assistance";
import { notify } from "@research-assistant/workbench-sdk/feedback";
import { ReadingRecord } from "./TemplateReadingRecords";
import type { ResearchKnowledgeGateway } from "../../services/knowledgeGateway";
import { OverviewFieldSources } from "./OverviewFieldSources";
import { overviewFieldTrustStatus, overviewPayload } from "./structuredReadingReviewModel";
import { ReadingReviewHeading } from "./ReadingReviewHeading";
import { readingFieldColor } from "./readingFieldSources";

interface StructuredReadingCandidatePanelProps {
  readonly fieldSelection?: readonly import("./readingPresentation").ReadingFieldSelection[];
  readonly template?: PaperTemplateSnapshot | undefined;
  readonly candidates: readonly AiCandidate[];
  readonly formalUnits: readonly StructuredReadingUnit[];
  readonly gateway: AiAssistanceGateway;
  readonly knowledgeGateway?: ResearchKnowledgeGateway;
  readonly item: LiteratureItem;
  readonly onCandidatesChanged: Dispatch<SetStateAction<readonly AiCandidate[]>>;
  readonly onKnowledgeChanged: () => Promise<void>;
  readonly onPaperReviewChanged: () => Promise<void>;
}

/** AI reading is usable immediately. Reviewing is an optional, audited human action. */
export function StructuredReadingCandidatePanel({ candidates, formalUnits, gateway, knowledgeGateway, onCandidatesChanged, onKnowledgeChanged, template, fieldSelection }: StructuredReadingCandidatePanelProps): React.JSX.Element | null {
  const [editing, setEditing] = useState<{ candidateId: string; fieldKind: OverviewFieldId; value: string }>();
  const [busy, setBusy] = useState(false);
  const visible = candidates.filter(candidate => candidate.reviewState !== "rejected")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (visible.length === 0) return null;
  function replace(updated: AiCandidate): void {
    onCandidatesChanged(current => current.map(candidate => candidate.id === updated.id ? updated : candidate));
  }
  async function revise(candidate: AiCandidate, fieldKind: OverviewFieldId): Promise<void> {
    if (editing?.candidateId !== candidate.id || editing.fieldKind !== fieldKind || busy) return;
    const payload = overviewPayload(candidate);
    const target = payload?.fields.find(field => field.field === fieldKind);
    if (payload === undefined || target === undefined || target.statements.length === 0) return;
    const next = editing.value.trim();
    if (next === target.statements.map(statement => statement.text.trim()).filter(Boolean).join("\n\n")) { setEditing(undefined); return; }
    if (next === "") { notify.warning("结构化阅读字段不能为空"); return; }
    const evidenceItemIds = [...new Set(target.statements.flatMap(statement => statement.evidenceItemIds))];
    const nextPayload: PaperOverviewUnitCandidateV1 = { ...payload, fields: payload.fields.map(field => field !== target ? field : { ...field,
      statements: [{ ...target.statements[0]!, text: next, evidenceItemIds,
        ...(target.statements.some(statement => statement.evidenceQuotes !== undefined) ? { evidenceQuotes: [...new Map(target.statements.flatMap(statement => statement.evidenceQuotes ?? []).map(source => [source.evidenceItemId, source])).values()] } : {}) }] }) };
    setBusy(true);
    try {
      replace(await gateway.reviseCandidate({ candidateId: candidate.id, expectedRevision: candidate.currentRevision, payload: nextPayload, changeReason: `human_structured_reading_edit:${fieldKind}` }));
      setEditing(undefined); notify.success("阅读内容已保存。");
    } catch (reason) { notify.error(aiAssistanceErrorMessage(reason)); }
    finally { setBusy(false); }
  }
  async function review(candidate: AiCandidate, fieldKind: OverviewFieldId): Promise<void> {
    setBusy(true);
    try {
      const result = await gateway.confirmOverviewFields({ candidateId: candidate.id, candidateRevision: candidate.currentRevision,
        fieldKinds: [fieldKind], scopeKind: "field", idempotencyKey: crypto.randomUUID() });
      replace(result.candidate); await onKnowledgeChanged(); notify.success("已标为人工审核。");
    } catch (reason) { notify.error(aiAssistanceErrorMessage(reason)); }
    finally { setBusy(false); }
  }
  function render(candidate: AiCandidate, onlyField?: OverviewFieldId): React.JSX.Element | null {
    const payload = overviewPayload(candidate);
    if (payload === undefined) return null;
    const closed = ["accepted_unchanged", "accepted_after_edit"].includes(candidate.reviewState);
    const fields = payload.fields.filter(field => (onlyField === undefined || field.field === onlyField) && (fieldSelection === undefined || fieldSelection.some(value => value.candidateId === candidate.id && value.fieldId === field.field)));
    if (fields.length === 0) return null;
    return <article className="structured-reading-candidate" key={`${candidate.id}:${onlyField ?? "version"}`}>
      {fields.map(field => {
        const confirmation = [...candidate.overviewFieldConfirmations].filter(value => (value.active || value.reviewResetAt !== undefined) && value.fieldKind === field.field).sort((a, b) => Number(b.active) - Number(a.active) || b.targetAppliedRevision - a.targetAppliedRevision)[0];
        const unit = formalUnits.find(value => value.id === confirmation?.targetReadingUnitId);
        if (unit !== undefined && knowledgeGateway !== undefined) return <ReadingRecord key={field.field} unit={unit} gateway={knowledgeGateway} onSaved={onKnowledgeChanged} candidates={candidates} aiGateway={gateway} color={template?.fields.find(value => value.id === field.field)?.color} />;
        const title = overviewFieldTitle(payload, field.field);
        const body = field.statements.map(statement => statement.text.trim()).filter(Boolean).join("\n\n");
        const isEditing = editing?.candidateId === candidate.id && editing.fieldKind === field.field;
        const status = body === "" ? "neutral" : overviewFieldTrustStatus(candidate, field.field);
        function begin(): void { if (!busy && !closed && confirmation?.active !== true && body !== "") setEditing({ candidateId: candidate.id, fieldKind: field.field, value: body }); }
        return <section className="structured-reading-candidate-field reading-category-card" style={{ "--reading-field-color": readingFieldColor(field.field, template?.fields.find(value => value.id === field.field)?.color ?? payload.paperTemplate?.fields.find(value => value.id === field.field)?.color) } as CSSProperties} key={field.field} data-review-candidate={candidate.id} data-review-field={field.field}
          tabIndex={0} onKeyDown={event => { if (event.target === event.currentTarget && (event.key === "Enter" || event.key === "F2")) { event.preventDefault(); begin(); } }}>
          <ReadingReviewHeading label={title} candidate={candidate} confirmation={confirmation} gateway={gateway} onChanged={replace} onSaved={onKnowledgeChanged} busy={busy}><div><ContentTrustIndicator showHint size="small" status={status} subjectLabel={title} statusLabel={status === "untrusted" ? "AI 生成，未人工审核" : status === "reviewable" ? "人工编辑" : status === "trusted" ? "人工已审核" : "未找到内容"} /><b>{title}</b></div><div>
            {!closed && confirmation === undefined && body !== "" && <ControlHint content="标为人工已审核"><button type="button" className="reading-icon-action" aria-label={`${title}标为已审核`} disabled={busy || editing !== undefined} onClick={() => void review(candidate, field.field)}><Check size={14} aria-hidden="true" /></button></ControlHint>}
          </div></ReadingReviewHeading>
          {isEditing ? <textarea autoFocus rows={4} disabled={busy} value={editing.value} onChange={event => setEditing({ ...editing, value: event.target.value })} onBlur={() => void revise(candidate, field.field)} onKeyDown={event => {
            if (event.key === "Escape") { event.preventDefault(); setEditing(undefined); }
            else if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) { event.preventDefault(); void revise(candidate, field.field); }
          }} /> : <p onDoubleClick={begin}>{body || "已读取材料中未找到"}</p>}
          <OverviewFieldSources inline candidate={candidate} field={field} gateway={gateway} onChanged={replace} />
        </section>;
      })}
    </article>;
  }
  return <section className="structured-reading-candidates" aria-label="结构化阅读内容">
    {fieldSelection === undefined ? render(visible[0]!) : fieldSelection.map(field => { const candidate = visible.find(value => value.id === field.candidateId); return candidate === undefined ? null : render(candidate, field.fieldId); })}
  </section>;
}
