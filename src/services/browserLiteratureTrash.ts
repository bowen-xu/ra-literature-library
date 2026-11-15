import { getAppStorage } from "@research-assistant/workbench-sdk/storage";
import type { LiteratureItem } from "@research-assistant/core/literature";

/** Stage the complete batch before touching storage; undo the first write if the second fails. */
export function trashBrowserLiterature(
  itemIds: readonly string[], items: readonly LiteratureItem[], trash: readonly LiteratureItem[],
  keys: { readonly items: string; readonly trash: string },
): void {
  const ids = new Set(itemIds);
  const selected = items.filter((item) => ids.has(item.id));
  if (!ids.size || selected.length !== ids.size) throw new Error("部分文献已归档、删除或不存在，请刷新后重试");
  const trashedAt = new Date().toISOString();
  const nextTrash = [...selected.map((item) => ({ ...item, trashedAt })), ...trash.filter((item) => !ids.has(item.id))];
  const nextItems = items.filter((item) => !ids.has(item.id));
  const storage = getAppStorage();
  const oldTrash = storage.getItem(keys.trash);
  storage.setItem(keys.trash, JSON.stringify(nextTrash));
  try {
    storage.setItem(keys.items, JSON.stringify(nextItems));
  } catch (error) {
    if (oldTrash === null) storage.removeItem(keys.trash);
    else storage.setItem(keys.trash, oldTrash);
    throw error;
  }
}
