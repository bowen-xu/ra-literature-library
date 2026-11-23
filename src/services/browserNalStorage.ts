import { CONCEPT_DELETION_KEY, deletedBrowserConceptIds } from "./browserConceptDeletion";
import { applyNalMutation, decodeNalState, emptyNalState, nalAtoms, nalConceptKind, type NalMutation, type NalState } from "@research-assistant/core/nal";
import { getAppStorage } from "@research-assistant/workbench-sdk/storage";
import { getResearchKnowledgeGateway } from "./knowledgeGateway";
import { importedConceptName } from "@research-assistant/core/knowledge";
import { readBrowserCollections } from "./browserCollectionStorage";
import { getLiteratureGateway } from "./literatureGateway";
import { browserKnowledgeStorage } from "./browserKnowledgeStorage";
import { getNoteDocumentGateway } from "@research-assistant/workbench-sdk/documents";
import { notePageId } from "@research-assistant/core/notes";
import { listBrowserNotePageIds } from "@research-assistant/workbench-sdk/annotation-notes";
import { repairBrowserNalLegacy } from "./browserNalLegacyRepair";
import { obsoleteNalConceptIds, repairPreviewFieldStatement, retiredNalPreviewConceptIds } from "./nalLegacyCleanup";
import { isAppPreview } from "@research-assistant/workbench-sdk/environment";
export const NAL_STORAGE_KEY = "research-assistant.nal.v1";
const IMPORT_KEY = "research-assistant.nal.legacy-map.v1";
async function concepts() {
  return browserKnowledgeStorage.readConcepts().map(c=>({id:c.id,label:c.label || c.preferredTerm.text,explanation:c.explanation,revision:c.revision})).sort((a,b)=>a.id.localeCompare(b.id));
}
async function importLegacy(): Promise<NalState> {
  const old=readBrowserCollections(), storage=getAppStorage();
  const state=emptyNalState();
  if (!old.collections.length) {const next={...state,concepts:await concepts()};storage.setItem(NAL_STORAGE_KEY,JSON.stringify(next));return next;}
  // Resume interrupted imports by identity, never merge equal labels.
  const ids: Record<string,string> = JSON.parse(storage.getItem(IMPORT_KEY) ?? "{}");
  const create=async(key:string,label:string,explanation:string)=>{
    if(ids[key])return ids[key];
    const name=importedConceptName(label,await concepts());
    const c=await getResearchKnowledgeGateway().saveConcept({preferredTerm:label,label:name,explanation,disambiguation:"从旧文献归类迁移",domain:"",tradition:"",period:""});
    ids[key]=c.id;storage.setItem(IMPORT_KEY,JSON.stringify(ids));return c.id;
  };
  const member=await create("membership","原归类","从旧集合成员归属迁移，不自动解释为所属领域。");
  const tagged=await create("assignment","旧关系标注","有序参数：文献、旧集合端点乘积、关系词项；保留旧标签，不推断文献间关系。");
  for(const c of old.collections) if(!ids[`collection:${c.id}`]) {
    await create(`collection:${c.id}`,c.name,`从原集合迁移。${c.description}`);
  }
  for(const t of old.types) {
    if(t.id === "related-field" && !old.relations.some(r=>r.typeId === t.id))continue;
    await create(`type:${t.id}`,t.id === "sub-field" ? "旧上下位关系" : t.name,`旧集合关系。反向显示：${t.inverseName}；有向：${t.directed}。`);
  }
  const term=(id:string)=>({kind:"concept" as const,id:ids[`collection:${id}`]!});
  const predicate=(id:string)=>({kind:"concept" as const,id:ids[`type:${id}`]!});
  const statements: NalState["statements"][number][]=[];
  const add=(subject:NalState["statements"][number]["subject"],p:NalState["statements"][number]["predicate"])=>statements.push({id:crypto.randomUUID(),subject,predicate:p,origin:"legacy"});
  for(const c of old.collections)if(c.conceptId){
    const relation=await create("concept-reference","旧概念关联","旧集合对既有知识概念的可选引用；不合并两者身份。");
    add({kind:"product",terms:[term(c.id),{kind:"concept",id:c.conceptId}]},{kind:"concept",id:relation!});
  }
  for(const r of old.relations){
    if(r.typeId === "sub-field")add({kind:"product",terms:[term(r.sourceId),term(r.targetId)]},predicate(r.typeId));
    else {add({kind:"product",terms:[term(r.sourceId),term(r.targetId)]},predicate(r.typeId));if(!old.types.find(t=>t.id === r.typeId)?.directed)add({kind:"product",terms:[term(r.targetId),term(r.sourceId)]},predicate(r.typeId));}
  }
  for(const m of old.memberships)add({kind:"product",terms:[{kind:"paper",id:m.itemId},term(m.collectionId)]},{kind:"concept",id:member!});
  for(const a of old.assignments){const r=old.relations.find(r=>r.id === a.relationId)!;add({kind:"product",terms:[{kind:"paper",id:a.itemId},{kind:"product",terms:[term(r.sourceId),term(r.targetId)]},predicate(r.typeId)]},{kind:"concept",id:tagged!});}
  const next={...state,revision:1,concepts:await concepts(),statements};storage.setItem(NAL_STORAGE_KEY,JSON.stringify(next));return next;
}
export async function readBrowserNal(): Promise<NalState> {
  const raw=getAppStorage().getItem(NAL_STORAGE_KEY);
  const before=raw === null ? await importLegacy() : decodeNalState(JSON.parse(raw));
  let value:NalState=await repairBrowserNalLegacy(before);
  // Upgrade links only: all extra note pages and their contents remain in Notes.
  const targets=new Set<string>();
  const pages=value.annotations.length ? new Set(await listBrowserNotePageIds()) : new Set<string>();
  const single=value.annotations.filter(a=>{
    if(!pages.has(a.notePageId))return false;
    const key=JSON.stringify([a.targetKind,a.targetId]);
    if(targets.has(key))return false;
    targets.add(key);return true;
  });
  if(single.length !== value.annotations.length)value={...value,annotations:single,revision:value.revision+1};
  const current=(await concepts()).map(c=>({...c,conceptKind:nalConceptKind(value.concepts.find(old=>old.id === c.id) ?? c,value)}));
  if(JSON.stringify(value.concepts) !== JSON.stringify(current)){
    const ids=new Set(current.map(c=>c.id));
    const statements=value.statements.filter(s=>[...nalAtoms(s.subject),...nalAtoms(s.predicate)].every(a=>a.kind !== "concept" || ids.has(a.id)));
    const retained=new Set(statements.map(s=>s.id));
    const annotations=value.annotations.filter(a=>a.targetKind === "concept" ? ids.has(a.targetId) : retained.has(a.targetId));
    value={...value,concepts:current,statements,annotations,rules:value.rules.filter(r=>ids.has(r.relationConceptId)),revision:value.revision+1};
  }
  const preview=isAppPreview(),storage=getAppStorage();
  if(preview)value=repairPreviewFieldStatement(value);
  const retired=preview ? retiredNalPreviewConceptIds(value,storage.getItem(IMPORT_KEY)) : undefined;
  const obsolete=obsoleteNalConceptIds(value,preview,retired);
  if(obsolete.size){
    for(const id of obsolete)value=applyNalMutation(value,{kind:"delete_concept",id},value.revision);
    persistConceptDeletions(value,obsolete);
    return value;
  }
  if(value.revision !== before.revision || (raw !== null && JSON.stringify(JSON.parse(raw).concepts) !== JSON.stringify(value.concepts)))getAppStorage().setItem(NAL_STORAGE_KEY,JSON.stringify(value));
  return value;
}
export async function mutateBrowserNal(mutation: NalMutation, revision: number): Promise<NalState> {
  const state=await readBrowserNal();
  if(mutation.kind === "add_statements") {
    const active=new Set((await getLiteratureGateway().list()).map(i=>i.id));
    for(const s of mutation.statements)for(const a of [...nalAtoms(s.subject),...nalAtoms(s.predicate)])if(a.kind === "paper" && !active.has(a.id))throw new Error("活跃文献已不存在，请刷新");
  }
  if(mutation.kind === "link_annotation"){
    const note=await getNoteDocumentGateway().loadDocument(notePageId(mutation.annotation.notePageId));
    if(note.page.status !== "active")throw new Error("笔记不存在或不在活跃状态");
  }
  const next=applyNalMutation(state,mutation,revision);
  if(mutation.kind === "delete_concept"){
    persistConceptDeletions(next,[mutation.id]);
  }else getAppStorage().setItem(NAL_STORAGE_KEY,JSON.stringify(next));
  return next;
}
/** Use the same durable deletion path for user deletes and obsolete fixture cleanup. */
function persistConceptDeletions(next:NalState,ids:Iterable<string>):void {
  const storage=getAppStorage(),before=storage.getItem(CONCEPT_DELETION_KEY),deleted=new Set(deletedBrowserConceptIds());
  for(const id of ids)deleted.add(id);
  storage.setItem(CONCEPT_DELETION_KEY,JSON.stringify([...deleted]));
  try{storage.setItem(NAL_STORAGE_KEY,JSON.stringify(next));}
  catch(error){if(before === null)storage.removeItem(CONCEPT_DELETION_KEY);else storage.setItem(CONCEPT_DELETION_KEY,before);throw error;}
}
export function purgeBrowserNal(itemIds:readonly string[]):void {
  const raw=getAppStorage().getItem(NAL_STORAGE_KEY);if(raw===null)return;
  const state=decodeNalState(JSON.parse(raw)),deleted=new Set(itemIds);
  const statements=state.statements.filter(s=>![...nalAtoms(s.subject),...nalAtoms(s.predicate)].some(a=>a.kind === "paper" && deleted.has(a.id)));
  if(statements.length===state.statements.length)return;
  const retained=new Set(statements.map(s=>s.id));
  const annotations=state.annotations.filter(a=>a.targetKind !== "statement" || retained.has(a.targetId));
  getAppStorage().setItem(NAL_STORAGE_KEY,JSON.stringify({...state,revision:state.revision+1,statements,annotations}));
}
