/** Paper-context session and screenshot preparation migrated from the native plugin. */

import {imageIdentity, imageSet, snapshotReady as snapshotReadyFromSnapshot, type AttachmentStatus} from './paper-context-snapshot.mts';

export interface PaperAiReadingSessionSummary {
  readonly id: string; readonly paperId: string; readonly contextSnapshotId: string | null; readonly attachmentIds: readonly string[]; readonly parseRunIds: readonly string[]; readonly providerId: string; readonly modelId: string; readonly reasoningEffort: string | null; readonly bootstrapKind: string; readonly sourceWorkflowId: string | null; readonly sourceWorkflowRevision: bigint | null; readonly bootstrapHash: string | null; readonly conceptRetrievalDefault: boolean; readonly title: string; readonly status: string; readonly createdAt: string; readonly updatedAt: string;
}
export interface ReadingSessionRow extends PaperAiReadingSessionSummary {readonly attachmentIdsJson: string; readonly parseRunIdsJson: string}
export type PaperPreparationInput =
  | {readonly kind: 'analysisSources'; readonly statuses: readonly string[]; readonly pictureCount: number | bigint}
  | {readonly kind: 'session'; readonly row: ReadingSessionRow | null}
  | {readonly kind: 'snapshotReady'; readonly attachmentStatuses: readonly AttachmentStatus[]}
  | {readonly kind: 'imageIdentity'; readonly contextItemId: string; readonly existingIds: readonly string[]}
  | {readonly kind: 'imageSet'; readonly requestedIds: readonly string[]; readonly availableIds: readonly string[]};
export type PaperPreparationDecision =
  | {readonly kind: 'session'; readonly session: PaperAiReadingSessionSummary}
  | {readonly kind: 'ready'; readonly available: boolean}
  | {readonly kind: 'validated'}
  | {readonly kind: 'rejected'; readonly message: string};

function listOrEmpty(value: string): readonly string[] {try {const parsed: unknown = JSON.parse(value); return Array.isArray(parsed) && parsed.every(item => typeof item === 'string') ? parsed : [];} catch {return [];}}
export function sessionSummary(row: ReadingSessionRow | null): PaperAiReadingSessionSummary | string {
  if (row === null) return '找不到 AI 阅读会话';
  const {attachmentIdsJson, parseRunIdsJson, ...summary} = row;
  return {...summary, attachmentIds: listOrEmpty(attachmentIdsJson), parseRunIds: listOrEmpty(parseRunIdsJson)};
}
export function validateAnalysisSources(statuses: readonly string[], pictureCount: number | bigint): string | null {if (statuses.some(status => status !== 'available')) return '部分 PDF 尚未完成 Docling 结构化解析'; return Number(pictureCount) > 128 ? `图片结构块数量为 ${pictureCount}，超过本轮上限 128` : null;}

export function evaluatePaperPreparation(input: PaperPreparationInput): PaperPreparationDecision {
  if (input.kind === 'analysisSources') {const error = validateAnalysisSources(input.statuses, input.pictureCount); return error === null ? {kind: 'validated'} : {kind: 'rejected', message: error};}
  if (input.kind === 'session') {const result = sessionSummary(input.row); return typeof result === 'string' ? {kind: 'rejected', message: result} : {kind: 'session', session: result};}
  if (input.kind === 'snapshotReady') return {kind: 'ready', available: snapshotReadyFromSnapshot(input.attachmentStatuses)};
  if (input.kind === 'imageIdentity') {const error = imageIdentity(input.contextItemId, input.existingIds); return error === null ? {kind: 'validated'} : {kind: 'rejected', message: error};}
  const error = imageSet(input.requestedIds, input.availableIds); return error === null ? {kind: 'validated'} : {kind: 'rejected', message: error};
}
