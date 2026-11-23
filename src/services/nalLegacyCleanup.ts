import { nalAtoms, type NalState } from "@research-assistant/core/nal";

const unusedLegacyExplanations = new Set([
  "旧集合关系。反向显示：related-field；有向：false。",
  "从旧集合关系迁移。反向显示：related-field；有向：false。",
]);

const previewLabels = new Set(["领域","AI领域","深度学习领域","所属领域","方法","active inference方法","基于方法","研究发展"]);
export function nalPreviewDefinition(label: string): string {
  return `合成预览概念：${label}。关系词项按有序参数定义；研究发展的第一个参数为基础工作，第二个参数为后续工作。`;
}

/** Only exact app-generated definitions are candidates for preview cleanup. */
export function nalPreviewDefinitionKey(concept: {readonly label:string;readonly explanation:string}): string | undefined {
  return previewLabels.has(concept.label) && concept.explanation === nalPreviewDefinition(concept.label) ? concept.label : undefined;
}

/** Correct the old generated example in place so its statement annotations keep their target. */
export function repairPreviewFieldStatement(state: NalState): NalState {
  const fixture=(label:string)=>state.concepts.filter(c=>nalPreviewDefinitionKey(c) === label);
  const deep=new Set(fixture("深度学习领域").map(c=>c.id)),ai=new Set(fixture("AI领域").map(c=>c.id));
  const belongs=fixture("所属领域")[0];
  if(!belongs)return state;
  let changed=false;
  const statements=state.statements.map(statement=>{
    if(statement.subject.kind !== "concept" || !deep.has(statement.subject.id)
      || statement.predicate.kind !== "concept" || !ai.has(statement.predicate.id))return statement;
    changed=true;
    return {...statement,subject:{kind:"product" as const,terms:[statement.subject,statement.predicate]},predicate:{kind:"concept" as const,id:belongs.id}};
  });
  return changed ? {...state,statements,revision:state.revision+1,
    concepts:state.concepts.map(c=>c.id === belongs.id ? {...c,conceptKind:"relation" as const} : c)} : state;
}

/** Retire only identities created by the old preview collection migration. */
export function retiredNalPreviewConceptIds(state: NalState, rawMap: string | null): ReadonlySet<string> {
  const retired = new Set<string>();
  let value: unknown;
  try { value = JSON.parse(rawMap ?? "{}"); } catch { return retired; }
  if (!value || typeof value !== "object" || Array.isArray(value)) return retired;
  for (const [key, id] of Object.entries(value)) {
    if (typeof id !== "string") continue;
    const concept = state.concepts.find(c => c.id === id);
    if (!concept) continue;
    if ((key === "membership" && concept.label === "原归类")
      || (key === "assignment" && concept.label === "旧关系标注")
      || (key.startsWith("collection:") && concept.label === "预览研究"
        && concept.explanation === "从原集合迁移。合成文献集合")) retired.add(id);
  }
  return retired;
}

/** Return identities for persistent deletion, not a filtered view of the catalog. */
export function obsoleteNalConceptIds(state: NalState, preview = false, retiredPreviewIds: ReadonlySet<string> = new Set()): ReadonlySet<string> {
  const referenced = new Set(state.statements.flatMap(statement =>
    [...nalAtoms(statement.subject), ...nalAtoms(statement.predicate)]
      .filter(atom => atom.kind === "concept").map(atom => atom.id)));
  for (const annotation of state.annotations) {
    if (annotation.targetKind === "concept") referenced.add(annotation.targetId);
  }
  for (const rule of state.rules ?? []) referenced.add(rule.relationConceptId);
  const preferred = new Map<string,string>();
  if (preview) for (const concept of state.concepts) {
    const key = nalPreviewDefinitionKey(concept);
    if (key === undefined) continue;
    const previous = preferred.get(key);
    if (previous === undefined || (!referenced.has(previous) && referenced.has(concept.id))) preferred.set(key,concept.id);
  }
  const obsolete = new Set<string>();
  for (const concept of state.concepts) {
    if (preview && retiredPreviewIds.has(concept.id)) obsolete.add(concept.id);
    if (concept.label === "related-field" && unusedLegacyExplanations.has(concept.explanation) && !referenced.has(concept.id)) obsolete.add(concept.id);
    const fixture = preview ? nalPreviewDefinitionKey(concept) : undefined;
    if (fixture !== undefined && preferred.get(fixture) !== concept.id) obsolete.add(concept.id);
  }
  return obsolete;
}
