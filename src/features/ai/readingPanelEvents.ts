/** Invalidate paper-scoped snapshots after a committed mutation in either reading rail. */
const eventName = "research-assistant:paper-reading-changed";
export function publishPaperReadingChanged(paperId: string, sourceId: string): void {
  window.dispatchEvent(new CustomEvent<{ paperId: string; sourceId: string }>(eventName, { detail: { paperId, sourceId } }));
}
export function subscribePaperReadingChanged(paperId: string, refresh: () => void, sourceId: string, options?: { readonly capture: boolean }): () => void {
  const listener = (event: Event): void => { const detail = (event as CustomEvent<{ paperId: string; sourceId: string }>).detail; if (detail.paperId === paperId && detail.sourceId !== sourceId) refresh(); };
  window.addEventListener(eventName, listener, options);
  return () => window.removeEventListener(eventName, listener, options);
}
