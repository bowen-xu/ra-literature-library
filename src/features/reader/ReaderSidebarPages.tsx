import { Tab, TabList, TabPanel, TabProvider } from "@ariakit/react";
import { useId, type ReactNode } from "react";
import { Bot, NotebookPen } from "lucide-react";
import { ControlHint } from "@research-assistant/workbench-sdk/overlay";

/** Keep both pages mounted so switching preserves editors and each page's scroll position. */
export function ReaderSidebarPages({ reading, notes }: { readonly reading?: ReactNode; readonly notes: ReactNode }): React.JSX.Element {
  const id = useId();
  const readingId = `${id}-reading`, notesId = `${id}-notes`;
  if (!reading) return <div className="reader-sidebar-page">{notes}</div>;
  return <TabProvider defaultSelectedId={readingId}>
    <TabList className="reader-notes-tabs" aria-label="阅读侧栏">
      <ControlHint content="辅助阅读"><Tab id={readingId} aria-label="辅助阅读"><Bot size={17} aria-hidden="true" /></Tab></ControlHint>
      <ControlHint content="高亮与笔记"><Tab id={notesId} aria-label="高亮与笔记"><NotebookPen size={17} aria-hidden="true" /></Tab></ControlHint>
    </TabList>
    <TabPanel tabId={readingId} className="reader-sidebar-page" unmountOnHide={false}>{reading}</TabPanel>
    <TabPanel tabId={notesId} className="reader-sidebar-page" unmountOnHide={false}>{notes}</TabPanel>
  </TabProvider>;
}
