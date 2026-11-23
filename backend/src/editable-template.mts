/** Editable reading-template validation migrated from native editable_template.rs. */

export interface EditableTemplateInput {readonly candidateJson: string}
export type EditableTemplateDecision = {readonly status: 'validated'; readonly canonicalJson: string} | {readonly status: 'rejected'; readonly message: string};

export function validateEditableTemplate(input: EditableTemplateInput): EditableTemplateDecision {
  let value: unknown;
  try {value = JSON.parse(input.candidateJson);} catch {return {status: 'rejected', message: '模板 JSON 无效'};}
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return {status: 'rejected', message: '模板类型、名称或字段数量无效'};
  const row = value as Record<string, unknown>, fields = row.fields;
  if (Object.keys(row).some(key => !['kind', 'schemaVersion', 'name', 'fields'].includes(key)) || row.kind !== 'reading_template_v1' || row.schemaVersion !== 1
    || typeof row.name !== 'string' || row.name.trim() === '' || [...row.name].length > 120 || !Array.isArray(fields) || fields.length < 1 || fields.length > 20) return {status: 'rejected', message: '模板类型、名称或字段数量无效'};
  const ids = new Set<string>();
  for (const [index, field] of fields.entries()) {
    if (field === null || typeof field !== 'object' || Array.isArray(field)) return {status: 'rejected', message: `fields[${index}]包含未知属性`};
    const item = field as Record<string, unknown>;
    if (Object.keys(item).some(key => !['id', 'title', 'question', 'claimIds', 'color'].includes(key))) return {status: 'rejected', message: `fields[${index}]包含未知属性`};
    const id = item.id;
    if (typeof id !== 'string' || id.length === 0 || id.length > 64 || !/^[a-z][a-z0-9_-]*$/u.test(id) || ids.has(id)) return {status: 'rejected', message: `fields[${index}].id无效或重复`};
    ids.add(id);
    for (const [key, max] of [['title', 120], ['question', 1000] ] as const) {
      const text = item[key]; if (typeof text !== 'string' || text.trim() === '' || [...text].length > max) return {status: 'rejected', message: `fields[${index}].${key}无效`};
    }
    if (item.claimIds !== undefined && (!Array.isArray(item.claimIds) || item.claimIds.length !== 0)) return {status: 'rejected', message: '全局模板不能包含论文专用claimIds'};
    if (item.color !== undefined && (typeof item.color !== 'string' || !/^#[0-9a-f]{6}$/iu.test(item.color))) return {status: 'rejected', message: '模板字段颜色无效'};
  }
  return {status: 'validated', canonicalJson: JSON.stringify(value)};
}
