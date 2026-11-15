import { useCallback, useEffect, useRef, useState, type SetStateAction } from "react";
import type { LiteratureGateway } from "../../../services/literatureGateway";
import { loadLibrarySession, restoreLibrarySession, saveLibrarySession } from "./librarySessionStorage";
import { LIBRARY_TAB_ID, ReaderSessionRegistry } from "./ReaderSessionRegistry";

interface LibrarySessionsOptions {
  readonly gateway: LiteratureGateway;
  readonly requestedTabId?: string;
  readonly onSessionsChanged?: (tabIds: readonly string[], activeTabId: string) => void;
  readonly onWarning: (message: string) => void;
}

export function useLibrarySessions(options: LibrarySessionsOptions) {
  const [snapshot] = useState(loadLibrarySession);
  const [registry, setState] = useState(() => new ReaderSessionRegistry());
  const [ready, setReady] = useState(snapshot.tabs.length === 0);
  const current = useRef(registry);
  const callbacks = useRef(options);
  callbacks.current = options;
  const setRegistry = useCallback((update: SetStateAction<ReaderSessionRegistry>) => {
    const next = typeof update === "function" ? update(current.current) : update;
    current.current = next;
    setState(next);
  }, []);

  useEffect(() => {
    if (snapshot.tabs.length === 0) return;
    let cancelled = false;
    void restoreLibrarySession(snapshot, options.gateway).then(result => {
      if (cancelled) return;
      setRegistry(result.registry);
      setReady(true);
      if (result.unavailable) callbacks.current.onWarning(`${result.unavailable} 个文献标签未能恢复：文献或原附件不可用。`);
    });
    return () => { cancelled = true; };
  }, [options.gateway, setRegistry, snapshot]);

  useEffect(() => {
    if (!ready || options.requestedTabId === undefined) return;
    setRegistry(current => current.activeTabId === options.requestedTabId
      ? current : current.activate(options.requestedTabId ?? LIBRARY_TAB_ID));
  }, [options.requestedTabId, ready, setRegistry]);

  useEffect(() => {
    if (!ready) return;
    try { saveLibrarySession(registry); }
    catch { callbacks.current.onWarning("文献标签保存失败；本次打开状态可能无法在重启后恢复。"); }
    callbacks.current.onSessionsChanged?.(registry.sessions.map(tab => tab.id), registry.activeTabId);
  }, [ready, registry]);

  return { registry, setRegistry, ready };
}
