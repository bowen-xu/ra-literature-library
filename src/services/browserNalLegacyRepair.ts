import type { NalState } from "@research-assistant/core/nal";
import { importedConceptName } from "@research-assistant/core/knowledge";
import { getAppStorage } from "@research-assistant/workbench-sdk/storage";
import { getResearchKnowledgeGateway } from "./knowledgeGateway";

/** Imported v1 sub-field arrows have known provenance; human arrows stay untouched. */
export async function repairBrowserNalLegacy(state: NalState): Promise<NalState & { relationSemanticsVersion: 1 }> {
  if ((state as NalState & {relationSemanticsVersion?: number}).relationSemanticsVersion === 1) return {...state,relationSemanticsVersion:1};
  const arrows = state.statements.filter(s=>s.origin === "legacy" && s.subject.kind === "concept" && s.predicate.kind === "concept");
  let statements = state.statements;
  if (arrows.length) {
    const storage = getAppStorage(), key = "research-assistant.nal.legacy-repair-relation.v1";
    let relationId = storage.getItem(key);
    if (!relationId) {
      const gateway=getResearchKnowledgeGateway();
      const label=importedConceptName("旧上下位关系",await gateway.searchConcepts(""));
      const c = await gateway.saveConcept({preferredTerm:"旧上下位关系",label,explanation:"从旧集合 sub-field 迁移的有向二元关系；不作为继承，传递性需显式定义。",disambiguation:"修正旧自动迁移的关系表示",domain:"",tradition:"",period:""});
      relationId = c.id; storage.setItem(key,relationId);
    }
    const ids = new Set(arrows.map(s=>s.id));
    statements = statements.map(s=>ids.has(s.id) ? {...s,subject:{kind:"product" as const,terms:[s.subject,s.predicate]},predicate:{kind:"concept" as const,id:relationId!}} : s);
  }
  return {...state,statements,revision:state.revision+1,relationSemanticsVersion:1};
}
