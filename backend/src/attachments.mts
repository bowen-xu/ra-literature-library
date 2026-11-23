/** Attachment name and reader-state preparation migrated from native attachments.rs. */

export type AttachmentRejection = 'invalidAttachmentName' | 'invalidReaderViewState';

export interface RenameAttachmentRequest {readonly itemId: string; readonly attachmentId: string; readonly displayName: string}
export interface SaveReadingStateRequest {readonly itemId: string; readonly attachmentId: string; readonly pageIndex: number; readonly zoom: number; readonly viewStateJson: string | null}
export type AttachmentInput =
  | {readonly kind: 'rename'; readonly request: RenameAttachmentRequest}
  | {readonly kind: 'saveReadingState'; readonly request: SaveReadingStateRequest};

export type AttachmentPlan =
  | {readonly kind: 'rename'; readonly request: RenameAttachmentRequest; readonly displayName: string}
  | {readonly kind: 'saveReadingState'; readonly request: SaveReadingStateRequest; readonly boundedZoom: number};

export type AttachmentPreparation =
  | {readonly status: 'ready'; readonly plan: AttachmentPlan}
  | {readonly status: 'rejected'; readonly input: AttachmentInput; readonly reason: AttachmentRejection};

export function validateAttachmentName(value: string): string | null {
  const name = value.trim();
  return name === '' || [...name].length > 255 || /\p{Cc}/u.test(name) ? null : name;
}

export function validReaderViewState(value: unknown): boolean {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  const pageIndex = row.pageIndex;
  if (typeof pageIndex !== 'number' || !Number.isSafeInteger(pageIndex) || pageIndex < 0) return false;
  const scale = row.scale;
  if (scale === null || typeof scale !== 'object' || Array.isArray(scale)) return false;
  const scaleRow = scale as Record<string, unknown>;
  const scaleKind = scaleRow.kind;
  const scaleValid = scaleKind === 'numeric'
    ? typeof scaleRow.value === 'number' && Number.isFinite(scaleRow.value) && scaleRow.value >= 0.5 && scaleRow.value <= 3
    : scaleKind === 'page-fit' || scaleKind === 'page-width' || scaleKind === 'page-height' || scaleKind === 'auto';
  return row.schemaVersion === 2 && scaleValid
    && (row.scrollMode === 'vertical' || row.scrollMode === 'horizontal' || row.scrollMode === 'wrapped' || row.scrollMode === 'page')
    && (row.spreadMode === 'none' || row.spreadMode === 'odd' || row.spreadMode === 'even');
}

export function prepareReadingState(zoom: number, viewStateJson: string | null): number | AttachmentRejection {
  if (viewStateJson !== null) {
    let value: unknown;
    try {value = JSON.parse(viewStateJson);} catch {return 'invalidReaderViewState';}
    if (!validReaderViewState(value)) return 'invalidReaderViewState';
  }
  return Number.isFinite(zoom) ? Math.min(3, Math.max(0.5, zoom)) : 'invalidReaderViewState';
}

export function prepareAttachment(input: AttachmentInput): AttachmentPreparation {
  if (input.kind === 'rename') {
    const displayName = validateAttachmentName(input.request.displayName);
    return displayName !== null ? {status: 'ready', plan: {kind: 'rename', request: input.request, displayName}} : {status: 'rejected', input, reason: 'invalidAttachmentName'};
  }
  const boundedZoom = prepareReadingState(input.request.zoom, input.request.viewStateJson);
  return typeof boundedZoom === 'number'
    ? {status: 'ready', plan: {kind: 'saveReadingState', request: input.request, boundedZoom}}
    : {status: 'rejected', input, reason: boundedZoom};
}

export function attachmentRejectionCode(reason: AttachmentRejection): 'attachment_name_invalid' | 'invalid_input' {
  return reason === 'invalidAttachmentName' ? 'attachment_name_invalid' : 'invalid_input';
}

export function attachmentRejectionMessage(reason: AttachmentRejection): string {
  return reason === 'invalidAttachmentName' ? '附件名称不能为空、超过 255 个字符或包含控制字符' : '阅读位置不是有效的 ReaderViewStateV2';
}
