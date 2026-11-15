import { useEffect, useRef } from "react";
import type { DuplicateCandidate, LiteratureItem } from "@research-assistant/core/literature";

import { isDesktopRuntime } from "@research-assistant/workbench-sdk/environment";
import { listenBrowserCaptures } from "@research-assistant/workbench-sdk/library-capture";
import type { LiteratureGateway } from "../public/literatureGateway";

interface BrowserCaptureRefreshOptions {
  readonly gateway: Pick<LiteratureGateway, "list" | "listTrash" | "listDuplicates">;
  readonly query: string;
  readonly showTrash: boolean;
  readonly onItems: (items: readonly LiteratureItem[]) => void;
  readonly onDuplicates: (duplicates: readonly DuplicateCandidate[]) => void;
  readonly onError: (message: string) => void;
}

/** Refresh data only: selection, reader sessions and local edit drafts retain their owners. */
export function useBrowserCaptureRefresh(options: BrowserCaptureRefreshOptions): void {
  const latest = useRef(options);
  latest.current = options;
  useEffect(() => {
    if (!isDesktopRuntime()) return;
    let active = true, refreshing = false, pending = false;
    let unlisten: (() => void) | undefined;
    async function refresh(): Promise<void> {
      pending = true;
      if (refreshing) return;
      refreshing = true;
      try {
        while (active && pending) {
          pending = false;
          const snapshot = latest.current;
          const [items, duplicates] = await Promise.all([
            snapshot.showTrash ? snapshot.gateway.listTrash(snapshot.query) : snapshot.gateway.list(snapshot.query),
            snapshot.gateway.listDuplicates(),
          ]);
          if (!active) return;
          if (snapshot.query !== latest.current.query || snapshot.showTrash !== latest.current.showTrash) {
            pending = true;
            continue;
          }
          latest.current.onItems(items);
          latest.current.onDuplicates(duplicates);
        }
      } catch {
        if (active) latest.current.onError("浏览器采集已写入，但文献列表刷新失败，请切换文献库后重试。");
      } finally { refreshing = false; }
    }
    void listenBrowserCaptures(() => { void refresh(); }).then(stop => {
      if (active) unlisten = stop;
      else stop();
    }).catch(() => {
      if (active) latest.current.onError("无法监听浏览器采集更新，请重新打开文献库。");
    });
    return () => { active = false; unlisten?.(); };
  }, [options.gateway]);
}
