/** Duplicate decision and merge-endpoint preparation migrated from native duplicate_review.rs and duplicate_merge_prepare.rs. */

export interface DuplicateDecisionRequest {readonly candidateId: string; readonly decision: string}
export interface FinishDuplicateDecisionInput {readonly request: DuplicateDecisionRequest; readonly affectedRows: bigint}
export type DuplicateRejection = {readonly code: 'invalid_input' | 'not_found'; readonly message: string};
export type DuplicateDecisionPreparation = {readonly kind: 'ready'; readonly request: DuplicateDecisionRequest} | {readonly kind: 'rejected'; readonly error: DuplicateRejection};
export type DuplicateDecisionCompletion = {readonly kind: 'applied'} | {readonly kind: 'rejected'; readonly error: DuplicateRejection};
export interface MergePrepareInput {readonly candidateId: string; readonly survivorItemId: string; readonly leftItemId: string; readonly rightItemId: string}
export type MergePreparation = {readonly status: 'ready'; readonly input: MergePrepareInput; readonly mergedItemId: string; readonly operationState: string; readonly createdReadingState: boolean} | {readonly status: 'rejected'; readonly reason: 'notFound'};

export function validateDuplicateDecision(decision: string): DuplicateRejection | null {
  return decision === 'keep_both' || decision === 'dismiss' ? null : {code: 'invalid_input', message: `不支持的文献类型：${decision}`};
}
export function prepareDuplicateDecision(request: DuplicateDecisionRequest): DuplicateDecisionPreparation {
  const error = validateDuplicateDecision(request.decision); return error === null ? {kind: 'ready', request} : {kind: 'rejected', error};
}
export function finishDuplicateDecision(input: FinishDuplicateDecisionInput): DuplicateDecisionCompletion {
  return input.affectedRows === 0n ? {kind: 'rejected', error: {code: 'not_found', message: '找不到文献或附件'}} : {kind: 'applied'};
}
export function sourceDuplicateItemId(leftItemId: string, rightItemId: string, survivorItemId: string): string | null {
  if (survivorItemId === leftItemId) return rightItemId;
  if (survivorItemId === rightItemId) return leftItemId;
  return null;
}
export function prepareDuplicateMerge(input: MergePrepareInput): MergePreparation {
  const mergedItemId = sourceDuplicateItemId(input.leftItemId, input.rightItemId, input.survivorItemId);
  return mergedItemId === null ? {status: 'rejected', reason: 'notFound'} : {status: 'ready', input, mergedItemId, operationState: 'applied', createdReadingState: false};
}
