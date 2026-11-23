import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import type { ReaderSourceNavigation } from "../ReaderSourceNavigation";
import type { ReaderSessionController, ReaderSessionSnapshot } from "../session/ReaderSessionController";

/** Resolve navigation into the same PDF selection store used by ordinary selection. */
export function useReaderSourceSelection({source, contentSha256, controller, ready, pageCount, pageHosts, announce, beginSelection}: {
  readonly source: ReaderSourceNavigation | undefined;
  readonly contentSha256: string;
  readonly controller: Pick<ReaderSessionController, "resolveLineSelection" | "resolveQuoteSelection" | "navigate" | "viewController">;
  readonly ready: boolean; readonly pageCount: number;
  readonly pageHosts: ReaderSessionSnapshot["pageHosts"];
  readonly announce: (message: string) => void;
  readonly beginSelection: () => void;
}) {
  const view = controller.viewController;
  const readSelection = useCallback(() => view.getSnapshot().selection, [view]);
  const selection = useSyncExternalStore(view.subscribe, readSelection);
  const handled = useRef<ReaderSourceNavigation | undefined>(undefined);
  const started = useRef<ReaderSourceNavigation | undefined>(undefined);
  const pending = useRef<{source:ReaderSourceNavigation; revision:number} | undefined>(undefined);
  const located = useRef<ReaderSourceNavigation | undefined>(undefined);
  useEffect(() => {handled.current = undefined; started.current = undefined; pending.current = undefined; located.current = undefined;}, [contentSha256, view]);
  useEffect(() => view.subscribe(() => {
    const request = pending.current;
    if (request && request.revision !== view.getSnapshot().selectionRevision) {handled.current = request.source; pending.current = undefined;}
  }), [view]);
  useEffect(() => {
    if (source && handled.current === source) return;
    if (!source || !ready || !source.quoteExact && !source.navigationLineRange) return;
    if (started.current !== source) {started.current = source; beginSelection(); view.clearSelection();}
    if (source.contentSha256 !== contentSha256 || ["needs_relocation", "unavailable", "paper_in_trash"].includes(source.state)) {
      announce("来源版本已变化，未选中文字。"); source.navigationOnError?.(new Error("来源版本已变化，无法定位批注")); return;
    }
    let stale = false;
    const revision = view.getSnapshot().selectionRevision;
    pending.current = {source,revision};
    const request = source.navigationLineRange
      ? source.pageIndex >= pageCount ? Promise.reject(new Error("来源页码超出当前 PDF")) : controller.resolveLineSelection(source.pageIndex, source.navigationLineRange)
      : controller.resolveQuoteSelection(source.pageIndex, source.quoteExact, source.quotePrefix, source.quoteSuffix);
    void request.then(value => {
      if (stale || view.getSnapshot().selectionRevision !== revision) return;
      if (value) {pending.current = undefined; handled.current = source; located.current = source; view.setSelection(value);}
      if (value && source.navigationLineRange) {
        controller.navigate({alignment:"center",pageIndex:value.focusPageIndex,
          position:{attachmentSha256:contentSha256,segments:value.segments.map(segment => ({...segment,exactText:segment.text}))},history:"skip"});
      }
      announce(value ? "已定位并选中原文文字。" : "来源位置不可用或已变化，未创建精确选区。");
      if (!value) source.navigationOnError?.(new Error("来源文字位置不可用或已变化"));
    }).catch(reason => {
      if (!stale && view.getSnapshot().selectionRevision === revision) {announce("来源页码或文字位置不可用，未完成精确定位。"); source.navigationOnError?.(reason);}
    });
    return () => {stale = true;};
  }, [source, contentSha256, controller, view, ready, pageHosts, pageCount, announce, beginSelection]);
  return {selection, locatedSource:located.current};
}
