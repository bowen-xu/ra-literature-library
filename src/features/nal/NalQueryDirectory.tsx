import { ControlHint } from "@research-assistant/workbench-sdk/overlay";
import { notify } from "@research-assistant/workbench-sdk/feedback";
import { confirm } from "@research-assistant/workbench-sdk/platform";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { ActionMenu, ActionMenuItem } from "@research-assistant/workbench-sdk/overlay";
import { nalQueryVariables, nalQueryLeaves, type NalQueryCollection, type NalQueryBlock } from "@research-assistant/core/nal";
import type { NalController } from "./useNal";
import { NalDialog } from "./NalDialog";
import { NalQueryEditorContent } from "./NalQueryEditorContent";
import { describeQueryCondition, newStatementDraft, validQueryConditions } from "./nalQueryBuilderModel";
import { useNalQueryDraft } from "./useNalQueryDraft";
import {useWorkspaceState, workspaceStringSet} from "@research-assistant/workbench-sdk/workspace-state";

export function NalQueryDirectory({controller}:{readonly controller:NalController}) {
  const [collapsed,setCollapsed]=useWorkspaceState("library-query-folders",new Set<string>() as ReadonlySet<string>,workspaceStringSet);
  const [editor,setEditor]=useState<{parent?:NalQueryCollection;definition?:NalQueryCollection}>();
  const deleteLocked=useRef(false);
  const [deleting,setDeleting]=useState(false);
  async function deleteCollection(id:string,name:string,children:boolean) {
    if(controller.busy || deleteLocked.current)return;
    deleteLocked.current=true;setDeleting(true);
    try {
      if(!await confirm(`删除“${name}”${children ? "及其子查询" : ""}？文献和关系会保留。`))return;
      await controller.removeCollection(id);
    } catch(e){notify.error(e instanceof Error ? e.message : typeof e === "string" ? e : "查询集合删除失败");}
    finally{deleteLocked.current=false;setDeleting(false);}
  }
  const render=(parentId?:string)=>controller.collections.filter(c=>c.definition.parentId === parentId).map(c=>{
    const d=c.definition,children=controller.collections.some(c=>c.definition.parentId === d.id),closed=collapsed.has(d.id);
    return <li key={d.id}><div className="nal-query-row" data-selected={controller.selectedCollectionId === d.id}>
      {children ? <button className="nal-query-disclosure" aria-label={`${closed ? "展开" : "收起"}查询：${d.name}`} aria-expanded={!closed} onClick={()=>setCollapsed(current=>{
        const next=new Set(current);if(next.has(d.id))next.delete(d.id);else next.add(d.id);return next;
      })}>{closed ? <ChevronRight size={12}/> : <ChevronDown size={12}/>}</button> : <span className="nal-query-disclosure-space"/>}
      <ControlHint content={c.conditions.map(q=>describeQueryCondition(q,controller.vocabulary)).join("；且 ")}><button className="nal-query-select" aria-label={d.name} aria-current={controller.selectedCollectionId === d.id ? "page" : undefined} disabled={!!controller.cacheError} onClick={()=>{
        controller.selectCollection(d.id);
      }}><span>{d.name}</span><small>{controller.cacheError ? "—" : c.paperIds.length}</small></button></ControlHint>
      <ActionMenu className="nal-query-actions" label={`查询操作：${d.name}`} trigger={<MoreHorizontal size={15} aria-hidden="true"/>} triggerClassName="nal-query-more" contentClassName="nal-query-menu" portal placement="bottom-end" disabled={controller.busy || deleting}>
        <ActionMenuItem aria-label={`添加子查询：${d.name}`} title={nalQueryLeaves(c.conditions).length>=16 ? "此查询已达到 16 个条件" : "添加子查询（与上级条件相与）"} disabled={controller.busy || nalQueryLeaves(c.conditions).length>=16} onClick={()=>setEditor({parent:d})}><Plus size={14}/>添加子查询</ActionMenuItem>
        <ActionMenuItem aria-label={`编辑查询：${d.name}`} disabled={controller.busy} onClick={()=>setEditor({definition:d})}><Pencil size={14}/>编辑查询</ActionMenuItem>
        <ActionMenuItem aria-label={`删除查询集合：${d.name}`} className="danger-text" disabled={controller.busy || deleting} onClick={()=>void deleteCollection(d.id,d.name,children)}><Trash2 size={14}/>删除查询集合</ActionMenuItem>
      </ActionMenu>
    </div>{children && !closed && <ul>{render(d.id)}</ul>}</li>;
  });
  return <nav className="nal-query-directory" aria-label="文献视图">
    <ul><li><div className="nal-query-row" data-selected={!controller.query}>
      <span className="nal-query-disclosure-space"/>
      <button type="button" className="nal-query-select" aria-label="全部文献" aria-current={!controller.query ? "page" : undefined} onClick={()=>controller.setQuery(undefined)}><span>全部文献</span><small>{controller.vocabulary.filter(v=>v.atom.kind === "paper").length}</small></button>
      <span className="nal-query-actions-space" aria-hidden="true"/>
    </div></li>{render()}</ul>
    {controller.cacheError && <p role="status">查询缓存更新失败：{controller.cacheError}<button onClick={()=>void controller.refresh()}>重试</button></p>}
    {editor && <NalQueryEditor controller={controller} {...editor} onClose={()=>setEditor(undefined)}/>}
  </nav>;
}
export function NalQueryEditor({controller,parent,definition,initialConditions,onClose}:{readonly controller:NalController;readonly parent?:NalQueryCollection;readonly definition?:NalQueryCollection;readonly initialConditions?:readonly NalQueryBlock[];readonly onClose:()=>void}) {
  const parentView=controller.collections.find(c=>c.definition.id === (parent?.id ?? definition?.parentId));
  const [name,setName]=useState(definition?.name ?? "");
  const draft=useNalQueryDraft({conditions:definition?.conditions ?? initialConditions ?? [newStatementDraft()],
    outputs:definition?.outputMode==="all" ? undefined : definition?.outputVariables});
  const {conditions,setConditions,outputs,setOutputs}=draft;
  const nameInput=useRef<HTMLInputElement>(null);
  useEffect(()=>{nameInput.current?.focus();},[]);
  const maximum=16-nalQueryLeaves(parentView?.conditions ?? []).length;
  return <NalDialog title={definition ? "编辑查询集合" : parent ? "新增子查询" : "保存查询集合"} busy={controller.busy} onClose={onClose} className="nal-query-editor">
    <form className="nal-form" onSubmit={event=>{
      event.preventDefault();
      if(!validQueryConditions(conditions) || nalQueryLeaves(conditions).length>maximum)return;
      const variables=outputs?.filter(n=>nalQueryVariables([...(parentView?.conditions ?? []),...conditions]).includes(n));
      const save=definition ? controller.editCollections(defs=>defs.map(d=>d.id === definition.id ? {...d,name:name.trim(),conditions,outputMode:variables ? undefined : "all",outputVariables:variables} : d))
        : controller.saveCollection(name.trim(),conditions,parent?.id,{variables});
      void save.then(ok=>{if(ok)onClose();});
    }}>
      <label>名称<input ref={nameInput} autoFocus aria-label="查询集合名称" value={name} maxLength={200} required disabled={controller.busy} onChange={e=>setName(e.target.value)}/></label>
      {parentView && <section className="nal-query-inherited" aria-label="继承的查询条件"><strong>同时满足上级条件</strong><ul>{parentView.conditions.map((q,i)=><li key={i}>{describeQueryCondition(q,controller.vocabulary)}</li>)}</ul></section>}
      <NalQueryEditorContent conditions={conditions} onChange={setConditions} state={controller.state} vocabulary={controller.vocabulary}
        disabled={controller.busy} maxConditions={maximum} outputConditions={[...(parentView?.conditions ?? []),...conditions]}
        outputVariables={outputs} onOutputVariablesChange={setOutputs} history={draft}/>
      {maximum<1 && <p role="alert">上级查询已达到 16 个条件，无法再添加子条件。</p>}
      <button type="submit" disabled={controller.busy || !name.trim() || !validQueryConditions(conditions) || nalQueryLeaves(conditions).length>maximum}>保存查询集合</button>
    </form>
  </NalDialog>;
}
