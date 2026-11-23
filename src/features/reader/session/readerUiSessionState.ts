import { getAppStorage } from "@research-assistant/workbench-sdk/storage";
import {
  DEFAULT_READER_UI_SESSION_STATE,
  decodeReaderUiSessionState,
  type ReaderUiSessionState,
} from "@research-assistant/core/reader";

const STORAGE_PREFIX = "research-assistant.reader-ui-session.v1:";

export function readerUiSessionStorageKey(attachmentId: string): string {
  return `${STORAGE_PREFIX}${attachmentId}`;
}

export function loadReaderUiSessionState(attachmentId: string): ReaderUiSessionState {
  try {
    const value = getAppStorage().getItem(readerUiSessionStorageKey(attachmentId));
    return value === null
      ? DEFAULT_READER_UI_SESSION_STATE
      : decodeReaderUiSessionState(JSON.parse(value)) ?? DEFAULT_READER_UI_SESSION_STATE;
  } catch {
    return DEFAULT_READER_UI_SESSION_STATE;
  }
}

export function saveReaderUiSessionState(attachmentId: string, state: ReaderUiSessionState): void {
  try {
    getAppStorage().setItem(readerUiSessionStorageKey(attachmentId), JSON.stringify(state));
  } catch {
    // The mounted session remains authoritative when browser storage is unavailable.
  }
}
