import { useId, type MouseEvent, type ReactNode } from "react";
import { ChevronDown, ChevronRight, FileText } from "lucide-react";
import type { AttachmentSummary, LiteratureItem } from "@research-assistant/core/literature";

/** The disclosure is a sibling of the selectable row, so it never changes batch selection. */
export function LiteratureAttachmentRows({ item, expanded, isFileDropTarget = false, onExpandedChange, onOpen, onContextMenu, children }: {
  readonly item: LiteratureItem;
  readonly expanded: boolean;
  readonly isFileDropTarget?: boolean;
  readonly onExpandedChange: (expanded: boolean) => void;
  readonly onOpen: (attachment: AttachmentSummary) => void;
  readonly onContextMenu: (event: MouseEvent<HTMLButtonElement>, attachment: AttachmentSummary) => void;
  readonly children: ReactNode;
}): React.JSX.Element {
  const groupId = useId();
  return <div className="literature-item-group" data-literature-drop-item={item.id} data-file-drop-target={isFileDropTarget || undefined} onKeyDown={event => {
    if (!(event.target instanceof HTMLButtonElement) || !event.target.matches(".literature-row, .literature-attachment-toggle") || item.attachments.length === 0) return;
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      onExpandedChange(event.key === "ArrowRight");
    }
  }}>
    {children}
    {item.attachments.length > 0 && <button type="button" className="literature-attachment-toggle"
      aria-label={`${expanded ? "收起" : "展开"} ${item.title} 的附件`} aria-expanded={expanded} aria-controls={groupId}
      onClick={() => onExpandedChange(!expanded)}>
      {expanded ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />}
    </button>}
    {item.attachments.length > 0 && <div id={groupId} hidden={!expanded} className="literature-attachment-children" role="group" aria-label={`${item.title} 的附件`}>
      {item.attachments.map(attachment => <button type="button" className="literature-attachment-row" key={attachment.id}
        aria-label={`打开附件 ${attachment.displayName}`} onClick={() => onOpen(attachment)} onContextMenu={event => onContextMenu(event, attachment)}>
        <FileText size={16} aria-hidden="true" /><span>{attachment.displayName}</span>
        <small>{(attachment.byteSize / 1024 / 1024).toFixed(1)} MB</small>
      </button>)}
    </div>}
  </div>;
}
