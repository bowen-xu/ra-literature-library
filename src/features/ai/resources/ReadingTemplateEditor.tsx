import type { PortraitTemplateField } from "@research-assistant/core/ai";
import { ReadingTemplateFields } from "../ReadingTemplateFields";
import { SettingGroup, SettingRow } from "@research-assistant/workbench-sdk/settings";

interface TemplateDocument {
  readonly kind: "reading_template_v1";
  readonly schemaVersion: 1;
  readonly name: string;
  readonly fields: readonly PortraitTemplateField[];
}

/** Projection only: editing preserves every property of the original JSON document. */
export function templateDocument(text: string): TemplateDocument | undefined {
  try {
    const value: unknown = JSON.parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value)) return;
    const body = value as Record<string, unknown>;
    if (body.kind !== "reading_template_v1" || body.schemaVersion !== 1 ||
      typeof body.name !== "string" || !Array.isArray(body.fields)) return;
    const ids = new Set<string>();
    for (const field of body.fields) {
      if (!field || typeof field !== "object" || Array.isArray(field) ||
        typeof field.id !== "string" || typeof field.title !== "string" ||
        typeof field.question !== "string" || ids.has(field.id)) return;
      ids.add(field.id);
      if (field.claimIds !== undefined && (!Array.isArray(field.claimIds) ||
        field.claimIds.some((id: unknown) => typeof id !== "string"))) return;
      if (field.color !== undefined && (typeof field.color !== "string" || !/^#[0-9a-fA-F]{6}$/.test(field.color))) return;
    }
    return {...body, kind: "reading_template_v1", schemaVersion: 1, name: body.name,
      fields: body.fields.map(field => ({...field, claimIds: field.claimIds ?? []}))};
  } catch { return; }
}

export function ReadingTemplateEditor({text, disabled, onChange, onFieldEditing, onCommit}: {
  readonly text: string;
  readonly disabled: boolean;
  readonly onChange: (text: string, commit?: boolean) => void;
  readonly onFieldEditing: (editing: boolean) => void;
  readonly onCommit?: () => void;
}) {
  const body = templateDocument(text);
  return <section className="paper-portrait-editor structured-template-editor" aria-label="模板可视化编辑">
    {body ? <>
      <SettingGroup label="模板设置"><SettingRow title="模板名称"><input aria-label="模板名称" value={body.name} maxLength={120} disabled={disabled}
        onChange={event => onChange(JSON.stringify({...body, name: event.target.value}, null, 2))} onBlur={onCommit}/></SettingRow></SettingGroup>
      <ReadingTemplateFields fields={body.fields} disabled={disabled} onEditingChange={onFieldEditing}
        onChange={fields => onChange(JSON.stringify({...body, fields}, null, 2),true)}/>
    </> : <p role="status">模板暂时无法显示为字段表单。原始草稿已保留，可在内部对话中修复。</p>}
  </section>;
}
