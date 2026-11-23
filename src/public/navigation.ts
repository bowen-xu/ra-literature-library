/** Domain navigation supplied to application composition; Core only owns locator contracts. */
import {loadLibrarySession} from "../features/reader/session/librarySessionStorage";
import {LIBRARY_TAB_ID} from "../features/reader/session/ReaderSessionRegistry";

export const libraryNavigationRestore = {
  homeTabId: LIBRARY_TAB_ID,
  readActiveTabId: () => loadLibrarySession().activeTabId,
};

export { ReadingTemplateDialog } from "../features/ai/resources/ReadingTemplateDialog";
export { requestPortraitDetail } from "../features/ai/portraitDetailNavigation";
export type { AiSourceInspectionRequest } from "../features/ai/aiEvidenceNavigation";
