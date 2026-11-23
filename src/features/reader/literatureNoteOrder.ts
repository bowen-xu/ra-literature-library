import { getAppStorage } from "@research-assistant/workbench-sdk/storage";

const key = (paperId: string) => `research-assistant.literature-note-order.v1:${paperId}`;
export function readLiteratureNoteOrder(paperId: string): readonly string[] {
  try {
    const saved: unknown = JSON.parse(getAppStorage().getItem(key(paperId)) ?? "[]");
    return Array.isArray(saved) && saved.every(id => typeof id === "string") ? [...new Set(saved)] : [];
  } catch { return []; }
}
/** Newly created notes precede the existing manual order; timestamps come from the gateway. */
export function orderedLiteratureNoteIds(newestFirst: readonly string[], manual: readonly string[]): readonly string[] {
  const available = new Set(newestFirst), known = new Set(manual);
  return [...newestFirst.filter(id => !known.has(id)), ...manual.filter(id => available.has(id))];
}
export function moveLiteratureNote(ids: readonly string[], from: string, to: string): readonly string[] {
  if (from === to || !ids.includes(from) || !ids.includes(to)) return ids;
  const next = ids.filter(id => id !== from); next.splice(ids.indexOf(to), 0, from); return next;
}
export function saveLiteratureNoteOrder(paperId: string, ids: readonly string[]): void {
  getAppStorage().setItem(key(paperId), JSON.stringify(ids));
}
