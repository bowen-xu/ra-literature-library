import { isNalQueryGroup, nalQueryVariables, validateNalTerm, type NalPattern, type NalQuery, type NalQueryBlock, type NalTerm } from "@research-assistant/core/nal";
import { newStatementDraft } from "./nalQueryBuilderModel";

/** Local template identity only; resolved before crossing the source-fact gateway. */
export const SELECTED_PAPER_VARIABLE = "选中文献";

export function newFactDraft(itemIds: readonly string[]): NalQuery {
  const first = itemIds[0];
  if (!first) return newStatementDraft();
  return { copula: "inheritance", subject: itemIds.length > 1 ? { kind: "variable", name: SELECTED_PAPER_VARIABLE } : { kind: "paper", id: first }, predicate: { kind: "concept", id: "" } };
}

function groundTerm(pattern: NalPattern, paperId: string | undefined): NalTerm {
  if (pattern.kind === "variable") {
    if (pattern.name !== SELECTED_PAPER_VARIABLE || !paperId) throw new Error("关系语句不能包含未绑定的变量");
    return { kind: "paper", id: paperId };
  }
  if (pattern.kind === "product") return { kind: "product", terms: pattern.terms.map(term => groundTerm(term, paperId)) };
  if (pattern.kind === "concept" || pattern.kind === "paper") {
    if (!pattern.id.trim()) throw new Error("请选择每个槽位的词项");
    return pattern;
  }
  throw new Error("关系语句仅支持继承、概念、文献和有序乘积");
}

/** Converts editor drafts to source facts without persisting query-only AST nodes. */
export function factsFromDraft(blocks: readonly NalQueryBlock[], itemIds: readonly string[]): readonly { readonly subject: NalTerm; readonly predicate: NalTerm }[] {
  if (!blocks.length) throw new Error("请先添加一条语句");
  const result: { subject: NalTerm; predicate: NalTerm }[] = [];
  for (const block of blocks) {
    if (isNalQueryGroup(block) || block.copula === "implication") throw new Error("关系语句仅支持继承、概念、文献和有序乘积");
    if (block.copula === null) throw new Error("请选择每条语句的连接符");
    const variables = nalQueryVariables([block]);
    const bindings: readonly (string | undefined)[] = variables.length ? [...new Set(itemIds)] : [undefined];
    if (!bindings.length) throw new Error("选中文献已不可用，请重新选择");
    if (result.length + bindings.length > 500) throw new Error("每次最多添加 500 条语句，请减少条件或所选文献");
    for (const paperId of bindings) {
      const subject = groundTerm(block.subject, paperId), predicate = groundTerm(block.predicate, paperId);
      validateNalTerm(subject); validateNalTerm(predicate);
      result.push({ subject, predicate });
    }
  }
  return result;
}
