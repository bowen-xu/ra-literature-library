import { ControlHint } from "@research-assistant/workbench-sdk/overlay";
import { notify } from "@research-assistant/workbench-sdk/feedback";
import { confirm } from "@research-assistant/workbench-sdk/platform";
import { useEffect,useId,useMemo,useRef,useState } from "react";
import { Tab,TabList,TabPanel,TabProvider } from "@ariakit/react";
import { NotebookPen,Pencil,Plus,Search,Trash2 } from "lucide-react";
import { ConceptName } from "../knowledge/ConceptName";
import { nalAtoms,nalConceptKind,type NalConceptKind } from "@research-assistant/core/nal";
import { NalDialog } from "./NalDialog";
import { NalExistingConceptEditor } from "./NalExistingConceptEditor";
import { NalConceptEditor } from "./NalConceptEditor";
import { NalStatements,type NalAnnotationTarget } from "./NalStatements";
import { NalStatementEditor } from "./NalStatementEditor";
import { NalRelationRule } from "./NalRelationRule";
import type { NalController } from "./useNal";

export function NalManagementPanel({controller,onClose,onAnnotate}:{readonly controller:NalController;readonly onClose:()=>void;readonly onAnnotate:(target:NalAnnotationTarget)=>void}) {
  const [search,setSearch]=useState(""),[selected,setSelected]=useState<string>(),[create,setCreate]=useState(false);
  const selectedEntry=useRef<HTMLButtonElement>(null);
  const [editing,setEditing]=useState<string>();
  const deleteLocked=useRef(false);
  const [deleting,setDeleting]=useState(false);
  useEffect(()=>{selectedEntry.current?.scrollIntoView?.({block:"nearest"});},[selected]);
  const concepts=controller.state.concepts;
  const concept=concepts.find(c=>c.id === selected);
  useEffect(()=>{
    if(selected && !concepts.some(c=>c.id === selected)){
      setSelected(undefined);
    }
  },[concepts,selected]);
  const related=useMemo(()=>controller.state.statements.filter(s=>[...nalAtoms(s.subject),...nalAtoms(s.predicate)].some(a=>a.kind === "concept" && a.id === selected)),[controller.state.statements,selected]);

  const [editingBusy,setEditingBusy]=useState(false),[creatingBusy,setCreatingBusy]=useState(false);
  const id=useId(),conceptsTab=id+"-concepts",relationsTab=id+"-relations";
  const busy=controller.busy || editingBusy || creatingBusy || deleting;
  const annotate=(target:NalAnnotationTarget)=>{onClose();onAnnotate(target);};
  async function deleteConcept() {
    if(!concept || controller.busy || deleteLocked.current)return;
    const {id,label}=concept,revision=controller.state.revision;
    deleteLocked.current=true;setDeleting(true);
    try {
      if(!await confirm(`删除概念“${label}”？它参与的文献关系、传递规则和笔记关联会移除；文献、笔记正文和来源历史保留。`))return;
      await controller.mutate({kind:"delete_concept",id},revision);
    } catch(e){notify.error(e instanceof Error ? e.message : typeof e === "string" ? e : "概念删除失败");}
    finally{deleteLocked.current=false;setDeleting(false);}
  }
  return <NalDialog title="管理概念与关系" className="nal-concept-manager nal-management-panel" busy={busy} onClose={onClose}>
    <TabProvider defaultSelectedId={conceptsTab}>
      <TabList className="nal-management-tabs" aria-label="管理内容">
        <Tab id={conceptsTab} disabled={busy}>概念</Tab>
        <Tab id={relationsTab} disabled={busy}>关系语句</Tab>
      </TabList>
      <TabPanel tabId={conceptsTab} unmountOnHide={false}>
        {create ? <NalConceptEditor controller={controller} embedded onBusy={setCreatingBusy} onCreated={id=>{setSearch("");setSelected(id);setCreate(false);setCreatingBusy(false);}} onClose={()=>setCreate(false)}/> : <>
        <div className="nal-concept-manager-tools"><button type="button" aria-label="新增概念" disabled={busy} onClick={()=>setCreate(true)}><Plus size={16}/>新增概念</button></div>
    <label className="nal-search"><Search size={14}/><input aria-label="查找概念" placeholder="查找概念" value={search} onChange={e=>setSearch(e.target.value)}/></label>
    <nav aria-label="概念列表">{(["ordinary","relation"] as const).map(kind=><section className="nal-concept-group" key={kind} aria-label={kind === "ordinary" ? "普通概念" : "关系概念"}><h4>{kind === "ordinary" ? "普通概念" : "关系概念"}</h4>
      {concepts.filter(c=>nalConceptKind(c,controller.state) === kind && `${c.label} ${c.explanation}`.toLocaleLowerCase().includes(search.toLocaleLowerCase())).map(c=><ControlHint content={`${c.label} · ${c.id}`} key={c.id}><button aria-label={`${c.label} · ${c.id}`} ref={selected === c.id ? selectedEntry : undefined} type="button" aria-current={selected === c.id ? "page" : undefined} onClick={()=>setSelected(c.id)}><ConceptName label={c.label}/></button></ControlHint>)}
    </section>)}</nav>
    {concept && <section className="nal-concept-detail"><header><strong><ConceptName label={concept.label}/></strong><div className="nal-row-actions"><ControlHint content="删除概念"><button type="button" aria-label={`删除概念：${concept.label}`} disabled={controller.busy || deleting} onClick={()=>void deleteConcept()}><Trash2 size={15}/></button></ControlHint><ControlHint content="编辑概念"><button type="button" aria-label={`编辑概念：${concept.label}`} onClick={()=>setEditing(concept.id)}><Pencil size={15}/></button></ControlHint><ControlHint content="概念笔记"><button type="button" aria-label={`概念笔记：${concept.label}`} onClick={()=>{annotate({kind:"concept",id:concept.id,label:concept.label});}}><NotebookPen size={16}/></button></ControlHint></div></header>
      {editing === concept.id && <NalExistingConceptEditor id={concept.id} controller={controller} onBusy={setEditingBusy} onClose={()=>{setEditing(undefined);setEditingBusy(false);}}/>}
      <p>{concept.explanation}</p>
      <label className="nal-concept-kind">概念类型<select aria-label="概念类型" value={nalConceptKind(concept,controller.state)} disabled={controller.busy} onChange={event=>void controller.mutate({kind:"set_concept_kind",conceptId:concept.id,conceptKind:event.target.value as NalConceptKind},controller.state.revision)}><option value="ordinary">普通概念</option><option value="relation">关系概念</option></select></label>
      {nalConceptKind(concept,controller.state) === "relation" && <NalRelationRule controller={controller} conceptId={concept.id}/>}
      <NalStatements controller={controller} statements={related} onAnnotate={target=>{annotate(target);}}/>
    </section>}

        </>}
      </TabPanel>
      <TabPanel tabId={relationsTab} unmountOnHide={false}>
        <NalStatementEditor controller={controller} itemIds={[]} embedded onClose={onClose} onAnnotate={onAnnotate}/>
      </TabPanel>
    </TabProvider>
  </NalDialog>;
}
