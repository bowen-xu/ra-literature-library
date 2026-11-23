import { useEffect, useRef, useState } from "react";
import type { StructuredResource } from "@research-assistant/core/structured-resources";
import type { StructuredResourceGateway } from "@research-assistant/workbench-sdk/structured-resources";
import { structuredWriteValidationDiagnostic } from "@research-assistant/workbench-sdk/structured-resources";
import type { AppHbsDocumentGateway } from "@research-assistant/workbench-sdk/hbs";
import { notify } from "@research-assistant/workbench-sdk/feedback";
import { StructuredResourceReview } from "./StructuredResourceReview";
import { ReadingTemplateEditor, templateDocument } from "./ReadingTemplateEditor";
import { usePortraitEditHistory, usePortraitHistoryBusy } from "../PortraitEditHistory";
function snapshot(resource:StructuredResource){
  return {revision:resource.revision,draftRevision:resource.draft?.revision,
    conversationId:resource.draft?.creatorConversationId,
    text:resource.draft?.content??JSON.stringify(resource.content??{
      kind:"reading_template_v1",schemaVersion:1,name:resource.title,
      fields:[{id:"question",title:"问题",question:"研究所回应的问题、目标和需求。"}],
    },null,2)};
}
/** Inline and modal hosts share the same visible fields and durable proposal lifecycle. */
export function ManagedReadingTemplate({resource,gateway,onChanged,onLockedChange,hbsGateway,disabled=false}:{
  readonly resource:StructuredResource;readonly gateway:StructuredResourceGateway;
  readonly onChanged:(resource:StructuredResource)=>void;
  readonly onLockedChange?:(locked:boolean)=>void;
  readonly hbsGateway?:AppHbsDocumentGateway;
  readonly disabled?:boolean;
}){
  const [base,setBase]=useState(()=>snapshot(resource)),[text,setText]=useState(base.text);
  const [busy,setBusy]=useState(false),[fieldEditing,setFieldEditing]=useState(false);

  const saving=useRef(false);
  const queued=useRef(false);
  const [saveError,setSaveError]=useState<string>();
  const history=usePortraitEditHistory();
  const historyScope=`${resource.id}:form`;
  const historyBusy=usePortraitHistoryBusy(historyScope);
  const steps=useRef<{applied:boolean;persisted:boolean}[]>([]);
  const live=useRef({resource,base,text});live.current={resource,base,text};
  const flush=useRef<()=>Promise<void>>(async()=>{});
  useEffect(()=>()=>{if(queued.current&&!saving.current)void flush.current();},[]);
  useEffect(()=>{
    if(!queued.current||saving.current||fieldEditing)return;
    const timer=window.setTimeout(()=>{void flush.current();},300);
    return()=>window.clearTimeout(timer);
  },[text,busy,fieldEditing]);
  const dirty=text!==base.text;
  useEffect(()=>{
    if(resource.revision!==live.current.base.revision||resource.draft?.revision!==live.current.base.draftRevision)history?.clearScope(historyScope);
    if(!dirty&&!fieldEditing){const next=snapshot(resource);live.current={resource,base:next,text:next.text};setBase(next);setText(next.text);}
  },[resource.id,resource.revision,resource.draft?.revision,resource.draft?.contentHash]);
  useEffect(()=>{onLockedChange?.(busy||dirty||fieldEditing);},[busy,dirty,fieldEditing,onLockedChange]);
  useEffect(()=>{history?.lock(historyScope,disabled||busy||fieldEditing);return()=>history?.lock(historyScope,false);},[history,historyScope,disabled,busy,fieldEditing]);
  function setVisibleText(value:string):void{live.current={...live.current,text:value};setText(value);}
  function changeText(value:string,commit=false):void{
    if(disabled)return;
    const previous=live.current.text;
    if(value===previous)return;
    const step={applied:true,persisted:false};
    steps.current.push(step);
    async function restore(target:string,expected:string,applied:boolean):Promise<boolean>{
      // A failed save may have retained this exact target as a repair draft.
      if(live.current.text!==expected&&live.current.text!==target)return false;
      const persist=step.persisted||target!==live.current.base.text;
      setVisibleText(target);queued.current=false;
      if(persist&&!await saveText(target,false))return false;
      step.applied=applied;
      return true;
    }
    history?.record({scope:historyScope,undo:()=>restore(previous,value,false),redo:()=>restore(value,previous,true)});
    setVisibleText(value);
    queued.current=true;
    if(commit)void save();
  }
  function install(updated:StructuredResource,submitted:string):void{
    const next=snapshot(updated);
    const visible=live.current.text!==submitted?live.current.text:next.text;
    live.current={resource:updated,base:next,text:visible};setBase(next);setText(visible);onChanged(updated);
  }
  async function saveText(value:string,announce=true):Promise<boolean>{
    if(saving.current)return false;
    const {resource,base}=live.current;
    saving.current=true;
    setBusy(true);
    try{

      if(value!==base.text||!resource.draft){
        const requestId=crypto.randomUUID();
        const staged=await gateway.write({resourceId:resource.id,expectedRevision:base.revision,content:value,
          requestId,editorKind:resource.draft&&!resource.draft.errors.length?"agent":"human",
          ...(base.draftRevision===undefined?{}:{expectedDraftRevision:base.draftRevision}),
          ...(base.conversationId?{conversationId:base.conversationId}:{})});
        install(staged.resource,value);
        if(staged.status==="invalid"||staged.status==="conflict"){
          const cause=staged.errors.map(issue=>`${issue.code}: ${issue.message} (${issue.path})`).join("；");
          const diagnostic=structuredWriteValidationDiagnostic(staged);
          const message=`${cause||staged.status}；修改已保留。resourceId=${resource.id} ${diagnostic||`requestId=${requestId}`}`;
          notify.error(message);setSaveError(message);
          return false;
        }
        if(staged.status==="applied"){if(announce)notify.success("模板已保存。");return true;}

      }
      throw new Error("模板写入尚未应用，修复草稿已保留，请重试。");
    }catch(reason){const message=reason instanceof Error?reason.message:"无法保存模板，修改已保留。";notify.error(message);setSaveError(message);return false;}
    finally{saving.current=false;setBusy(false);}
  }
  async function save():Promise<void>{
    if(saving.current||!queued.current&&!saveError)return;
    const value=live.current.text;
    queued.current=false;setSaveError(undefined);
    const submittedSteps=steps.current.filter(step=>step.applied);
    if(await saveText(value,false)){
      submittedSteps.forEach(step=>{step.persisted=true;});
      if(queued.current)void save();
    }else setSaveError(current=>current??"自动保存失败，修改已保留。");
  }
  flush.current=save;
  async function recoverDraft():Promise<void>{
    const draft=resource.draft;
    if(!draft||busy||disabled)return;
    setBusy(true);
    try{
      const result=await gateway.write({resourceId:resource.id,expectedRevision:resource.revision,
        expectedDraftRevision:draft.revision,content:draft.content,editorKind:"agent",
        ...(draft.creatorConversationId?{conversationId:draft.creatorConversationId}:{}),requestId:crypto.randomUUID()});
      onChanged(result.resource);
      if(result.status!=="applied"){
        const cause=result.errors.map(issue=>`${issue.code}: ${issue.message}`).join("；")||"待审草稿未能恢复";
        const diagnostic=structuredWriteValidationDiagnostic(result);
        throw new Error(`${cause}${diagnostic?` · ${diagnostic}`:""}`);
      }
    }catch(error){notify.error(error instanceof Error?error.message:String(error));}
    finally{setBusy(false);}
  }
  return <section className="structured-template-resource" aria-label="阅读模板编辑" aria-busy={busy}>
    <ReadingTemplateEditor text={text} disabled={disabled||historyBusy} onChange={changeText} onFieldEditing={setFieldEditing}
      onCommit={()=>{if(!disabled)void save();}}/>
    {saveError&&<p className="template-save-status" role="status">{saveError} <button type="button" disabled={disabled||busy||fieldEditing} onClick={()=>{if(!disabled)void save();}}>重试自动保存</button></p>}
    {resource.draft&&!resource.draft.errors.length&&templateDocument(resource.draft.content)&&<button type="button" disabled={disabled||busy||fieldEditing} onClick={()=>void recoverDraft()}>恢复待审修改</button>}
    <StructuredResourceReview resource={resource} gateway={gateway} onChanged={onChanged} disabled={disabled} hideWhenClean showRepairDraft={false} {...(hbsGateway?{hbsGateway}:{})}/>
  </section>;
}
