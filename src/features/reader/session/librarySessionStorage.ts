import { getAppStorage } from "@research-assistant/workbench-sdk/storage";
import type { LiteratureGateway } from "../../../services/literatureGateway";
import { LIBRARY_TAB_ID, ReaderSessionRegistry } from "./ReaderSessionRegistry";

export const LIBRARY_SESSION_KEY = "research-assistant:library-session.v1";

interface SavedReaderTab {
  readonly itemId: string;
  readonly attachmentId: string;
  readonly contentSha256: string;
}

export interface SavedLibrarySession {
  readonly version: 1;
  readonly tabs: readonly SavedReaderTab[];
  readonly activeTabId: string;
}

export function loadLibrarySession(): SavedLibrarySession {
  const empty: SavedLibrarySession = { version: 1, tabs: [], activeTabId: LIBRARY_TAB_ID };
  try {
    const raw = getAppStorage().getItem(LIBRARY_SESSION_KEY);
    if (raw === null) return empty;
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null || !("version" in value) || value.version !== 1
      || !("tabs" in value) || !Array.isArray(value.tabs)
      || !("activeTabId" in value) || typeof value.activeTabId !== "string") return empty;
    const tabs: SavedReaderTab[] = [];
    const ids = new Set<string>();
    for (const tab of value.tabs as unknown[]) {
      if (typeof tab !== "object" || tab === null
        || !("itemId" in tab) || typeof tab.itemId !== "string" || !tab.itemId
        || !("attachmentId" in tab) || typeof tab.attachmentId !== "string" || !tab.attachmentId
        || !("contentSha256" in tab) || typeof tab.contentSha256 !== "string"
        || !/^[a-f0-9]{64}$/i.test(tab.contentSha256) || ids.has(tab.attachmentId)) continue;
      ids.add(tab.attachmentId);
      tabs.push({ itemId: tab.itemId, attachmentId: tab.attachmentId, contentSha256: tab.contentSha256 });
    }
    const activeTabId = tabs.some(tab => `reader:${tab.attachmentId}` === value.activeTabId)
      ? value.activeTabId : LIBRARY_TAB_ID;
    return { version: 1, tabs, activeTabId };
  } catch { return empty; }
}

export function saveLibrarySession(registry: ReaderSessionRegistry): void {
  const snapshot: SavedLibrarySession = {
    version: 1,
    tabs: registry.sessions.map(({ item, attachment }) => ({
      itemId: item.id, attachmentId: attachment.id, contentSha256: attachment.contentSha256,
    })),
    activeTabId: registry.activeTabId,
  };
  getAppStorage().setItem(LIBRARY_SESSION_KEY, JSON.stringify(snapshot));
}

/** Resolve identities against current records; never persist paper bodies or stale source jumps. */
export async function restoreLibrarySession(snapshot: SavedLibrarySession, gateway: Pick<LiteratureGateway, "get">) {
  const itemIds = [...new Set(snapshot.tabs.map(tab => tab.itemId))];
  const resolved = await Promise.allSettled(itemIds.map(id => gateway.get(id)));
  const records = new Map(itemIds.map((id, index) => [id, resolved[index]]));
  let registry = new ReaderSessionRegistry();
  let unavailable = 0;
  for (const tab of snapshot.tabs) {
    const result = records.get(tab.itemId);
    const item = result?.status === "fulfilled" ? result.value : undefined;
    const attachment = item?.attachments.find(candidate => candidate.id === tab.attachmentId
      && candidate.mimeType === "application/pdf" && candidate.contentSha256 === tab.contentSha256);
    if (item === undefined || attachment === undefined) { unavailable++; continue; }
    registry = registry.open({ item, attachment });
  }
  return { registry: registry.activate(registry.sessions.some(tab => tab.id === snapshot.activeTabId)
    ? snapshot.activeTabId : LIBRARY_TAB_ID), unavailable };
}
