/**
 * Literature lifecycle preparation migrated from the archived native plugin.
 *
 * This module is deliberately side-effect free. SQL statements stay in the
 * package's `backend/data` resources and are applied by the host integration;
 * this layer preserves the original request ordering and empty-input policy.
 */

export const LIFECYCLE_CAPABILITY_ID = 'literature.lifecycle' as const;
export const LIFECYCLE_CAPABILITY_VERSION = 1 as const;

export type LifecycleRequest =
  | {readonly kind: 'archive'; readonly itemId: string}
  | {readonly kind: 'restore'; readonly itemId: string}
  | {readonly kind: 'trash'; readonly itemId: string}
  | {readonly kind: 'restoreTrash'; readonly itemId: string}
  | {readonly kind: 'trashMany'; readonly itemIds: readonly string[]}
  | {readonly kind: 'setProjects'; readonly itemId: string; readonly projectIds: readonly string[]};

export type LifecycleRejection = {
  readonly code: 'not_found';
  readonly message: string;
};

export type LifecyclePreparation =
  | {readonly status: 'ready'; readonly request: LifecycleRequest; readonly trashItemIds: readonly string[]}
  | {readonly status: 'rejected'; readonly error: LifecycleRejection};

const EMPTY_TRASH_REQUEST_MESSAGE = '部分文献已归档、删除或不存在，请刷新后重试';

/**
 * Preserve the native BTreeSet ordering used for a `trashMany` request.
 * JavaScript's Set preserves insertion order, so sort explicitly to retain
 * the Rust ordering for non-sorted caller input.
 */
function sortedUnique(values: readonly string[]): readonly string[] {
  return [...new Set(values)].sort();
}

export function prepareLifecycle(request: LifecycleRequest): LifecyclePreparation {
  if (request.kind === 'trashMany') {
    if (request.itemIds.length === 0) {
      return {
        status: 'rejected',
        error: {code: 'not_found', message: EMPTY_TRASH_REQUEST_MESSAGE},
      };
    }
    return {status: 'ready', request, trashItemIds: sortedUnique(request.itemIds)};
  }
  return {status: 'ready', request, trashItemIds: []};
}

export function lifecycleRejectionCodeAsString(code: LifecycleRejection['code']): string {
  return code;
}
