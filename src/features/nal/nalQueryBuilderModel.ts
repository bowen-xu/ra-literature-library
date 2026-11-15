import { validateNalQueryBlocks, isNalQueryGroup, type NalPattern, type NalQuery, type NalQueryBlock, type NalQueryGroup, type NalVocabulary } from "@research-assistant/core/nal";

const INHERITANCE = "builtin:inheritance";
export function newStatementDraft():NalQuery {
  return {copula:null,subject:{kind:"concept",id:""},predicate:{kind:"concept",id:""}};
}
export function newGroupDraft(connector:NalQueryGroup["connector"], first:NalQueryBlock=newStatementDraft()):NalQueryGroup {
  return {kind:"group",connector,children:[first,newStatementDraft()]};
}
/** Old single-child groups open with a second editable branch, without rewriting storage. */
export function normalizeQueryDraftGroups(blocks:readonly NalQueryBlock[]):readonly NalQueryBlock[] {
  return blocks.map(block=>{
    if(!isNalQueryGroup(block))return block;
    const children=[...normalizeQueryDraftGroups(block.children)];
    while(children.length<2)children.push(newStatementDraft());
    return {...block,children};
  });
}
interface SimpleQueryCondition {
  readonly relation: string;
  readonly reverse: boolean;
  readonly variable: string;
  readonly target: NalPattern;
}
export function simpleQueryCondition(query: NalQuery): SimpleQueryCondition | undefined {
  if(query.copula===null || query.copula==="implication")return undefined;
  if (query.subject.kind === "variable") return {relation:INHERITANCE,reverse:false,variable:query.subject.name,target:query.predicate};
  if (query.predicate.kind === "variable") return {relation:INHERITANCE,reverse:true,variable:query.predicate.name,target:query.subject};
  if (query.predicate.kind !== "concept" || query.subject.kind !== "product" || query.subject.terms.length !== 2) return undefined;
  const terms=query.subject.terms;
  const at=terms.findIndex(t=>t.kind === "variable" && ["文章","x"].includes(t.name));
  const variableIndex=at >= 0 ? at : terms.findIndex(t=>t.kind === "variable");
  const variable=terms[variableIndex];
  if (!variable || variable.kind !== "variable") return undefined;
  return {relation:query.predicate.id,reverse:variableIndex === 1,variable:variable.name,target:terms[variableIndex === 0 ? 1 : 0]!};
}
export function validQueryConditions(conditions:readonly NalQueryBlock[]): boolean {
  try {validateNalQueryBlocks(conditions);return true;}catch{return false;}
}
function describePattern(value:NalPattern,vocabulary:readonly NalVocabulary[]):string {
  if(value.kind === "variable")return ["文章","x"].includes(value.name) ? "当前文献" : `任意${value.name}`;
  if("terms" in value)return `${value.kind === "product" ? "组合" : value.kind === "compound" ? "未选连接符的组合" : value.kind === "conjunction" ? "合取" : "析取"}（${value.terms.map(t=>describePattern(t,vocabulary)).join("、")}）`;
  if(value.kind==="statement")return `语句（${describeQueryCondition(value,vocabulary)}）`;
  return vocabulary.find(v=>v.atom.kind === value.kind && v.atom.id === value.id)?.label ?? "原对象已不可用";
}
export function describeQueryCondition(query:NalQueryBlock,vocabulary:readonly NalVocabulary[]):string {
  if(isNalQueryGroup(query))return `（${query.children.map(q=>describeQueryCondition(q,vocabulary)).join(query.connector==="conjunction" ? " 且 " : " 或 ")}）`;
  const simple=simpleQueryCondition(query);
  if(!simple)return `${describePattern(query.subject,vocabulary)} ${query.copula==="implication" ? "蕴含" : "继承"} ${describePattern(query.predicate,vocabulary)}`;
  const relation=simple.relation === INHERITANCE ? "继承" : vocabulary.find(v=>v.atom.kind === "concept" && v.atom.id === simple.relation)?.label ?? "不可用的关系";
  const target=describePattern(simple.target,vocabulary);
  return simple.reverse ? `${target} · ${relation} · 当前文献` : `当前文献 · ${relation} · ${target}`;
}
