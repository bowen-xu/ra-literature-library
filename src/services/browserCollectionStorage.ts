import { getAppStorage } from "@research-assistant/workbench-sdk/storage";
import { decodeCollectionState, emptyCollectionState, type CollectionState } from "@research-assistant/core/collections";
export const COLLECTION_STORAGE_KEY = "research-assistant.collections.v1";
export function readBrowserCollections(): CollectionState {
  const raw = getAppStorage().getItem(COLLECTION_STORAGE_KEY);
  return raw === null ? emptyCollectionState() : decodeCollectionState(JSON.parse(raw));
}
/** Called only for permanently purged literature; archiving/trashing keeps classification. */
export function purgeBrowserCollections(itemIds: readonly string[]): void {
  const state = readBrowserCollections();
  const memberships = state.memberships.filter((m) => !itemIds.includes(m.itemId));
  const assignments = state.assignments.filter((a) => !itemIds.includes(a.itemId));
  if (memberships.length === state.memberships.length && assignments.length === state.assignments.length) return;
  getAppStorage().setItem(COLLECTION_STORAGE_KEY, JSON.stringify({ ...state, revision: state.revision + 1, memberships, assignments }));
}
