import { useEffect, useState, type ReactNode } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import type { PortraitTemplateField } from "@research-assistant/core/ai";
import { ReorderableListRow, ReorderDragHandle } from "@research-assistant/workbench-sdk/reorder";
import { ControlHint } from "@research-assistant/workbench-sdk/overlay";
import { usePointerReorder } from "@research-assistant/workbench-sdk/reorder";
import { ReorderGroup } from "@research-assistant/workbench-sdk/reorder";
import { readingFieldColor, READING_FIELD_PALETTE } from "./readingFieldSources";

/** The same field controls serve historical catalogs and managed template proposals. */
export function ReadingTemplateFields({ fields, disabled, onChange, editorExtra, onEditingChange }: {
  readonly fields: readonly PortraitTemplateField[];
  readonly disabled: boolean;
  readonly onChange: (fields: readonly PortraitTemplateField[]) => boolean | void;
  readonly editorExtra?: ReactNode;
  readonly onEditingChange?: (editing: boolean) => void;
}) {
  const [editing, setEditing] = useState<{
    readonly id: string; readonly title: string; readonly question: string; readonly color: string;
  }>();
  useEffect(() => { onEditingChange?.(editing !== undefined); }, [editing, onEditingChange]);
  function update(next: readonly PortraitTemplateField[]): boolean {
    if (onChange(next) === false) return false;
    setEditing(undefined); return true;
  }
  function move(from: string, to: string): boolean {
    const next = [...fields], source = next.findIndex(field => field.id === from);
    const target = next.findIndex(field => field.id === to);
    if (source < 0 || target < 0 || source === target) return false;
    const [field] = next.splice(source, 1);
    if (field) { next.splice(target, 0, field); return update(next); }
    return false;
  }
  const reorder = usePointerReorder({ids:fields.map(field=>field.id),disabled,onReorder:({source,target})=>move(source,target)});
  const orderedFields = reorder.order.flatMap(id=>fields.filter(field=>field.id===id));
  function edit(field: PortraitTemplateField): void {
    setEditing({ ...field, color: readingFieldColor(field.id, field.color) });
  }
  return <div className={`portrait-template-fields${reorder.drag ? " is-reordering" : ""}`}>
    <ReorderGroup as="ol" className="portrait-template-list" order={reorder.order} dragging={!!reorder.drag}>{orderedFields.map(field => <ReorderableListRow
      key={field.id} itemId={field.id} ref={element => {
        if (element) reorder.rows.current.set(field.id, element); else reorder.rows.current.delete(field.id);
      }} dragging={reorder.drag?.id === field.id}
      dropTarget={reorder.drag?.target === field.id && reorder.drag.id !== field.id}
      offset={reorder.offsetFor(field.id)}
    >
      <div className="portrait-template-row">
        <ReorderDragHandle compact className="portrait-template-drag" disabled={disabled}
          aria-label={`拖动调整${field.title}顺序`} onPointerDown={event => reorder.start(field.id, event)}
          onKeyDown={event => {
            if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
            event.preventDefault();
            const index = fields.findIndex(value => value.id === field.id);
            const target = fields[index + (event.key === "ArrowUp" ? -1 : 1)];
            if (target) move(field.id, target.id);
          }}/>
        <ControlHint content={`设置${field.title}颜色`}><button type="button"
          className="portrait-field-color" aria-label={`设置${field.title}颜色`} disabled={disabled}
          style={{backgroundColor: readingFieldColor(field.id, field.color)}} onClick={() => edit(field)}/></ControlHint>
        <strong>{field.title}</strong><span>{field.question}</span>
        <div className="portrait-template-row-actions">
          <button type="button" disabled={disabled} className="portrait-template-icon"
            aria-label={`编辑${field.title}`} onClick={() => edit(field)}><Pencil size={15} aria-hidden="true"/></button>
          <button type="button" className="portrait-template-icon" disabled={disabled || fields.length === 1}
            aria-label={`删除${field.title}字段`} onClick={() => update(fields.filter(value => value.id !== field.id))}>
            <Trash2 size={15} aria-hidden="true"/></button>
        </div>
      </div>
      {editing?.id === field.id && <div className="portrait-template-field-editor">
        <div className="portrait-field-palette" role="group" aria-label="默认颜色">
          {READING_FIELD_PALETTE.map(color => <button type="button" key={color} disabled={disabled}
            className="portrait-field-color" style={{backgroundColor: color}} aria-label={`使用颜色 ${color}`}
            aria-pressed={editing.color === color} onClick={() => setEditing({...editing, color})}/>)}
          <label>自定义颜色<input type="color" disabled={disabled} aria-label="自定义字段颜色"
            value={editing.color} onChange={event => setEditing({...editing, color: event.target.value})}/></label>
        </div>
        <input aria-label="结构标题" disabled={disabled} maxLength={120} value={editing.title}
          onChange={event => setEditing({...editing, title: event.target.value})}/>
        <textarea aria-label="结构说明" disabled={disabled} maxLength={1000} rows={2} value={editing.question}
          onChange={event => setEditing({...editing, question: event.target.value})}/>
        {editorExtra}
        <div>
          <button type="button" disabled={disabled || !editing.title.trim() || !editing.question.trim()}
            onClick={() => update(fields.map(value => value.id === field.id ? {...value,
              title: editing.title.trim(), question: editing.question.trim(), color: editing.color} : value))}>保存字段</button>
          <button type="button" disabled={disabled} onClick={() => setEditing(undefined)}>取消编辑</button>
          <button type="button" disabled={disabled || fields.length === 1}
            onClick={() => update(fields.filter(value => value.id !== field.id))}>移除字段</button>
          <button type="button" disabled={disabled || fields[0]?.id === field.id} onClick={() => {
            const previous = fields[fields.findIndex(value => value.id === field.id) - 1];
            if (previous) move(field.id, previous.id);
          }}>上移字段</button>
        </div>
      </div>}
    </ReorderableListRow>)}</ReorderGroup>
    <div className="portrait-template-actions">
      <button type="button" disabled={disabled || fields.length >= 20} onClick={() => update([...fields, {
        id: `field_${crypto.randomUUID().replaceAll("-", "")}`, title: "新字段",
        question: "描述此结构所整理的内容与边界。", claimIds: [],
      }])}><Plus size={15} aria-hidden="true"/>添加字段</button>
    </div>
  </div>;
}
