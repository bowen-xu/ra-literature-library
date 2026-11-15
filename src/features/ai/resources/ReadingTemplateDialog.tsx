import { Dialog } from "@research-assistant/workbench-sdk/overlay";
import { DialogHeading } from "@ariakit/react";
import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { StructuredResource } from "@research-assistant/core/structured-resources";
import {getStructuredResourceGateway,type StructuredResourceGateway} from "@research-assistant/workbench-sdk/structured-resources";
import type { AppHbsDocumentGateway } from "@research-assistant/workbench-sdk/hbs";
import { notify } from "@research-assistant/workbench-sdk/feedback";
import { ManagedReadingTemplate } from "./ManagedReadingTemplate";
import "../PaperPortraitPanel.css";
export interface ReadingTemplateDialogProps {
  readonly initialResourceId?:string;readonly paperReading?:StructuredResource;
  readonly onChanged?:(resource:StructuredResource)=>void;readonly onClose:()=>void;readonly gateway?:StructuredResourceGateway;
  readonly hbsGateway?:AppHbsDocumentGateway;
  readonly disabled?:boolean;
}
export function visibleReadingTemplates(resources:readonly StructuredResource[],initialResourceId?:string):readonly StructuredResource[]{
  return resources.filter(resource=>resource.kind==="readingTemplate"&&(resource.id===initialResourceId||
    !resource.paperId&&(!initialResourceId||resource.content!==null)));
}
export function ReadingTemplateDialog({initialResourceId,paperReading,onChanged,onClose,gateway=getStructuredResourceGateway(),hbsGateway,disabled=false}:ReadingTemplateDialogProps){
  const [rows,setRows]=useState<readonly StructuredResource[]>([]),[selected,setSelected]=useState(initialResourceId??"");
  const [busy,setBusy]=useState(false),[locked,setLocked]=useState(false),[newTitle,setNewTitle]=useState("");
  const generation=useRef(0);
  const resource=rows.find(value=>value.id===selected);
  const paperScope=paperReading!==undefined||resource?.paperId!==undefined,title=paperScope?"本文阅读模板":"全局阅读模板";
  useEffect(()=>{
    let active=true;
    async function reload():Promise<void>{
      const token=++generation.current;
      try{const list=await gateway.list();if(!active||token!==generation.current)return;
        const templates=visibleReadingTemplates(list,initialResourceId);
        setRows(templates);setSelected(current=>templates.some(row=>row.id===current)?current:templates[0]?.id??"");
      }catch(reason){if(active&&token===generation.current)notify.error(reason instanceof Error?reason.message:"无法读取模板");}
    }
    void reload();
    const subscription=gateway.subscribeChanges?.(()=>{if(active)void reload();});
    void subscription?.catch(reason=>{if(active)notify.error(String(reason));});
    return()=>{active=false;generation.current++;void subscription?.then(unlisten=>unlisten()).catch(()=>undefined);};
  },[gateway,initialResourceId]);
  function changed(updated:StructuredResource):void{
    generation.current++;
    setRows(current=>current.map(value=>value.id===updated.id?updated:value));onChanged?.(updated);
  }
  async function createTemplate():Promise<void>{
    if(disabled)return;
    const name=newTitle.trim();if(!name)return;setBusy(true);
    try{const created=await gateway.createTemplate(name,crypto.randomUUID());generation.current++;setRows(current=>[...current.filter(row=>row.id!==created.id),created]);
      setSelected(created.id);setNewTitle("");
    }catch(reason){notify.error(reason instanceof Error?reason.message:"无法创建模板");}
    finally{setBusy(false);}
  }
  return <Dialog open portal aria-label={title} className="structured-template-dialog"
    hideOnInteractOutside={false} onClose={onClose} backdrop={<div className="portrait-detail-backdrop structured-template-backdrop"/>}>
    <header><DialogHeading render={<h2/>}>{title}</DialogHeading>
      <button type="button" aria-label="关闭阅读模板" onClick={onClose}><X size={17} aria-hidden="true"/></button></header>
    <div className="structured-template-scroll" role="region" aria-label="阅读模板内容" tabIndex={0} inert={disabled} aria-disabled={disabled}>
    <label>模板<select aria-label={paperScope?"选择本文阅读模板或全局模板":"选择全局阅读模板"}
      value={selected} disabled={disabled||busy||locked} onChange={event=>setSelected(event.target.value)}>
      {rows.map(value=><option key={value.id} value={value.id}>{value.title}</option>)}</select></label>
    {resource&&<ManagedReadingTemplate key={resource.id} resource={resource} gateway={gateway} onChanged={changed} onLockedChange={setLocked} disabled={disabled} {...(hbsGateway?{hbsGateway}:{})}/>}
    {!initialResourceId&&<div className="structured-template-toolbar">
      <input aria-label="新模板名称" value={newTitle} disabled={disabled||busy||locked} onChange={event=>setNewTitle(event.target.value)}/>
      <button type="button" disabled={disabled||busy||locked||!newTitle.trim()} onClick={()=>void createTemplate()}>新建全局模板草稿</button>
    </div>}
    </div>
  </Dialog>;
}
