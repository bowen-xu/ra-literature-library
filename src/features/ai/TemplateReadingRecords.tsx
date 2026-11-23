import { Check } from "lucide-react";
import { ControlHint } from "@research-assistant/workbench-sdk/overlay";
import { aiAssistanceErrorMessage } from "@research-assistant/workbench-sdk/ai-assistance";
import { useState, type CSSProperties } from "react";
import type { PaperTemplateSnapshot, AiCandidate } from "@research-assistant/core/ai";
import type { StructuredReadingUnit } from "@research-assistant/core/knowledge";
import type { ResearchKnowledgeGateway } from "../../services/knowledgeGateway";
import { researchKnowledgeErrorMessage } from "../../services/knowledgeGateway";
import { ContentTrustIndicator } from "@research-assistant/workbench-sdk/ui";
import type { AiAssistanceGateway } from "@research-assistant/workbench-sdk/ai-assistance";
import { OverviewFieldSources } from "./OverviewFieldSources";
import { notify } from "@research-assistant/workbench-sdk/feedback";
import { ReadingReviewHeading } from "./ReadingReviewHeading";
import { overviewFieldTrustStatus } from "./structuredReadingReviewModel";
import { readingFieldColor } from "./readingFieldSources";

export function ReadingRecord({ unit, gateway, onSaved, candidates, aiGateway, color }: { readonly color?: string | undefined; readonly candidates: readonly AiCandidate[]; readonly aiGateway: AiAssistanceGateway; readonly unit: StructuredReadingUnit; readonly gateway: ResearchKnowledgeGateway; readonly onSaved: () => Promise<void> }): React.JSX.Element {
  const [value, setValue] = useState<string>();
  const [busy, setBusy] = useState(false);
  async function save(): Promise<void> {
    if (value === undefined || busy) return;
    if (value.trim() === unit.body.trim()) { setValue(undefined); return; }
    if (value.trim() === "") { notify.warning("阅读内容不能为空；原内容仍保留。"); return; }
    setBusy(true);
    try {
      await gateway.saveReadingUnit({ id: unit.id, expectedRevision: unit.revision, ...(unit.paperId === undefined ? {} : {paperId: unit.paperId}), unitKind: unit.unitKind,
        title: unit.title, body: value.trim(), epistemicRole: unit.epistemicRole, changeReason: "human_template_reading_edit" });
      await onSaved(); setValue(undefined);
    } catch (reason) { notify.error(researchKnowledgeErrorMessage(reason)); }
    finally { setBusy(false); }
  }
  const match = candidates.flatMap(value => value.overviewFieldConfirmations
    .filter(confirmation => (confirmation.active || confirmation.reviewResetAt !== undefined) && confirmation.targetReadingUnitId === unit.id)
    .map(confirmation => ({ candidate: value, confirmation, appliedRevision: confirmation.targetAppliedRevision })))
    .sort((a, b) => Number(b.confirmation.active) - Number(a.confirmation.active) || b.appliedRevision - a.appliedRevision)[0];
  const candidate = match?.candidate;
  const payload = candidate?.revisions.find(value => value.revision === candidate.currentRevision)?.payload;
  const field = payload?.kind === "paper_overview_unit_v1" ? payload.fields.find(value => value.field === (match?.confirmation.fieldKind ?? unit.templateField?.fieldId ?? unit.unitKind)) : undefined;
  const status = match?.confirmation.active ? "trusted" : match?.confirmation.reviewResetAt !== undefined && candidate !== undefined
    ? unit.revision > match.confirmation.targetAppliedRevision ? "reviewable" : overviewFieldTrustStatus(candidate, match.confirmation.fieldKind) : "trusted";
  async function review(): Promise<void> {
    if (candidate === undefined || field === undefined || payload?.kind !== "paper_overview_unit_v1" || busy) return;
    setBusy(true);
    try {
      let current = candidate;
      if (field.statements.map(statement => statement.text.trim()).filter(Boolean).join("\n\n") !== unit.body.trim()) {
        const first = field.statements[0]; if (first === undefined) return;
        const next = { ...payload, fields: payload.fields.map(value => value !== field ? value : { ...value, statements: [{ ...first, text: unit.body, evidenceItemIds: [...new Set(field.statements.flatMap(statement => statement.evidenceItemIds))], ...(field.statements.some(statement => statement.evidenceQuotes !== undefined) ? { evidenceQuotes: [...new Map(field.statements.flatMap(statement => statement.evidenceQuotes ?? []).map(source => [source.evidenceItemId, source])).values()] } : {}) }] }) };
        current = await aiGateway.reviseCandidate({ candidateId: candidate.id, expectedRevision: candidate.currentRevision, payload: next, changeReason: `human_structured_reading_edit:${field.field}` });
      }
      await aiGateway.confirmOverviewFields({ candidateId: current.id, candidateRevision: current.currentRevision, fieldKinds: [field.field], scopeKind: "field", idempotencyKey: crypto.randomUUID() });
      await onSaved();
    } catch (reason) { notify.error(aiAssistanceErrorMessage(reason)); }
    finally { setBusy(false); }
  }
  return <article className="structured-reading-field reading-category-card" style={{ "--reading-field-color": readingFieldColor(unit.templateField?.fieldId ?? unit.unitKind, color ?? (payload?.kind === "paper_overview_unit_v1" ? payload.paperTemplate?.fields.find(value => value.id === field?.field)?.color : undefined)) } as CSSProperties} tabIndex={0} onDoubleClick={event => {if (!busy && !(event.target instanceof Element && event.target.closest("button"))) setValue(unit.body);}}
    onKeyDown={event => {if (event.target === event.currentTarget && (event.key === "Enter" || event.key === "F2")) {event.preventDefault(); setValue(unit.body);}}}>
    <ReadingReviewHeading label={unit.title} candidate={candidate} confirmation={match?.confirmation} gateway={aiGateway} onChanged={() => undefined} onSaved={onSaved} busy={busy}><div><ContentTrustIndicator showHint size="small" status={status} statusLabel={status === "trusted" ? "人工已审核" : status === "reviewable" ? "人工编辑" : "AI 生成，未人工审核"} subjectLabel={unit.title} /><b>{unit.title.replace(/^结构化阅读 · /u, "")}</b></div><div>{status !== "trusted" && <ControlHint content="标为人工已审核"><button type="button" className="reading-icon-action" aria-label={`${unit.title}标为已审核`} disabled={busy || value !== undefined} onClick={() => void review()}><Check size={14} aria-hidden="true" /></button></ControlHint>}</div></ReadingReviewHeading>
    {value === undefined ? <p>{unit.body}</p> : <textarea autoFocus rows={4} disabled={busy} value={value} onChange={event => setValue(event.target.value)}
      onBlur={() => void save()} onKeyDown={event => {if (event.key === "Escape") setValue(undefined); else if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {event.preventDefault(); void save();}}} />}
    {candidate !== undefined && field !== undefined && <OverviewFieldSources inline candidate={candidate} field={field} gateway={aiGateway} onChanged={() => undefined} />}
  </article>;
}

export function TemplateReadingRecords({ template, units: allUnits, excludedUnitIds = [], gateway, onSaved, candidates, aiGateway }: {
  readonly candidates: readonly AiCandidate[];
  readonly aiGateway: AiAssistanceGateway;
  readonly template: PaperTemplateSnapshot | undefined;
  readonly units: readonly StructuredReadingUnit[];
  readonly excludedUnitIds?: readonly string[];
  readonly gateway: ResearchKnowledgeGateway;
  readonly onSaved: () => Promise<void>;
}): React.JSX.Element | null {
  const records = allUnits.filter(unit => !excludedUnitIds.includes(unit.id)).filter(unit => unit.templateField !== undefined);
  const displayed = template === undefined ? records : template.fields.flatMap(field => records.filter(unit => "portraitCandidateId" in template && unit.templateField?.portraitCandidateId === template.portraitCandidateId && unit.templateField.fieldId === field.id));
  if (records.length === 0 && template === undefined) return null;
  return <section aria-label="本文模板阅读记录" className="structured-reading-fields">
    {template === undefined ? displayed.map(unit => <ReadingRecord key={`${unit.id}:${unit.revision}`} unit={unit} gateway={gateway} onSaved={onSaved} candidates={candidates} aiGateway={aiGateway} />)
      : template.fields.map(field => {
        const unit = displayed.find(value => value.templateField?.fieldId === field.id);
        const extracted = candidates.some(candidate => {
          if (candidate.reviewState === "rejected") return false;
          const payload = candidate.revisions.find(value => value.revision === candidate.currentRevision)?.payload;
          return payload?.kind === "paper_overview_unit_v1"
            && payload.paperTemplate !== undefined && "portraitCandidateId" in payload.paperTemplate && "portraitCandidateId" in template && payload.paperTemplate.portraitCandidateId === template.portraitCandidateId
            && payload.fields.some(value => value.field === field.id);
        });
        return unit === undefined && extracted ? null : unit === undefined ? <article className="structured-reading-field" key={field.id}><b>{field.title}</b><p>尚未提取</p><small>{field.question}</small></article>
          : <ReadingRecord key={`${unit.id}:${unit.revision}`} unit={unit} gateway={gateway} onSaved={onSaved} candidates={candidates} aiGateway={aiGateway} color={field.color} />;
      })}
  </section>;
}
