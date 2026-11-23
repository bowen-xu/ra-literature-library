import { useId, useState } from "react";
import type { AttachmentSummary } from "@research-assistant/core/literature";
import { Dialog } from "@research-assistant/workbench-sdk/overlay";
import "./LiteratureAttachmentDialog.css";

export function LiteratureAttachmentDialog({ mode, attachment, onClose, onSubmit }: {
  readonly mode: "rename" | "remove";
  readonly attachment: AttachmentSummary;
  readonly onClose: () => void;
  readonly onSubmit: (name: string) => Promise<void>;
}): React.JSX.Element {
  const title = useId(), label = mode === "rename" ? "重命名附件" : "删除附件";
  const [name, setName] = useState(attachment.displayName);
  const [busy, setBusy] = useState(false), [error, setError] = useState<string>();
  return <Dialog open aria-labelledby={title} className="literature-attachment-dialog" backdrop={false}
    hideOnInteractOutside={false} hideOnEscape={!busy} onClose={() => { if (!busy) onClose(); }}>
    <form onSubmit={event => {
      event.preventDefault(); if (busy) return;
      setBusy(true); setError(undefined);
      void onSubmit(name.trim()).then(onClose).catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : String(reason));
      }).finally(() => setBusy(false));
    }}>
      <h2 id={title}>{label}</h2>
      {mode === "rename" ? <><label>附件名称<input autoFocus aria-label="附件名称" value={name} disabled={busy} onChange={event => setName(event.target.value)} /></label>
        <p>只更改显示名称，不改变实际存储文件名和路径。</p></> : <>
        <p>删除“{attachment.displayName}”？此操作不能撤销。</p>
        <p>该 PDF 的阅读位置、高亮、批注和解析会一并移除；阅读笔记正文保留，原文定位将失效。已有研究上下文或证据引用可能阻止删除。</p>
        <p>共用文件会保留；未被引用的存储文件会删除，文件已不存在时只清理记录。</p>
      </>}
      {error && <p role="alert" className="inline-error">{error}</p>}
      <div className="form-actions"><button type="button" className="ghost-button" disabled={busy} onClick={onClose}>取消</button>
        <button type="submit" className="primary-button" disabled={busy || mode === "rename" && (!name.trim() || [...name.trim()].length > 255)}>{busy ? "处理中…" : label}</button></div>
    </form>
  </Dialog>;
}
