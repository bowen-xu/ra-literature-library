import { useEffect, useRef, useSyncExternalStore } from "react";
import type { StructuredResource } from "@research-assistant/core/structured-resources";
import type { StructuredResourceGateway } from "@research-assistant/workbench-sdk/structured-resources";
import { notify } from "@research-assistant/workbench-sdk/feedback";
import { usePortraitEditHistory } from "../PortraitEditHistory";
interface State {readonly revision:number;readonly undo:readonly number[];readonly redo:readonly number[];readonly busy:boolean}
interface Store {state:State;listeners:Set<()=>void>}
// One resource owner across its reader and library views; the native journal owns the snapshots.
const gateways = new WeakMap<StructuredResourceGateway,Map<string,Store>>();
function storeFor(gateway:StructuredResourceGateway,resource:StructuredResource):Store {
  let resources=gateways.get(gateway);
  if(!resources){resources=new Map();gateways.set(gateway,resources);}
  let store=resources.get(resource.id);
  if(!store){store={state:{revision:resource.revision,undo:[],redo:[],busy:false},listeners:new Set()};resources.set(resource.id,store);}
  return store;
}
function publish(store:Store,next:State):void {store.state=next;store.listeners.forEach(listener=>listener());}
export function useStructuredResourceHistory(resource:StructuredResource,gateway:StructuredResourceGateway,
  onChanged:(resource:StructuredResource)=>void) {
  const store=storeFor(gateway,resource);
  const panelHistory=usePortraitEditHistory();
  const historyScope=`${resource.id}:form`;
  const live=useRef({resource,onChanged});live.current={resource,onChanged};
  const state=useSyncExternalStore(listener=>{store.listeners.add(listener);return()=>{store.listeners.delete(listener);};},()=>store.state);
  useEffect(()=>{
    if(!store.state.busy && store.state.revision<resource.revision) {
      publish(store,{revision:resource.revision,undo:[],redo:[],busy:false});
      panelHistory?.clearScope(historyScope);
    }
  },[store,resource.revision]);
  useEffect(()=>{
    panelHistory?.lock(historyScope,state.busy);
    return()=>panelHistory?.lock(historyScope,false);
  },[panelHistory,historyScope,state.busy]);
  async function apply(operation:(requestId:string)=>Promise<StructuredResource>,direction?:"undo"|"redo"):Promise<boolean> {
    if(store.state.busy)return false;
    const start=store.state,base=live.current.resource;
    if(start.revision!==base.revision)return false;
    publish(store,{...start,busy:true});
    try{
      const result=await operation(crypto.randomUUID());
      const stillCurrent=live.current.resource.id===base.id;
      const visibleRevision=stillCurrent?live.current.resource.revision:base.revision;
      if(result.id!==base.id || result.revision!==base.revision+1 || visibleRevision>result.revision){
        panelHistory?.clearScope(historyScope);
        publish(store,{revision:Math.max(result.revision,visibleRevision),undo:[],redo:[],busy:false});
        if(stillCurrent&&result.revision>=visibleRevision)live.current.onChanged(result);
        notify.error("资源已变化，请核对最新内容后继续。");return false;
      }
      const source=direction==="undo"?start.undo:start.redo;
      const entry=source[source.length-1];
      const undo=direction==="undo"?start.undo.slice(0,-1):direction==="redo"?[...start.undo,entry!]:[...start.undo,result.revision];
      const redo=direction==="undo"?[...start.redo,entry!]:direction==="redo"?start.redo.slice(0,-1):[];
      publish(store,{revision:result.revision,undo,redo,busy:false});
      if(!direction)panelHistory?.record({scope:historyScope,undo:()=>replay("undo"),redo:()=>replay("redo")});
      if(stillCurrent)live.current.onChanged(result);return true;
    }catch(reason){
      const current=live.current.resource;
      if(current.id===base.id&&current.revision>start.revision)panelHistory?.clearScope(historyScope);
      publish(store,current.id===base.id&&current.revision>start.revision
        ?{revision:current.revision,undo:[],redo:[],busy:false}:{...start,busy:false});
      notify.error(reason instanceof Error?reason.message:"无法保存操作，当前内容已保留。");return false;
    }
  }
  async function replay(direction:"undo"|"redo"):Promise<boolean>{
    const entries=direction==="undo"?store.state.undo:store.state.redo;
    const operationRevision=entries[entries.length-1];
    if(operationRevision===undefined)return false;
    return apply(requestId=>gateway.restoreHistory({resourceId:resource.id,
      expectedRevision:live.current.resource.revision,operationRevision,direction,requestId}),direction);
  }
  return {busy:state.busy,canUndo:state.revision===resource.revision&&state.undo.length>0,
    canRedo:state.revision===resource.revision&&state.redo.length>0,
    perform:apply,undo:()=>replay("undo"),redo:()=>replay("redo"),panelHistory};
}
