/** A source link targets one paper. Retain it across the library's mounting
 * transition; the matching production panel consumes it exactly once. */
let pending: string | undefined;
const listeners = new Set<() => void>();
export function requestPortraitDetail(paperId: string): void {
  pending = paperId;
  // Let workspace selection commit before notifying already mounted rails.
  window.setTimeout(() => { for (const listener of listeners) listener(); }, 0);
}
export function subscribePortraitDetail(paperId: string, open: () => void): () => void {
  const consume = () => {
    if (pending !== paperId) return;
    pending = undefined;
    open();
  };
  listeners.add(consume);
  consume();
  return () => { listeners.delete(consume); };
}
