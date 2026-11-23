export type NalRejection = 'too_large' | 'invalid_definition' | 'invalid_hierarchy' | 'missing_parent' | 'invalid_output_variables' | 'invalid_structure';
export interface NalContent {definitions: NalDefinition[]; cache: unknown; legacyImported: boolean}
export interface NalDefinition {id: string; name: string; parentId?: string | null; conditions: NalCondition[]; outputVariables?: string[] | null}
export type NalCondition = {kind: 'statement'; subject: NalPattern; predicate: NalPattern} | {kind: 'group'; children: NalCondition[]};
export type NalPattern = {kind: 'concept' | 'paper' | 'variable'; id?: string; name?: string} | {kind: 'product' | 'conjunction' | 'disjunction'; terms: NalPattern[]} | {kind: 'statement'; subject: NalPattern; predicate: NalPattern};
export interface NalSavePlan {definitionsJson: string; cacheJson: string | null; legacyImported: boolean}

const bytes = (value: string): number => new TextEncoder().encode(value).byteLength;
function pattern(value: unknown, depth: number, budget: {value: number}): boolean {
  if (depth > 12 || budget.value === 0) return false; budget.value--;
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>, kind = row.kind;
  if (kind === 'concept' || kind === 'paper' || kind === 'variable') {const id = kind === 'variable' ? row.name : row.id; return typeof id === 'string' && id.trim() !== '' && bytes(id) <= 800;}
  if (kind === 'product' || kind === 'conjunction' || kind === 'disjunction') return Array.isArray(row.terms) && row.terms.length >= 2 && row.terms.length <= 16 && row.terms.every(term => pattern(term, depth + 1, budget));
  if (kind === 'statement') return pattern(row.subject, depth + 1, budget) && pattern(row.predicate, depth + 1, budget);
  return false;
}
function variables(value: NalPattern, names: Set<string>): void {
  if (value.kind === 'variable' && typeof value.name === 'string') names.add(value.name);
  else if ('terms' in value) value.terms.forEach(term => variables(term, names));
  else if (value.kind === 'statement') {variables(value.subject, names); variables(value.predicate, names);}
}
function leaves(value: NalCondition): number { return value.kind === 'statement' ? 1 : value.children.reduce((sum, child) => sum + leaves(child), 0); }
function conditionVariables(value: NalCondition, names: Set<string>): void { if (value.kind === 'statement') {variables(value.subject, names); variables(value.predicate, names);} else value.children.forEach(child => conditionVariables(child, names)); }
function condition(value: unknown, depth: number, budget: {value: number}): value is NalCondition {
  if (depth > 12 || budget.value === 0 || value === null || typeof value !== 'object' || Array.isArray(value)) return false; budget.value--;
  const row = value as Record<string, unknown>;
  if (row.kind === 'statement') return pattern(row.subject, 0, budget) && pattern(row.predicate, 0, budget);
  return row.kind === 'group' && Array.isArray(row.children) && row.children.length >= 1 && row.children.length <= 16 && row.children.every(child => condition(child, depth + 1, budget));
}

export function validateNalQueryContent(value: NalContent): NalRejection | null {
  const serialized = JSON.stringify(value), definitions = value.definitions;
  if (definitions.length > 100 || bytes(serialized) > 32 * 1024 * 1024) return 'too_large';
  const ids = new Set<string>(), budget = {value: 16000};
  for (const definition of definitions) {
    if (definition.id.trim() === '' || bytes(definition.id) > 800 || ids.has(definition.id) || definition.name.trim() === '' || [...definition.name].length > 200
      || definition.conditions.length < 1 || definition.conditions.length > 16 || !definition.conditions.every(item => condition(item, 0, budget)) || definition.conditions.reduce((sum, item) => sum + leaves(item), 0) > 16) return 'invalid_definition';
    ids.add(definition.id);
  }
  for (const definition of definitions) {
    const seen = new Set<string>(), names = new Set<string>(); let count = 0; let current: NalDefinition | undefined = definition;
    while (current !== undefined) {
      current.conditions.forEach(item => conditionVariables(item, names)); count += current.conditions.reduce((sum, item) => sum + leaves(item), 0);
      if (seen.has(current.id) || seen.size >= 16 || count > 16) return 'invalid_hierarchy'; seen.add(current.id);
      if (current.parentId === undefined || current.parentId === null) current = undefined;
      else {current = definitions.find(item => item.id === current!.parentId); if (current === undefined) return 'missing_parent';}
    }
    const outputs = definition.outputVariables;
    if (outputs !== undefined && outputs !== null && (new Set(outputs).size !== outputs.length || outputs.some(name => !names.has(name)))) return 'invalid_output_variables';
  }
  return null;
}

export function rejectionMessage(reason: NalRejection): string { return ({too_large: '查询缓存过大', invalid_definition: '查询集合格式无效', invalid_hierarchy: '查询目录存在循环或超过 16 个条件', missing_parent: '上级查询已不存在', invalid_output_variables: '输出变量无效，请从语句中选择', invalid_structure: '关系数据结构无效'})[reason]; }
export function prepareNalQuerySave(value: NalContent): NalSavePlan | {rejected: NalRejection} { const reason = validateNalQueryContent(value); if (reason !== null) return {rejected: reason}; return {definitionsJson: JSON.stringify(value.definitions), cacheJson: value.cache === null ? null : JSON.stringify(value.cache), legacyImported: value.legacyImported}; }
export function projectNalQueryRow(row: {revision: number; definitionsJson: string; cacheJson: string | null; legacyImported: boolean}): {row: typeof row} | {rejected: 'invalid_structure'} { try {JSON.parse(row.definitionsJson); if (row.cacheJson !== null) JSON.parse(row.cacheJson); return {row};} catch {return {rejected: 'invalid_structure'};} }
