import { useNotificationState } from "@research-assistant/workbench-sdk/feedback";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { SquarePen, Trash2 } from "lucide-react";
import type { LiteratureItem } from "@research-assistant/core/literature";
import type { LiteratureNoteSummary } from "@research-assistant/data/notes";
import { useLiteratureNotes, useNoteResourceVersion } from "@research-assistant/workbench-sdk/note-resources";
import { notify } from "@research-assistant/workbench-sdk/feedback";
import { ControlHint } from "@research-assistant/workbench-sdk/overlay";
import { usePointerReorder } from "@research-assistant/workbench-sdk/reorder";
import { ReorderGroup } from "@research-assistant/workbench-sdk/reorder";
import { ReorderableListRow, ReorderDragHandle } from "@research-assistant/workbench-sdk/reorder";
import { requestLiteratureNoteTrash } from "@research-assistant/workbench-sdk/literature-notes";
import type { NotePageId } from "@research-assistant/core/notes";
import { moveLiteratureNote, orderedLiteratureNoteIds, readLiteratureNoteOrder, saveLiteratureNoteOrder } from "./literatureNoteOrder";

/** Notes belong to the bibliographic item, so every PDF of that item shares this list. */
export function LiteratureNotes({ item, active, heading, feedback }: { readonly item: LiteratureItem; readonly active: boolean; readonly heading?: ReactNode; readonly feedback?: ReactNode }): React.JSX.Element {
  const client = useLiteratureNotes(), version = useNoteResourceVersion();
  const [notes, setNotes] = useState<readonly LiteratureNoteSummary[]>([]);
  const [order, setOrder] = useState(() => readLiteratureNoteOrder(item.id));
  const [creating, setCreating] = useState(false), [error, setError] = useNotificationState("error");
  const [deleting, setDeleting] = useState<NotePageId>();
  const alive = useRef(false), isActive = useRef(active); isActive.current = active;
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const load = useCallback(async () => {
    const next = await client.list(item.id);
    if (alive.current) { setNotes(next); setError(undefined); }
  }, [client, item.id]);
  useEffect(() => {
    let current = true;
    void client.list(item.id).then(next => { if (current) { setNotes(next); setError(undefined); } })
      .catch(reason => { if (current) setError(reason instanceof Error ? reason.message : String(reason)); });
    return () => { current = false; };
  }, [client, item.id, version]);
  const ids = orderedLiteratureNoteIds(notes.map(note => note.page.id), order);
  function move(from: string, to: string): boolean {
    const next = moveLiteratureNote(ids, from, to);
    try { saveLiteratureNoteOrder(item.id, next); setOrder(next); return true; }
    catch { notify.error("文献笔记顺序未能保存，请重试。"); return false; }
  }
  const reorder = usePointerReorder({ids,disabled:creating || deleting!==undefined,onReorder:({source,target})=>move(source,target)});
  async function trash(id: NotePageId): Promise<void> {
    if (deleting !== undefined) return;
    setDeleting(id);
    try { await requestLiteratureNoteTrash(id); await load(); }
    catch (reason) { notify.error(reason instanceof Error ? reason.message : String(reason)); }
    finally { if (alive.current) setDeleting(undefined); }
  }
  function open(id: string): void { window.dispatchEvent(new CustomEvent("research-assistant:open-literature-note", { detail: id })); }
  async function create(): Promise<void> {
    if (creating || deleting !== undefined) return;
    setCreating(true);
    try {
      const created = await client.create(item.id);
      if (alive.current) { await load(); if (isActive.current) open(created.page.id); }
    } catch (reason) { notify.error(reason instanceof Error ? reason.message : String(reason)); }
    finally { if (alive.current) setCreating(false); }
  }
  return <>
    <header className="reader-notes-heading">{heading ?? <strong>文献笔记</strong>}
      <ControlHint content={creating ? "正在创建文献笔记…" : "写文献笔记"}><button className="reading-icon-action literature-note-create" aria-label="写文献笔记" aria-busy={creating} disabled={creating || deleting !== undefined} onClick={() => void create()} type="button"><SquarePen size={16} aria-hidden="true" /></button></ControlHint>
    </header>
    <section className={`literature-notes${reorder.drag ? " is-reordering" : ""}`} aria-label="文献笔记">
    {feedback}
    {error && <button type="button" onClick={() => void load().catch(reason => setError(String(reason)))}>重试读取文献笔记</button>}
    <ReorderGroup as="ol" className="literature-note-list" order={reorder.order} dragging={!!reorder.drag}>{reorder.order.map(id => {
      const note = notes.find(value => value.page.id === id); if (!note) return null;
      return <ReorderableListRow key={id} itemId={id} data-literature-note={id} ref={element => { if (element) reorder.rows.current.set(id, element); else reorder.rows.current.delete(id); }}
        dragging={reorder.drag?.id === id} dropTarget={reorder.drag?.target === id && reorder.drag?.id !== id} offset={reorder.offsetFor(id)}>
        <ReorderDragHandle compact className="literature-note-drag" aria-label={`调整文献笔记顺序：${note.page.title}`} disabled={creating || deleting !== undefined}
          onPointerDown={event => reorder.start(id, event)} onKeyDown={event => {
            if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
            event.preventDefault(); const target = ids[ids.indexOf(id) + (event.key === "ArrowUp" ? -1 : 1)]; if (target) move(id, target);
          }} />
        <button className="literature-note-open" type="button" onClick={() => open(id)}><strong>{note.page.title}</strong>{note.preview && <span>{note.preview}</span>}</button>
        <button className="literature-note-trash" type="button" aria-label={`删除文献笔记：${note.page.title}`} disabled={creating || deleting !== undefined} onClick={() => void trash(note.page.id)}><Trash2 size={14} aria-hidden="true" /></button>
      </ReorderableListRow>;
    })}</ReorderGroup>
    </section>
  </>;
}
