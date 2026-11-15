import { ArrowUpRight, FileText, Plus, X } from "lucide-react";
import { ControlHint } from "@research-assistant/workbench-sdk/overlay";
import { ActionMenu, ActionMenuItem } from "@research-assistant/workbench-sdk/overlay";
import type { AttachmentSummary } from "@research-assistant/core/literature";
import type { ReactNode } from "react";

interface SourcePdfPickerProps {
  readonly headerActions?: ReactNode;
  readonly attachments: readonly AttachmentSummary[];
  readonly busy: boolean;
  readonly currentAttachmentId?: string;
  readonly onOpen: (attachment: AttachmentSummary) => void;
  readonly onSelectionChange: (attachmentIds: readonly string[]) => void;
  readonly selectedAttachmentIds: readonly string[];
}

export function SourcePdfPicker({ attachments, busy, currentAttachmentId, headerActions, onOpen, onSelectionChange, selectedAttachmentIds }: SourcePdfPickerProps): React.JSX.Element {
  const selectedIds = new Set(selectedAttachmentIds);
  const selectedAttachments = attachments.filter(({ id }) => selectedIds.has(id));
  function add(attachmentId: string): void {
    if (busy || selectedIds.has(attachmentId) || selectedIds.size >= 8) return;
    onSelectionChange([...selectedAttachmentIds, attachmentId]);
  }
  return <div className="source-pdf-picker">
    <div className="source-pdf-header"><span className="source-pdf-label">辅助阅读</span>{headerActions && <div className="source-pdf-header-actions">{headerActions}</div>}</div>
    <div className="source-pdf-controls">
      {selectedAttachments.map(attachment => <span className="source-pdf-tag" key={attachment.id}>
        {attachment.id === currentAttachmentId
          ? <span className="source-pdf-tag-name" aria-label={`当前阅读 ${attachment.displayName}`}><FileText size={13} aria-hidden="true" /><span>{attachment.displayName}</span></span>
          : <ControlHint content={`跳转到 ${attachment.displayName}`}><button type="button" className="source-pdf-tag-name" aria-label={`跳转到 ${attachment.displayName}`} onClick={() => onOpen(attachment)}><FileText size={13} aria-hidden="true" /><span>{attachment.displayName}</span><ArrowUpRight size={13} aria-hidden="true" /></button></ControlHint>}
        <ControlHint content={`移除来源 ${attachment.displayName}`}><button type="button" disabled={busy} className="source-pdf-tag-remove" aria-label={`移除来源 ${attachment.displayName}`} onClick={() => onSelectionChange(selectedAttachmentIds.filter(id => id !== attachment.id))}><X size={12} aria-hidden="true" /></button></ControlHint>
      </span>)}
      <ActionMenu label="添加来源 PDF" menuLabel="添加来源 PDF" hint trigger={<Plus size={14} aria-hidden="true" />} className="source-pdf-add-menu"
        triggerClassName="source-pdf-trigger" contentClassName="source-pdf-popover" portal placement="bottom-end" disabled={busy || attachments.length === 0}>
        {attachments.map(attachment => <div className="source-pdf-option" key={attachment.id}>
          <ActionMenuItem className="source-pdf-add-action" aria-label={`添加 ${attachment.displayName}`} disabled={busy || selectedIds.has(attachment.id) || selectedIds.size >= 8} onClick={() => add(attachment.id)}>
            <FileText aria-hidden="true" size={15} /><span><strong>{attachment.displayName}</strong><small>{selectedIds.has(attachment.id) ? "已添加" : `PDF · ${(attachment.byteSize / 1024 / 1024).toFixed(1)} MB`}</small></span>
          </ActionMenuItem>
          {attachment.id !== currentAttachmentId && <ActionMenuItem aria-label={`跳转到 ${attachment.displayName}`} className="source-pdf-open-action" onClick={() => onOpen(attachment)}><ArrowUpRight aria-hidden="true" size={15} strokeWidth={1.8} /></ActionMenuItem>}
        </div>)}
      </ActionMenu>
      {attachments.length === 0 && <small>没有 PDF 附件</small>}
    </div>
  </div>;
}
