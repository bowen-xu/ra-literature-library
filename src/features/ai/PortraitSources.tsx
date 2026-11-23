import { ControlHint } from "@research-assistant/workbench-sdk/overlay";
import { FileText, Plus, X } from "lucide-react";
import type { LiteratureItem } from "@research-assistant/core/literature";
import { ActionMenu, ActionMenuItem } from "@research-assistant/workbench-sdk/overlay";

export function PortraitSources({ attachments, selectedIds, disabled, onChange }: {
  readonly attachments: LiteratureItem["attachments"];
  readonly selectedIds: readonly string[];
  readonly disabled: boolean;
  readonly onChange: (ids: readonly string[]) => void;
}): React.JSX.Element {
  const pdfs = attachments.filter(attachment => attachment.mimeType === "application/pdf");
  const selected = pdfs.filter(attachment => selectedIds.includes(attachment.id));
  const available = pdfs.filter(attachment => !selectedIds.includes(attachment.id));
  return <div className="portrait-source-options" role="group" aria-label="来源 PDF">
    <span className="portrait-source-caption">来源 PDF</span>
    <div className="portrait-source-files">
      {selected.map(attachment => <span className="portrait-source-chip" key={attachment.id}>
        <FileText size={15} aria-hidden="true" /><ControlHint content={attachment.displayName}><span>{attachment.displayName}</span></ControlHint>
        <button type="button" className="portrait-source-remove" aria-label={`移除来源 ${attachment.displayName}`} disabled={disabled}
          onClick={() => onChange(selectedIds.filter(id => id !== attachment.id))}><X size={13} aria-hidden="true" /></button>
      </span>)}
      {selected.length === 0 && <span className="portrait-source-empty">未添加来源</span>}
      <ActionMenu label="添加来源 PDF" trigger={<Plus size={15} aria-hidden="true" />} className="portrait-source-add-menu" triggerClassName="portrait-tag-add"
        contentClassName="portrait-tag-menu portrait-source-menu" portal disabled={disabled || available.length === 0 || selected.length >= 8}>
        {available.map(attachment => <ActionMenuItem key={attachment.id} onClick={() => onChange([...selectedIds, attachment.id])}>
          <FileText size={15} aria-hidden="true" /><span>{attachment.displayName}</span>
        </ActionMenuItem>)}
      </ActionMenu>
    </div>
  </div>;
}
