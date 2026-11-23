import { Popover } from "@research-assistant/workbench-sdk/overlay";
import { PopoverDisclosure, usePopoverStore, useStoreState } from "@ariakit/react";
import { useRef, useState } from "react";
import { Filter, X } from "lucide-react";
import { nalQueryVariables } from "@research-assistant/core/nal";
import { ControlHint } from "@research-assistant/workbench-sdk/overlay";
import type { NalController } from "./useNal";
import { NalQueryEditorContent } from "./NalQueryEditorContent";
import { newStatementDraft, validQueryConditions } from "./nalQueryBuilderModel";
import { useNalQueryDraft } from "./useNalQueryDraft";

export function NalQueryControl({controller}:{readonly controller:NalController}) {
  const draft=useNalQueryDraft({conditions:[],outputs:undefined});
  const {conditions,setConditions,outputs,setOutputs}=draft;
  const [save,setSave]=useState(false),[name,setName]=useState("");
  const form=useRef<HTMLFormElement>(null);
  const popover=usePopoverStore({placement:"right-start"});
  const open=useStoreState(popover,"open");
  return <div className="nal-query-entry">
    <ControlHint content="设置文献查询"><PopoverDisclosure store={popover} className="nal-query-trigger" aria-label="设置文献查询" disabled={!controller.ready || controller.busy} onClick={()=>{
      if(!open){draft.reset({conditions:controller.query ?? [newStatementDraft()],outputs:controller.outputVariables});setSave(false);setName("");}
    }}><Filter size={16} aria-hidden="true"/>{controller.query && <span className="nal-query-active-dot"/>}</PopoverDisclosure></ControlHint>
    <Popover store={popover} portal fixed modal={false} unmountOnHide gutter={10} fitViewport overflowPadding={12} initialFocus={form}
      hideOnInteractOutside={!controller.busy} hideOnEscape={!controller.busy} className="nal-query-panel" aria-label="文献查询设置">
      <header><div><h3>查询文献</h3><p>单击词项或连接符选择；用 + 添加语句或嵌套分组。</p></div><ControlHint content="关闭查询面板"><button type="button" aria-label="关闭查询面板" disabled={controller.busy} onClick={()=>popover.hide()}><X size={17}/></button></ControlHint></header>
      <form ref={form} tabIndex={-1} onSubmit={event=>{
        event.preventDefault();
        if(!validQueryConditions(conditions))return;
        const selectedOutputs=outputs?.filter(n=>nalQueryVariables(conditions).includes(n));
        if(save){void controller.saveCollection(name.trim(),conditions,undefined,{variables:selectedOutputs}).then(ok=>{if(ok)popover.hide();});}
        else{controller.setQuery(conditions,selectedOutputs);popover.hide();}
      }}>
        <NalQueryEditorContent conditions={conditions} onChange={setConditions} state={controller.state} vocabulary={controller.vocabulary}
          disabled={controller.busy} outputVariables={outputs} onOutputVariablesChange={setOutputs} history={draft}/>
        <label className="nal-query-save-option reading-settings-toggle"><span>保存为查询集合</span><input type="checkbox" role="switch" checked={save} disabled={controller.busy} onChange={e=>setSave(e.target.checked)}/></label>
        {save && <label className="nal-query-name">查询集合名称<input aria-label="查询集合名称" value={name} maxLength={200} required disabled={controller.busy} onChange={e=>setName(e.target.value)}/></label>}
        <footer><button type="button" disabled={controller.busy || !controller.query} onClick={()=>{controller.setQuery(undefined);popover.hide();}}>清除查询</button>
          <button className="nal-query-submit" type="submit" disabled={controller.busy || !validQueryConditions(conditions) || (save && !name.trim())}>{save ? "查询并保存" : "查询文献"}</button></footer>
      </form>
    </Popover>
  </div>;
}
