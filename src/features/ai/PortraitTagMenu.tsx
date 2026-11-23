import { Dialog } from "@research-assistant/workbench-sdk/overlay";
import { useNotificationState } from "@research-assistant/workbench-sdk/feedback";
import { DialogHeading } from "@ariakit/react";
import { Pencil, Plus, X } from "lucide-react";
import { useRef, useState, type ReactNode, type RefObject } from "react";
import { type PortraitTagDimension, type PortraitTagOption } from "@research-assistant/core/ai";
import { ActionMenu, ActionMenuItem } from "@research-assistant/workbench-sdk/overlay";

export function PortraitTagMenu({ dimension, title, tags, disabled, onSaveTags, trigger, finalFocus }: {
  readonly dimension: PortraitTagDimension;
  readonly title: string;
  readonly tags: readonly PortraitTagOption[];
  readonly disabled: boolean;
  readonly onSaveTags: (dimension: PortraitTagDimension, tags: readonly PortraitTagOption[]) => boolean;
  readonly trigger?: ReactNode;
  readonly finalFocus?: RefObject<HTMLElement | null>;
}): React.JSX.Element {
  const [editing, setEditing] = useState<PortraitTagOption | "new">();
  const buttonRef = useRef<HTMLButtonElement>(null);
  return <>
    <ActionMenu label={`${trigger === undefined ? "编辑" : "管理"}${title}标签`} trigger={trigger ?? <Pencil size={15} aria-hidden="true" />} triggerRef={buttonRef}
      className="portrait-tag-edit-menu" {...(trigger === undefined ? { triggerClassName: "portrait-dimension-edit" } : {})}
      contentClassName="portrait-tag-menu" portal disabled={disabled} autoFocusOnHide={editing === undefined}>
      {tags.map(tag => <ActionMenuItem key={tag.label} onClick={() => setEditing(tag)}>{tag.label}</ActionMenuItem>)}
      <ActionMenuItem disabled={tags.length >= 16} onClick={() => setEditing("new")}><Plus size={14} aria-hidden="true" />新建标签</ActionMenuItem>
    </ActionMenu>
    {editing !== undefined && <PortraitTagEditDialog dimension={dimension} title={title} original={editing} tags={tags} disabled={disabled}
      finalFocus={finalFocus ?? buttonRef} onClose={() => setEditing(undefined)} onSave={next => onSaveTags(dimension, next)} />}
  </>;
}

function PortraitTagEditDialog({ dimension: _dimension, title, original, tags, disabled, finalFocus, onClose, onSave }: {
  readonly dimension: PortraitTagDimension;
  readonly title: string;
  readonly original: PortraitTagOption | "new";
  readonly tags: readonly PortraitTagOption[];
  readonly disabled: boolean;
  readonly finalFocus: RefObject<HTMLElement | null>;
  readonly onClose: () => void;
  readonly onSave: (tags: readonly PortraitTagOption[]) => boolean;
}): React.JSX.Element {
  const [label, setLabel] = useState(original === "new" ? "" : original.label);
  const [description, setDescription] = useState(original === "new" ? "" : original.description);
  const [, setError] = useNotificationState("error");
  const inputRef = useRef<HTMLInputElement>(null);
  function save(): void {
    if (disabled || !label.trim() || !description.trim()) return;
    const next = { label: label.trim(), description: description.trim() };
    if (tags.some(tag => tag.label === next.label && (original === "new" || tag.label !== original.label))) {
      setError("已有同名标签，请使用不同的名称。"); return;
    }
    if (original !== "new" && !tags.some(tag => tag.label === original.label)) {
      setError("该标签已被移除，请关闭后重新选择。"); return;
    }
    if (onSave(original === "new" ? [...tags, next] : tags.map(tag => tag.label === original.label ? next : tag))) onClose();
  }
  return <Dialog open portal initialFocus={inputRef} finalFocus={finalFocus} hideOnInteractOutside={false} onClose={onClose}
    className="portrait-tag-dialog" aria-label={`${original === "new" ? "新建" : "编辑"}${title}标签信息`}
    backdrop={<div className="portrait-tag-dialog-backdrop" />}>
    <header><div><DialogHeading render={<h3 />}>{original === "new" ? "新建标签" : "编辑标签"}</DialogHeading><span>{title}</span></div>
      <button type="button" aria-label="关闭标签编辑" onClick={onClose}><X size={18} aria-hidden="true" /></button></header>
    <form onSubmit={event => { event.preventDefault(); save(); }}>
      <label>标签名称<input ref={inputRef} aria-label="标签名称" maxLength={120} disabled={disabled} required value={label} onChange={event => setLabel(event.target.value)} /></label>
      <label>解释说明<textarea aria-label="标签解释说明" rows={4} maxLength={200} disabled={disabled} required value={description} onChange={event => setDescription(event.target.value)} /></label>

      <footer>
        {original !== "new" && <button className="portrait-tag-delete" type="button" disabled={disabled || tags.length <= 1}
          onClick={() => { if (onSave(tags.filter(tag => tag.label !== original.label))) onClose(); }}>删除标签</button>}
        <button type="button" onClick={onClose}>取消</button>
        <button type="submit" disabled={disabled || !label.trim() || !description.trim()}>保存标签</button>
      </footer>
    </form>
  </Dialog>;
}
