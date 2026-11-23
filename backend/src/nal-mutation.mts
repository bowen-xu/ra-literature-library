export type NalMutationRejection = 'term_structure_too_large' | 'product_arity' | 'invalid_term_identity' | 'missing_term' | 'invalid_concept_kind' | 'concept_used_as_relation' | 'not_relation' | 'invalid_statement_count' | 'invalid_statement_identity_or_origin' | 'missing_concept' | 'missing_statement';
export type NalTerm = {kind: 'concept' | 'paper'; id: string} | {kind: 'product'; terms: NalTerm[]};
export interface NalStatement {id: string; origin: string; subject: NalTerm; predicate: NalTerm}

export function mutationMessage(reason: NalMutationRejection): string { return ({term_structure_too_large: '词项结构过大或嵌套过深', product_arity: '乘积需要 2–16 个有序词项', invalid_term_identity: '词项身份无效', missing_term: '概念或活跃文献已不存在，请刷新', invalid_concept_kind: '概念类型无效', concept_used_as_relation: '该概念已用作关系；请先移除相关关系语句和规则', not_relation: '只有关系概念可以定义传递规则', invalid_statement_count: '每次添加 1–500 条语句', invalid_statement_identity_or_origin: '新语句身份或来源无效', missing_concept: '概念已不存在，请刷新', missing_statement: '语句已不存在'})[reason]; }
function fail(reason: NalMutationRejection): never { throw Object.assign(new Error(mutationMessage(reason)), {reason}); }

export function validateTermNode(term: NalTerm, depth = 0, budget = {value: 16000}): void {
  if (depth > 12 || budget.value === 0) fail('term_structure_too_large'); budget.value--;
  if (term.kind === 'product') {if (term.terms.length < 2 || term.terms.length > 16) fail('product_arity'); return;}
  if (term.kind !== 'concept' && term.kind !== 'paper' || term.id.trim() === '' || new TextEncoder().encode(term.id).byteLength > 200) fail('invalid_term_identity');
}
export function requireTermExists(exists: boolean): void {if (!exists) fail('missing_term');}
export function validateStatementCount(count: number): void {if (count < 1 || count > 500) fail('invalid_statement_count');}
export function validateStatementIdentity(statement: NalStatement): void {if (statement.origin !== 'human' || statement.id.trim() === '' || new TextEncoder().encode(statement.id).byteLength > 200) fail('invalid_statement_identity_or_origin');}
export function validateConceptKind(kind: string): void {if (kind !== 'ordinary' && kind !== 'relation') fail('invalid_concept_kind');}
export function prepareConceptKind(kind: string): {conceptKind: string; onUsed: 'reject_concept_used_as_relation' | 'continue'} {
  validateConceptKind(kind); return {conceptKind: kind, onUsed: kind === 'ordinary' ? 'reject_concept_used_as_relation' : 'continue'};
}
export function requireKindUsage(kind: string, used: boolean): void {const action = prepareConceptKind(kind); if (used && action.onUsed === 'reject_concept_used_as_relation') fail('concept_used_as_relation');}
export function prepareTransitivity(enabled: boolean): {action: 'enable'; missing: 'not_relation'} | {action: 'disable'} {return enabled ? {action: 'enable', missing: 'not_relation'} : {action: 'disable'};}
export function requireRelationKind(enabled: boolean, relation: boolean): void {if (enabled && !relation) fail('not_relation');}
export function requireConceptDeleted(affected: number): void {if (affected !== 1) fail('missing_concept');}
export function requireStatementDeleted(affected: number): void {if (affected === 0) fail('missing_statement');}
