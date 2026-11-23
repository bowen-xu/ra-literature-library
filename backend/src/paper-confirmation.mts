/**
 * Paper confirmation policy migrated from the native plugin's
 * `paper_confirmation` module.
 *
 * This layer owns validation, ordering and derived payloads only. SQL receipt
 * and confirmation writes remain host-owned, just as they did in the native
 * implementation.
 */

import {createHash} from 'node:crypto';
import {
  decodeAiCandidatePayload,
  overviewFieldTitle,
  paperTemplateIdentity,
  type AiCandidate,
  type AiOverviewFieldConfirmation,
  type AiOverviewFieldConfirmationDraft,
  type AiPaperReviewConfirmationDraft,
  type AiPaperReviewOverviewTargetDraft,
  type PaperOverviewFieldV1,
  type PaperOverviewUnitCandidateV1,
} from '@research-assistant/core/ai';
import {EPISTEMIC_ROLES, UNIT_KINDS} from './reading-units.mts';

export interface PaperConfirmationError {
  readonly code: 'invalid_input';
  readonly message: string;
}

export type PaperConfirmationResult<T> =
  | {readonly status: 'ready'; readonly value: T}
  | {readonly status: 'rejected'; readonly error: PaperConfirmationError};

const invalid = (message: string): PaperConfirmationError => ({code: 'invalid_input', message});
const ready = <T,>(value: T): PaperConfirmationResult<T> => ({status: 'ready', value});
const rejected = <T,>(message: string): PaperConfirmationResult<T> => ({status: 'rejected', error: invalid(message)});

const CONFIRMABLE_METADATA_FIELDS = [
  'itemType', 'title', 'abstractText', 'issuedYear', 'containerTitle', 'volume', 'issue',
  'pages', 'doi', 'url', 'language', 'bibtexKey', 'creators', 'tags',
] as const;

export type NormalizedPaperConfirmationDraft = Omit<AiPaperReviewConfirmationDraft, 'projectId'> & {
  readonly projectId?: string;
};

export interface FieldAnchorExisting {readonly kind: 'existing'; readonly id: string}
export interface FieldAnchorQuoted {
  readonly kind: 'quoted'; readonly paperId: string; readonly attachmentId: string;
  readonly contentSha256: string; readonly pageIndex: number; readonly pageLabel: string | null;
  readonly quote: string; readonly prefix: string; readonly suffix: string;
}
export type FieldAnchor = FieldAnchorExisting | FieldAnchorQuoted;

export interface ConfirmedField {
  readonly title: string; readonly body: string; readonly unitKind: string;
  readonly templateField: readonly [string, string] | null; readonly decisionKind: 'ai_unchanged' | 'human_edited';
  readonly provenanceKind: 'ai_accepted_unchanged' | 'ai_accepted_after_edit'; readonly epistemicRole: string;
}

export interface FieldPlan {
  readonly anchors: readonly (FieldAnchor | PaperConfirmationError)[];
  readonly unit: ConfirmedField | PaperConfirmationError;
  readonly hash: string | PaperConfirmationError;
}

export interface QualifiedOverview {
  readonly paperId: string; readonly overview: PaperOverviewUnitCandidateV1; readonly populatedFieldCount: number;
}

export type UnitInput =
  | {readonly kind: 'validate'; readonly title: string; readonly body: string; readonly unitKind: string; readonly provenanceKind: string; readonly epistemicRole: string; readonly anchorCount: number}
  | {readonly kind: 'revision'; readonly currentRevision: number | null; readonly expectedRevision: number}
  | {readonly kind: 'restore'; readonly snapshot: unknown};

export type UnitProblem =
  | {readonly kind: 'invalidInput'; readonly message: string}
  | {readonly kind: 'notFound'}
  | {readonly kind: 'revisionConflict'; readonly currentRevision: number};

export type UnitDecision =
  | {readonly kind: 'validated'; readonly rejection: UnitProblem | null}
  | {readonly kind: 'revision'; readonly result: {readonly ok: true; readonly value: number} | {readonly ok: false; readonly error: UnitProblem}}
  | {readonly kind: 'restore'; readonly header: {readonly ok: true; readonly value: RestoredUnit} | {readonly ok: false; readonly error: UnitProblem}; readonly links: {readonly ok: true; readonly value: readonly ({readonly ok: true; readonly value: RestoredEvidence} | {readonly ok: false; readonly error: UnitProblem})[]} | {readonly ok: false; readonly error: UnitProblem}};

export interface RestoredUnit {readonly projectId: string | null; readonly paperId: string | null; readonly unitKind: string; readonly title: string; readonly body: string; readonly provenanceKind: string; readonly epistemicRole: string}
export interface RestoredEvidence {readonly anchorId: string; readonly stance: string; readonly rationale: string}

export type PaperConfirmationInput =
  | {readonly kind: 'request'; readonly request: {readonly kind: 'confirmOverview'; readonly draft: AiOverviewFieldConfirmationDraft} | {readonly kind: 'undoOverview'; readonly draft: {readonly batchId: string; readonly idempotencyKey: string; readonly fieldKind?: string}} | {readonly kind: 'confirmPaper'; readonly draft: AiPaperReviewConfirmationDraft} | {readonly kind: 'undoPaper'; readonly draft: {readonly batchId: string; readonly idempotencyKey: string}}}
  | {readonly kind: 'overviewReplay'; readonly requestedCandidateId: string; readonly batchCandidateId: string}
  | {readonly kind: 'overviewCandidate'; readonly candidate: AiCandidate; readonly draft: AiOverviewFieldConfirmationDraft}
  | {readonly kind: 'overviewFields'; readonly overview: PaperOverviewUnitCandidateV1; readonly requestedFields: readonly string[]; readonly confirmedFields: readonly AiOverviewFieldConfirmation[]}
  | {readonly kind: 'overviewField'; readonly candidate: AiCandidate; readonly overview: PaperOverviewUnitCandidateV1; readonly field: PaperOverviewFieldV1}
  | {readonly kind: 'undoBatchKey'; readonly resetKeyExists: boolean}
  | {readonly kind: 'undoReplayKey'; readonly existingBatchId: string | null; readonly requestedBatchId: string; readonly paper: boolean}
  | {readonly kind: 'resetField'; readonly batch: {readonly fieldConfirmations: readonly AiOverviewFieldConfirmation[]}; readonly fieldKind: string}
  | {readonly kind: 'resetEligibility'; readonly field: AiOverviewFieldConfirmation; readonly existingResetId: string | null; readonly legacyKeyExists: boolean}
  | {readonly kind: 'resetState'; readonly fieldActive: readonly boolean[]; readonly revisionEditorKinds: readonly string[]}
  | {readonly kind: 'unit'; readonly input: UnitInput}
  | {readonly kind: 'paperReplay'; readonly paperId: string; readonly requestJson: string; readonly storedPaperId: string; readonly storedRequestJson: string}
  | {readonly kind: 'paperExists'; readonly exists: boolean}
  | {readonly kind: 'paperTarget'; readonly candidate: AiCandidate; readonly paperId: string}
  | {readonly kind: 'metadataSource'; readonly source: readonly [boolean, string] | null};

export type PaperConfirmationRequest = Extract<PaperConfirmationInput, {readonly kind: 'request'}>['request'];

export type PaperConfirmationDecision =
  | {readonly kind: 'request'; readonly request: PaperConfirmationRequest}
  | {readonly kind: 'overviewReplay'}
  | {readonly kind: 'overviewCandidate'; readonly qualified: QualifiedOverview}
  | {readonly kind: 'overviewFields'; readonly fields: readonly PaperOverviewFieldV1[]}
  | {readonly kind: 'overviewField'; readonly plan: FieldPlan}
  | {readonly kind: 'undoBatchKey'}
  | {readonly kind: 'undoReplayKey'}
  | {readonly kind: 'resetField'; readonly field: AiOverviewFieldConfirmation}
  | {readonly kind: 'resetEligibility'; readonly append: boolean}
  | {readonly kind: 'resetState'; readonly state: 'edited' | 'unreviewed'}
  | {readonly kind: 'unit'; readonly decision: UnitDecision}
  | {readonly kind: 'paperReplay'}
  | {readonly kind: 'paperExists'}
  | {readonly kind: 'paperTarget'}
  | {readonly kind: 'metadataSource'; readonly apply: boolean};

export function validateConfirmationDraft(draft: AiOverviewFieldConfirmationDraft): PaperConfirmationError | null {
  return draft.fieldKinds.length === 0 || !['field', 'block', 'paper'].includes(draft.scopeKind)
    || draft.idempotencyKey.trim() === '' || [...draft.idempotencyKey].length > 200
    ? invalid('字段确认参数无效') : null;
}

export function validateKey(value: string, label: string): PaperConfirmationError | null {
  return value.trim() === '' || [...value].length > 200 ? invalid(`${label}无效`) : null;
}

export function normalizePaperDraft(draft: AiPaperReviewConfirmationDraft): PaperConfirmationResult<NormalizedPaperConfirmationDraft> {
  if (draft.paperId.trim() === '') return rejected('文献 ID 不能为空');
  const keyError = validateKey(draft.idempotencyKey, '确认幂等键');
  if (keyError !== null) return {status: 'rejected', error: keyError};
  const metadataFieldNames = [...new Set([...draft.metadataFieldNames].sort())];
  const invalidField = metadataFieldNames.find(field => !(CONFIRMABLE_METADATA_FIELDS as readonly string[]).includes(field));
  if (invalidField !== undefined) return rejected(`元数据确认字段无效：${invalidField}`);
  const overviewTargets = draft.overviewTargets.map(target => ({...target, fieldKinds: [...new Set([...target.fieldKinds].sort())]}))
    .sort((left, right) => left.candidateId.localeCompare(right.candidateId));
  if (metadataFieldNames.length === 0 && overviewTargets.length === 0) return rejected('文献确认范围不能为空');
  if (overviewTargets.some(target => target.fieldKinds.length === 0)) return rejected('结构化阅读确认字段不能为空');
  if (new Set(overviewTargets.map(target => target.candidateId)).size !== overviewTargets.length) return rejected('同一候选不能在文献批次中重复');
  return ready({paperId: draft.paperId, metadataFieldNames, overviewTargets, idempotencyKey: draft.idempotencyKey});
}

function hashValue(value: unknown): string {return createHash('sha256').update(JSON.stringify(value)).digest('hex');}
function trimCodePoints(value: string, count: number, fromEnd: boolean): string {
  const points = [...value]; return (fromEnd ? points.slice(-count) : points.slice(0, count)).join('');
}

export function confirmationFieldHash(field: PaperOverviewFieldV1): string {return hashValue(field);}

export function fieldAnchors(candidate: AiCandidate, field: PaperOverviewFieldV1): readonly (FieldAnchor | PaperConfirmationError)[] {
  const anchors: (FieldAnchor | PaperConfirmationError)[] = [];
  const seen = new Set<string>();
  for (const statement of field.statements) {
    for (const key of statement.evidenceItemIds) {
      const source = candidate.evidenceBundle.items.find(item => item.citationKey === key);
      if (source === undefined) {anchors.push(invalid('字段引用了未知证据')); return anchors;}
      const quote = statement.evidenceQuotes?.find(value => value.evidenceItemId === key)?.quote;
      if (quote === undefined) {
        const identity = `${source.anchorId}\u0000${source.quoteExact}`;
        if (!seen.has(identity)) {seen.add(identity); anchors.push({kind: 'existing', id: source.anchorId});}
        continue;
      }
      const identity = `${source.anchorId}\u0000${quote}`;
      if (seen.has(identity)) continue;
      seen.add(identity);
      const offset = source.quoteExact.indexOf(quote);
      if (offset < 0) {anchors.push(invalid('字段摘录不是原文的连续片段')); return anchors;}
      const unique = source.quoteExact.lastIndexOf(quote) === offset;
      const prefix = unique ? `${source.quotePrefix}${source.quoteExact.slice(0, offset)}` : '';
      const suffix = unique ? `${source.quoteExact.slice(offset + quote.length)}${source.quoteSuffix}` : '';
      anchors.push({kind: 'quoted', paperId: source.paperId, attachmentId: source.attachmentId, contentSha256: source.contentSha256,
        pageIndex: source.pageIndex, pageLabel: source.pageLabel ?? null, quote,
        prefix: trimCodePoints(prefix, 160, true), suffix: trimCodePoints(suffix, 160, false)});
    }
  }
  return anchors;
}

function latestFieldEditor(candidate: AiCandidate, fieldKind: string): 'ai_unchanged' | 'human_edited' | PaperConfirmationError {
  let previousHash: string | undefined;
  let editor: 'ai_unchanged' | 'human_edited' = 'ai_unchanged';
  for (const revision of candidate.revisions) {
    const fields = revision.payload.kind === 'paper_overview_unit_v1' ? revision.payload.fields : [];
    const field = fields.find(value => value.field === fieldKind);
    if (field === undefined) return invalid('候选修订缺少结构化字段');
    const currentHash = confirmationFieldHash(field);
    if (previousHash !== currentHash) {
      editor = revision.editorKind === 'human' ? 'human_edited' : 'ai_unchanged';
      previousHash = currentHash;
    }
  }
  return editor;
}

function overviewFieldRole(field: PaperOverviewFieldV1): string {
  const first = field.statements[0]?.epistemicRole ?? 'synthesis';
  return field.statements.every(statement => statement.epistemicRole === first)
    && ['source_paraphrase', 'inference', 'hypothesis', 'question', 'working_note'].includes(first) ? first : 'synthesis';
}

export function fieldPlan(candidate: AiCandidate, overview: PaperOverviewUnitCandidateV1, field: PaperOverviewFieldV1): FieldPlan {
  const decision = latestFieldEditor(candidate, field.field);
  const body = field.statements.map(statement => statement.text.trim()).filter(Boolean).join('\n\n');
  const template = overview.paperTemplate?.fields.find(value => value.id === field.field);
  const unit: ConfirmedField | PaperConfirmationError = typeof decision === 'string' ? {
    title: `结构化阅读 · ${overviewFieldTitle(overview, field.field)}`, body,
    unitKind: overview.paperTemplate === undefined ? field.field : 'other',
    templateField: overview.paperTemplate === undefined ? null : [paperTemplateIdentity(overview.paperTemplate), field.field],
    decisionKind: decision,
    provenanceKind: decision === 'human_edited' ? 'ai_accepted_after_edit' : 'ai_accepted_unchanged',
    epistemicRole: overviewFieldRole(field),
  } : decision;
  return {anchors: fieldAnchors(candidate, field), unit, hash: confirmationFieldHash(field)};
}

export function qualifyOverview(candidate: AiCandidate, draft: AiOverviewFieldConfirmationDraft): PaperConfirmationResult<QualifiedOverview> {
  if (candidate.candidateKind !== 'paper_overview_unit_v1') return rejected('只有结构化阅读候选支持字段确认');
  if (candidate.currentRevision !== draft.candidateRevision) return rejected('AI 候选已产生新版本，请重新载入后确认');
  if (['accepted_unchanged', 'accepted_after_edit', 'rejected'].includes(candidate.reviewState)) return rejected('候选审查已经结束');
  const first = candidate.evidenceBundle.items[0];
  if (first === undefined) return rejected('概要候选缺少来源文献');
  if (candidate.evidenceBundle.items.some(item => item.paperId !== first.paperId)) return rejected('结构化阅读候选跨越了多篇文献');
  const revision = candidate.revisions.find(value => value.revision === candidate.currentRevision);
  if (revision === undefined) return rejected('找不到候选当前版本');
  try {
    const overview = decodeAiCandidatePayload(revision.payload, {allowedEvidenceItemIds: new Set(candidate.evidenceBundle.items.map(item => item.citationKey))});
    if (overview.kind !== 'paper_overview_unit_v1') return rejected('候选概要格式无效');
    const populated = new Set(overview.fields.filter(field => field.statements.length > 0 && field.status !== 'not_found').map(field => field.field));
    return ready({paperId: first.paperId, overview, populatedFieldCount: populated.size});
  } catch {
    return rejected('候选概要格式无效');
  }
}

export function selectFields(overview: PaperOverviewUnitCandidateV1, requestedFields: readonly string[], confirmedFields: readonly AiOverviewFieldConfirmation[]): PaperConfirmationResult<readonly PaperOverviewFieldV1[]> {
  const byField = new Map(overview.fields.map(field => [field.field, field]));
  const active = new Set(confirmedFields.filter(field => field.active).map(field => field.fieldKind));
  if (new Set(requestedFields).size !== requestedFields.length) return rejected('确认字段不能重复');
  const fields: PaperOverviewFieldV1[] = [];
  for (const fieldKind of requestedFields) {
    if (active.has(fieldKind)) return rejected(`字段 ${fieldKind} 已经确认`);
    const field = byField.get(fieldKind);
    if (field === undefined) return rejected(`候选不包含字段 ${fieldKind}`);
    if (field.statements.length === 0 || field.status === 'not_found') return rejected(`字段 ${fieldKind} 没有可确认内容`);
    fields.push(field);
  }
  return ready(fields);
}

export function prepareUnit(input: UnitInput): UnitDecision {
  if (input.kind === 'validate') {
    const invalidInput = input.title.trim().length > 240 || input.body.trim() === '' || input.anchorCount === 0
      || !UNIT_KINDS.includes(input.unitKind as typeof UNIT_KINDS[number])
      || !['ai_accepted_unchanged', 'ai_accepted_after_edit'].includes(input.provenanceKind)
      || !EPISTEMIC_ROLES.includes(input.epistemicRole as typeof EPISTEMIC_ROLES[number]);
    return {kind: 'validated', rejection: invalidInput ? {kind: 'invalidInput', message: 'AI 确认生成的阅读单元内容无效'} : null};
  }
  if (input.kind === 'revision') {
    if (input.currentRevision === null) return {kind: 'revision', result: {ok: false, error: {kind: 'notFound'}}};
    if (input.currentRevision !== input.expectedRevision) return {kind: 'revision', result: {ok: false, error: {kind: 'revisionConflict', currentRevision: input.currentRevision}}};
    return {kind: 'revision', result: {ok: true, value: input.currentRevision + 1}};
  }
  const invalidSnapshot = (message: string): {ok: false; error: UnitProblem} => ({ok: false, error: {kind: 'invalidInput', message}});
  const row = input.snapshot !== null && typeof input.snapshot === 'object' && !Array.isArray(input.snapshot) ? input.snapshot as Record<string, unknown> : null;
  const text = (value: unknown): string | undefined => typeof value === 'string' ? value : undefined;
  const optionalText = (value: unknown): string | null | undefined => value === null ? null : text(value);
  const headerValues = row === null ? undefined : {projectId: optionalText(row.projectId), paperId: optionalText(row.paperId), unitKind: text(row.unitKind), title: text(row.title), body: text(row.body), provenanceKind: text(row.provenanceKind), epistemicRole: text(row.epistemicRole)};
  const header = headerValues === undefined || headerValues.projectId === undefined || headerValues.paperId === undefined || headerValues.unitKind === undefined || headerValues.title === undefined || headerValues.body === undefined || headerValues.provenanceKind === undefined || headerValues.epistemicRole === undefined
    ? invalidSnapshot('阅读单元历史快照无效')
    : {ok: true as const, value: headerValues as RestoredUnit};
  const linksValue = row?.evidenceLinks;
  if (!Array.isArray(linksValue)) return {kind: 'restore', header, links: invalidSnapshot('阅读单元证据历史快照无效')};
  const links: ({ok: true; value: RestoredEvidence} | {ok: false; error: UnitProblem})[] = [];
  for (const value of linksValue) {
    const link = value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
    const restored = link !== null && typeof link.anchorId === 'string' && typeof link.stance === 'string' && typeof link.rationale === 'string'
      ? {ok: true as const, value: {anchorId: link.anchorId, stance: link.stance, rationale: link.rationale}}
      : invalidSnapshot('阅读单元历史快照无效');
    links.push(restored);
    if (!restored.ok) break;
  }
  return {kind: 'restore', header, links: {ok: true, value: links}};
}

export function wholeBatchKey(resetKeyExists: boolean): PaperConfirmationError | null {
  return resetKeyExists ? invalid('撤销幂等键已用于字段恢复') : null;
}
export function replayKey(existingBatchId: string | null, requestedBatchId: string, paper: boolean): PaperConfirmationError | null {
  return existingBatchId !== null && existingBatchId !== requestedBatchId ? invalid(paper ? '撤销幂等键已用于其他文献确认批次' : '撤销幂等键已用于其他批次') : null;
}
export function resetField(batch: {readonly fieldConfirmations: readonly AiOverviewFieldConfirmation[]}, fieldKind: string): PaperConfirmationResult<AiOverviewFieldConfirmation> {
  const field = batch.fieldConfirmations.find(value => value.fieldKind === fieldKind);
  return field === undefined ? rejected('该批次没有此字段的审核记录') : ready(field);
}
export function resetEligibility(field: AiOverviewFieldConfirmation, existingResetId: string | null, legacyKeyExists: boolean): PaperConfirmationResult<boolean> {
  if (legacyKeyExists || existingResetId !== null && existingResetId !== field.id) return rejected('恢复幂等键已用于其他审核操作');
  if (!field.active && field.reviewResetAt === undefined) return rejected('该审核记录已撤销');
  return ready(field.active);
}
export function resetStateFlags(fieldActive: readonly boolean[], revisionEditors: readonly string[]): 'edited' | 'unreviewed' {
  return fieldActive.some(Boolean) || revisionEditors.some(editor => editor === 'human') ? 'edited' : 'unreviewed';
}
export function paperReplay(paperId: string, requestJson: string, storedPaperId: string, storedRequestJson: string): PaperConfirmationError | null {
  return paperId !== storedPaperId || requestJson !== storedRequestJson ? invalid('文献确认幂等键已用于其他范围') : null;
}
export function paperExists(exists: boolean): PaperConfirmationError | null {return exists ? null : invalid('找不到待确认文献');}
export function paperTarget(candidate: AiCandidate, paperId: string): PaperConfirmationError | null {
  return candidate.evidenceBundle.items.length === 0 || candidate.evidenceBundle.items.some(item => item.paperId !== paperId) ? invalid('候选不属于当前文献') : null;
}
export function metadataSource(source: readonly [boolean, string] | null): PaperConfirmationResult<boolean> {
  return source === null ? rejected('字段没有可确认的来源') : ready(!source[0]);
}

function requestDecision(request: Extract<PaperConfirmationInput, {readonly kind: 'request'}>['request']): PaperConfirmationResult<PaperConfirmationDecision> {
  const normalized = request.kind === 'confirmPaper' ? normalizePaperDraft(request.draft) : undefined;
  const error = request.kind === 'confirmOverview' ? validateConfirmationDraft(request.draft)
    : request.kind === 'confirmPaper' ? normalized?.status === 'rejected' ? normalized.error : null
    : validateKey(request.draft.idempotencyKey, '撤销幂等键');
  if (error !== null) return {status: 'rejected', error};
  const normalizedRequest = request.kind === 'confirmPaper' && normalized?.status === 'ready'
    ? {...request, draft: normalized.value} : request;
  return ready({kind: 'request', request: normalizedRequest});
}

export function preparePaperConfirmation(input: PaperConfirmationInput): PaperConfirmationResult<PaperConfirmationDecision> {
  switch (input.kind) {
    case 'request': return requestDecision(input.request);
    case 'overviewReplay': return input.requestedCandidateId === input.batchCandidateId ? ready({kind: 'overviewReplay'}) : rejected('确认幂等键已用于其他候选');
    case 'overviewCandidate': {const result = qualifyOverview(input.candidate, input.draft); return result.status === 'ready' ? ready({kind: 'overviewCandidate', qualified: result.value}) : result;}
    case 'overviewFields': {const result = selectFields(input.overview, input.requestedFields, input.confirmedFields); return result.status === 'ready' ? ready({kind: 'overviewFields', fields: result.value}) : result;}
    case 'overviewField': return ready({kind: 'overviewField', plan: fieldPlan(input.candidate, input.overview, input.field)});
    case 'undoBatchKey': {const error = wholeBatchKey(input.resetKeyExists); return error === null ? ready({kind: 'undoBatchKey'}) : {status: 'rejected', error};}
    case 'undoReplayKey': {const error = replayKey(input.existingBatchId, input.requestedBatchId, input.paper); return error === null ? ready({kind: 'undoReplayKey'}) : {status: 'rejected', error};}
    case 'resetField': {const result = resetField(input.batch, input.fieldKind); return result.status === 'ready' ? ready({kind: 'resetField', field: result.value}) : result;}
    case 'resetEligibility': {const result = resetEligibility(input.field, input.existingResetId, input.legacyKeyExists); return result.status === 'ready' ? ready({kind: 'resetEligibility', append: result.value}) : result;}
    case 'resetState': return ready({kind: 'resetState', state: resetStateFlags(input.fieldActive, input.revisionEditorKinds)});
    case 'unit': return ready({kind: 'unit', decision: prepareUnit(input.input)});
    case 'paperReplay': {const error = paperReplay(input.paperId, input.requestJson, input.storedPaperId, input.storedRequestJson); return error === null ? ready({kind: 'paperReplay'}) : {status: 'rejected', error};}
    case 'paperExists': {const error = paperExists(input.exists); return error === null ? ready({kind: 'paperExists'}) : {status: 'rejected', error};}
    case 'paperTarget': {const error = paperTarget(input.candidate, input.paperId); return error === null ? ready({kind: 'paperTarget'}) : {status: 'rejected', error};}
    case 'metadataSource': {const result = metadataSource(input.source); return result.status === 'ready' ? ready({kind: 'metadataSource', apply: result.value}) : result;}
  }
}
