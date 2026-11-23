import { createPortal } from "react-dom";
import { useEffect, useRef, useState, type RefObject } from "react";
import { NotebookPen, ScanText, Trash2, X } from "lucide-react";
import type { StoredWordExplanation } from "@research-assistant/core/dictionary";
import type { SourceRect } from "@research-assistant/core/literature";
import type { ReaderSessionController, ReaderSessionSnapshot } from "./session/ReaderSessionController";
import type { PdfPendingSelection } from "../knowledge/PdfSelectionActions";
import { ControlHint } from "@research-assistant/workbench-sdk/overlay";
import { PdfSelectionPopover } from "../../components/PdfSelectionPopover";
import { WordContextExplanation } from "@research-assistant/workbench-sdk/dictionary";
import { notify } from "@research-assistant/workbench-sdk/feedback";
import { MouseLeftShortcut } from "@research-assistant/workbench-sdk/ui";
import "./WordExplanationMarkers.css";

type OpenWord = { readonly record: StoredWordExplanation; readonly pageIndex: number; readonly point: SourceRect; readonly mode: "menu" | "explanation" };
export function WordExplanationMarkers({ records, reader, controller, boundaryRef, workspaceRef, active, onWriteNote, onDelete }: {
  readonly records: readonly StoredWordExplanation[];
  readonly reader: ReaderSessionSnapshot;
  readonly controller: ReaderSessionController;
  readonly boundaryRef: RefObject<HTMLDivElement | null>;
  readonly workspaceRef: RefObject<HTMLDivElement | null>;
  readonly active: boolean;
  readonly onWriteNote: (selection: PdfPendingSelection) => Promise<void>;
  readonly onDelete: (record: StoredWordExplanation) => Promise<void>;
}): React.JSX.Element {
  const [open, setOpen] = useState<OpenWord>();
  const [saving, setSaving] = useState(false);
  const popup = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open || !active) return;
    const dismiss = (event: PointerEvent): void => {
      if (event.target instanceof Node && (popup.current?.contains(event.target) || (event.target instanceof Element && event.target.closest(".word-explanation-marker")))) return;
      setOpen(undefined);
    };
    const key = (event: KeyboardEvent): void => { if (event.key === "Escape") { event.stopPropagation(); event.preventDefault(); setOpen(undefined); } };
    document.addEventListener("pointerdown", dismiss, true); document.addEventListener("keydown", key, true);
    return () => { document.removeEventListener("pointerdown", dismiss, true); document.removeEventListener("keydown", key, true); };
  }, [active, open]);
  useEffect(() => { if (!active) setOpen(undefined); }, [active]);
  useEffect(() => {
    if (!open) return;
    const current = records.find(record => record.id === open.record.id);
    if (!current) setOpen(undefined);
    else if (current !== open.record) setOpen({ ...open, record: current });
  }, [open, records]);
  async function writeNote(): Promise<void> {
    if (!open || saving) return;
    const pageLabel = reader.pageLabels[open.pageIndex] ?? String(open.pageIndex + 1);
    const point = { ...open.point, width: 0.00001, height: 0.00001 };
    setSaving(true);
    try {
      await onWriteNote({ text: "", rects: [point], prefix: "", suffix: "", pageIndex: open.pageIndex, pageLabel,
        segments: [{ pageIndex: open.pageIndex, pageLabel, rects: [point], text: "", prefix: "", suffix: "" }], popupPageIndex: open.pageIndex, popupRect: point });
      setOpen(undefined);
    } catch (error) { notify.error(error instanceof Error ? error.message : "写笔记失败，请重试。"); }
    finally { setSaving(false); }
  }
  function show(record: StoredWordExplanation, pageIndex: number, rect: SourceRect, x: number, y: number, mode: OpenWord["mode"]): void {
    const page = controller.clientRectForPageRect(pageIndex, { x: 0, y: 0, width: 1, height: 1 }); if (!page) return;
    const point = { x: (x - page.left) / page.width, y: (y - page.top) / page.height, width: 0, height: 0 };
    setOpen({ record, pageIndex, point: Number.isFinite(point.x) && Number.isFinite(point.y) ? point : rect, mode });
  }
  async function remove(): Promise<void> {
    if (!open || saving) return;
    setSaving(true);
    try { await onDelete(open.record); setOpen(undefined); }
    catch (error) { notify.error(error instanceof Error ? error.message : "删除词义解释失败，请重试。"); }
    finally { setSaving(false); }
  }
  return <>
    {reader.pageHosts.map(host => createPortal(records.flatMap(record => record.segments.filter(segment => segment.pageIndex === host.pageIndex)
      .flatMap(segment => segment.rects.map((rect, index) => <button key={`${record.id}:${index}`} type="button" aria-label={`查看“${record.context.word}”的词义解释`} data-pdf-text-selection="true" className="word-explanation-marker"
          style={{ left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.width * 100}%`, height: `${rect.height * 100}%` }}
          onContextMenu={event => { event.preventDefault(); event.stopPropagation(); show(record, host.pageIndex, rect, event.clientX, event.clientY, "menu"); }}
          onClick={event => {
            if (event.defaultPrevented || event.detail >= 2 || (!event.altKey && event.detail !== 0)) return;
            const page = controller.clientRectForPageRect(host.pageIndex, { x: 0, y: 0, width: 1, height: 1 }); if (!page) return;
            const point = event.detail === 0 ? { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, width: 0, height: 0 }
              : { x: (event.clientX - page.left) / page.width, y: (event.clientY - page.top) / page.height, width: 0, height: 0 };
            setOpen({ record, pageIndex: host.pageIndex, point, mode: "explanation" });
          }} />
      ))), host.element))}
    {open && active && <PdfSelectionPopover active compact={open.mode === "menu"} preferredWidth={open.mode === "menu" ? 94 : 380}
      centerOnAnchor={open.mode === "menu"} anchorControlCenter={47}
      anchorElement={reader.pageHosts.find(host => host.pageIndex === open.pageIndex)?.element} boundaryRef={boundaryRef} workspaceRef={workspaceRef}
      getAnchorClientRect={() => controller.clientRectForPageRect(open.pageIndex, open.point)} onRestoreFocus={() => controller.focus()}>
      <div ref={popup} className="word-explanation-popover">
        {open.mode === "menu" ? <div className="selection-card selection-action-card"><div className="selection-actions-toolbar"><div className="selection-primary-actions">
          <ControlHint content="删除词义解释"><button type="button" aria-label="删除词义解释" disabled={saving} onClick={() => void remove()}><Trash2 aria-hidden="true" size={18} /></button></ControlHint>
          <ControlHint content="查看词义解释" shortcut={<MouseLeftShortcut modifier="⌥" />}><button type="button" aria-label="查看词义解释" disabled={saving} onClick={() => setOpen({ ...open, mode: "explanation" })}><ScanText aria-hidden="true" size={18} /></button></ControlHint>
          <ControlHint content="写笔记"><button type="button" aria-label="写笔记" disabled={saving} onClick={() => void writeNote()}><NotebookPen aria-hidden="true" size={18} /></button></ControlHint>
        </div></div></div> : <div className="word-explanation-detail">
          <header><div className="word-explanation-heading"><span>{open.record.context.word}</span><ControlHint content="删除词义解释"><button type="button" aria-label="删除词义解释" disabled={saving} onClick={() => void remove()}><Trash2 aria-hidden="true" size={16} /></button></ControlHint></div><ControlHint content="关闭词义解释" shortcut="Esc"><button type="button" aria-label="关闭词义解释" onClick={() => setOpen(undefined)}><X aria-hidden="true" size={16} /></button></ControlHint></header>
          <WordContextExplanation explanation={open.record.explanation} context={open.record.context} />
        </div>}
      </div>
    </PdfSelectionPopover>}
  </>;
}
