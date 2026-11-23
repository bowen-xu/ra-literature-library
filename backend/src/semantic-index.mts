/** Semantic-index control decisions migrated from native/semantic_index.rs. */

export interface SemanticIndexSpaceStatus {readonly failedCount: bigint; readonly staleCount: bigint}
export interface EmbeddingJobSummary {readonly status: string; readonly [key: string]: unknown}
export interface ReconciliationRecord {readonly inputSha256: string; readonly status: string; readonly [key: string]: unknown}
export interface StoredIndexRow {readonly inputSha256: string; readonly dataset_version: bigint; readonly vector_norm_bits: number}
export type SemanticIndexInput =
  | {readonly stage: 'status'; readonly spaces: readonly SemanticIndexSpaceStatus[]}
  | {readonly stage: 'retry'; readonly record_status: string; readonly latest: EmbeddingJobSummary | null}
  | {readonly stage: 'running' | 'ready'; readonly changed: bigint}
  | {readonly stage: 'activate'; readonly status: string; readonly pending: bigint}
  | {readonly stage: 'space'; readonly exists: boolean}
  | {readonly stage: 'repairState'; readonly status: string}
  | {readonly stage: 'reconcileRecord'; readonly record: ReconciliationRecord; readonly stored: StoredIndexRow | null};
export type SemanticIndexDecision =
  | {readonly kind: 'flag'; readonly value: boolean} | {readonly kind: 'validated'} | {readonly kind: 'rejected'; readonly message: string}
  | {readonly kind: 'reuseJob'; readonly summary: EmbeddingJobSummary; readonly should_start: boolean} | {readonly kind: 'queueJob'}
  | {readonly kind: 'reconcile'; readonly action: {readonly kind: 'keep'} | {readonly kind: 'complete'; readonly dataset_version: bigint; readonly vector_norm_bits: number} | {readonly kind: 'replace'} | {readonly kind: 'missing'; readonly count_repaired: boolean}};

export function retainedEmbeddingJob(recordStatus: string, summary: EmbeddingJobSummary): boolean | null {
  if (summary.status === 'queued') return true;
  if (summary.status === 'running') return false;
  if (summary.status === 'succeeded' && recordStatus === 'ready') return false;
  return null;
}
export function reconciliationRequired(spaces: readonly SemanticIndexSpaceStatus[]): boolean {return spaces.some(space => space.failedCount > 0n || space.staleCount > 0n);}
export function activateSemanticIndex(status: string, pending: bigint): boolean {return status === 'building' && pending === 0n;}
export function markSemanticIndexStale(status: string): boolean {return status !== 'queued';}

export function decideSemanticIndex(input: SemanticIndexInput): SemanticIndexDecision {
  switch (input.stage) {
    case 'status': return {kind: 'flag', value: reconciliationRequired(input.spaces)};
    case 'retry': {
      const retained = input.latest === null ? null : retainedEmbeddingJob(input.record_status, input.latest);
      return retained === null || input.latest === null ? {kind: 'queueJob'} : {kind: 'reuseJob', summary: input.latest, should_start: retained};
    }
    case 'running': return input.changed === 1n ? {kind: 'validated'} : {kind: 'rejected', message: 'embedding job 不可运行'};
    case 'ready': return input.changed === 1n ? {kind: 'validated'} : {kind: 'rejected', message: 'embedding record 不可标记为 ready'};
    case 'activate': return {kind: 'flag', value: activateSemanticIndex(input.status, input.pending)};
    case 'space': return input.exists ? {kind: 'validated'} : {kind: 'rejected', message: '找不到 embedding space'};
    case 'repairState': return {kind: 'flag', value: markSemanticIndexStale(input.status)};
    case 'reconcileRecord': {
      const stored = input.stored;
      if (stored !== null && stored.inputSha256 === input.record.inputSha256) return input.record.status === 'ready'
        ? {kind: 'reconcile', action: {kind: 'keep'}}
        : {kind: 'reconcile', action: {kind: 'complete', dataset_version: stored.dataset_version, vector_norm_bits: stored.vector_norm_bits}};
      if (stored !== null) return {kind: 'reconcile', action: {kind: 'replace'}};
      return {kind: 'reconcile', action: {kind: 'missing', count_repaired: markSemanticIndexStale(input.record.status)}};
    }
  }
}
