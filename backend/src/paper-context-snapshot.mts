/** Paper-context snapshot projection migrated from the native plugin. */

import {digestSnapshot, type ContextAttachment, type ContextItem, type SnapshotDigestInput} from './paper-context-preview.mts';

export const CONTEXT_SCHEMA_VERSION = 1 as const;
export interface AttachmentStatus {readonly attachmentId: string; readonly displayName: string; readonly contentSha256: string; readonly parseRunId: string | null; readonly parseStatus: string}
export interface SnapshotProjectionInput {readonly paperId: string; readonly attachmentStatuses: readonly AttachmentStatus[]; readonly contextItems: readonly ContextItem[]; readonly imageHashes: Readonly<Record<string, string>>}
export interface SnapshotProjection {readonly contextSchemaVersion: number; readonly attachments: readonly ContextAttachment[]; readonly items: readonly ContextItem[]; readonly contextHash: string; readonly snapshotId: string}
export type PaperContextProjectionError = 'invalidInput' | 'temporaryUnavailable';

export function snapshotReady(statuses: readonly AttachmentStatus[]): boolean {return statuses.every(status => status.parseStatus === 'available' && status.parseRunId !== null);}
export function projectPaperContextSnapshot(input: SnapshotProjectionInput): SnapshotProjection | PaperContextProjectionError {
  if (!snapshotReady(input.attachmentStatuses)) return 'invalidInput';
  const attachments: ContextAttachment[] = input.attachmentStatuses.map((status, ordinal) => ({attachmentId: status.attachmentId, contentSha256: status.contentSha256, parseRunId: status.parseRunId!, ordinal}));
  const items = [...input.contextItems].map(item => ({...item, imageContentSha256: input.imageHashes[item.id] ?? null})).sort((left, right) => left.id.localeCompare(right.id));
  const digestInput: SnapshotDigestInput = {contextSchemaVersion: CONTEXT_SCHEMA_VERSION, paperId: input.paperId, attachments, items};
  try {const contextHash = digestSnapshot(digestInput); return {contextSchemaVersion: CONTEXT_SCHEMA_VERSION, attachments, items, contextHash, snapshotId: `paper-context-${contextHash}`};}
  catch {return 'temporaryUnavailable';}
}

export function imageIdentity(current: string, existing: readonly string[]): string | null {return existing.includes(current) ? '图片截图包含重复结构化块 ID' : null;}
export function imageSet(requested: readonly string[], available: readonly string[]): string | null {
  if (available.length !== requested.length) return '图片截图数量与 Docling picture 结构块不一致';
  for (const id of requested) if (!available.includes(id)) return `缺少结构化图片块 ${id} 的截图`;
  return null;
}
