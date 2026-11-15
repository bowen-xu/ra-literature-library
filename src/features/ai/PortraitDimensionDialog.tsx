import { Dialog } from "@research-assistant/workbench-sdk/overlay";
import { useNotificationState } from "@research-assistant/workbench-sdk/feedback";
import { DialogHeading } from "@ariakit/react";
import { useRef, useState, type RefObject } from "react";
import { X } from "lucide-react";
import { catalogDimensions, type CustomPortraitDimension, type PortraitCatalog } from "@research-assistant/core/ai";

export function PortraitDimensionDialog({ catalog, finalFocus, onSave, onClose }: {
  readonly catalog: PortraitCatalog;
  readonly finalFocus: RefObject<HTMLButtonElement | null>;
  readonly onSave: (dimension: CustomPortraitDimension) => boolean;
  readonly onClose: () => void;
}): React.JSX.Element {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [, setError] = useNotificationState("error");
  const inputRef = useRef<HTMLInputElement>(null);
  function save(): void {
    if (!title.trim() || !description.trim()) return;
    if (catalogDimensions(catalog).some(value => value.title === title.trim()) || ["核心贡献", "组织结构"].includes(title.trim())) {
      setError("请使用不同的维度名称；核心贡献属于结构化阅读。"); return;
    }
    if (onSave({ id: `custom_${crypto.randomUUID().replaceAll("-", "")}`, title: title.trim(), description: description.trim() })) onClose();
  }
  return <Dialog open portal initialFocus={inputRef} finalFocus={finalFocus} hideOnInteractOutside={false} onClose={onClose}
    aria-label="新增画像维度" className="portrait-tag-dialog" backdrop={<div className="portrait-tag-dialog-backdrop" />}>
    <header><DialogHeading render={<h3 />}>新增画像维度</DialogHeading><button type="button" aria-label="关闭维度编辑" onClick={onClose}><X size={18} /></button></header>
    <form onSubmit={event => { event.preventDefault(); save(); }}>
      <label>维度名称<input ref={inputRef} aria-label="维度名称" required maxLength={120} value={title} onChange={event => setTitle(event.target.value)} /></label>
      <label>维度说明<textarea aria-label="维度说明" required rows={3} maxLength={200} value={description} onChange={event => setDescription(event.target.value)} /></label>
      <p>创建后，使用维度标题旁的编辑按钮配置标签和通用说明。</p>

      <footer><button type="button" onClick={onClose}>取消</button><button type="submit" disabled={!title.trim() || !description.trim()}>创建维度</button></footer>
    </form>
  </Dialog>;
}
