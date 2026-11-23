import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { emptyNalState, nalQueryVariables, type NalMutation, type NalQueryBlock, type NalState, type NalQueryCollection, type NalQueryCollections } from "@research-assistant/core/nal";
import type { LiteratureItem } from "@research-assistant/core/literature";
import { getNalGateway } from "../../services/nalGateway";
import { getLiteratureGateway } from "../../services/literatureGateway";
import { loadNalQueryCollections } from "../../services/nalQueryCollections";
import { notify } from "@research-assistant/workbench-sdk/feedback";
import { nalPaperCitation, type NalDisplayVocabulary } from "./nalPaperCitation";
function vocabularyFor(state: NalState, papers: readonly LiteratureItem[]): readonly NalDisplayVocabulary[] {
  return [...state.concepts.map(c=>({atom:{kind:"concept" as const,id:c.id},label:c.label})),
    ...papers.map(p=>({atom:{kind:"paper" as const,id:p.id},label:p.title,paperCitation:nalPaperCitation(p)}))];
}
export function useNal(items: readonly LiteratureItem[]) {
  const [state,setState]=useState(emptyNalState),[query,setConditions]=useState<readonly NalQueryBlock[]>(),[ready,setReady]=useState(false),[busy,setBusy]=useState(false);
  const [catalog,setCatalog]=useState<readonly LiteratureItem[]>([]),[projection,setProjection]=useState<NalQueryCollections>();
  const [selectedCollectionId,setSelectedCollectionId]=useState<string>();
  const [queryOutputs,setQueryOutputs]=useState<readonly string[]>();
  const [cacheError,setCacheError]=useState<string>();
  const generation=useRef(0),mounted=useRef(true),locked=useRef(false);
  const refresh=useCallback(async()=>{
    const request=++generation.current;
    try {
      // Quick search limits displayed rows, not active relation endpoints.
      const [next,papers]=await Promise.all([getNalGateway().read(),getLiteratureGateway().list()]);
      let views: NalQueryCollections | undefined, failure: string | undefined;
      try { views=await loadNalQueryCollections(next,new Set(papers.map(p=>p.id)),vocabularyFor(next,papers)); }
      catch(e) { failure=e instanceof Error ? e.message : String(e); }
      if(mounted.current && request===generation.current){setState(next);setCatalog(papers);if(views)setProjection(views);setCacheError(failure);setReady(true);return true;}
      return false;
    } catch(e){if(mounted.current && request===generation.current){setReady(false);notify.error(e instanceof Error ? e.message : typeof e === "string" ? e : "关系读取失败");}return false;}
  },[]);
  useEffect(()=>{mounted.current=true;void refresh();return()=>{mounted.current=false;generation.current++;};},[refresh]);
  useEffect(()=>{void refresh();},[items,refresh]);
  useEffect(()=>{const update=()=>void refresh();window.addEventListener("focus",update);window.addEventListener("storage",update);return()=>{window.removeEventListener("focus",update);window.removeEventListener("storage",update);};},[refresh]);
  const mutate=useCallback(async(mutation:NalMutation,revision:number)=>{
    if(locked.current)return false;locked.current=true;setBusy(true);generation.current++;
    try{
      await getNalGateway().mutate(mutation,revision);
      notify.success("关系已保存");
      // Refresh also covers trash/restore and other writers; source edits remain saved if cache persistence fails.
      await refresh();return true;
    } catch(e){notify.error(e instanceof Error ? e.message : typeof e === "string" ? e : "关系保存失败");await refresh();return false;}
    finally{locked.current=false;if(mounted.current)setBusy(false);}
  },[refresh]);
  const vocabulary=useMemo(()=>vocabularyFor(state,catalog),[state,catalog]);
  const collections=useMemo(()=>projection?.results() ?? [],[projection]);
  const selected=collections.find(c=>c.definition.id === selectedCollectionId);
  const setQuery=useCallback((value:NalQueryBlock | readonly NalQueryBlock[] | undefined,outputs?:readonly string[])=>{
    setSelectedCollectionId(undefined);setQueryOutputs(outputs);setConditions(value ? Array.isArray(value) ? value : [value as NalQueryBlock] : undefined);
  },[]);
  const selectCollection=useCallback((id:string)=>{
    const collection=collections.find(c=>c.definition.id === id);
    if(collection){setSelectedCollectionId(id);setConditions(collection.conditions);}
  },[collections]);
  const editCollections=useCallback(async(edit:(definitions:readonly NalQueryCollection[])=>readonly NalQueryCollection[])=>{
    if(locked.current)return false;locked.current=true;setBusy(true);generation.current++;
    try {
      const [next,papers]=await Promise.all([getNalGateway().read(),getLiteratureGateway().list()]);
      const views=await loadNalQueryCollections(next,new Set(papers.map(p=>p.id)),vocabularyFor(next,papers),edit);
      if(mounted.current){setState(next);setCatalog(papers);setProjection(views);setCacheError(undefined);}
      return true;
    }catch(e){notify.error(e instanceof Error ? e.message : String(e));return false;}
    finally{locked.current=false;if(mounted.current)setBusy(false);}
  },[]);
  const saveCollection=useCallback(async(name:string,conditions:readonly NalQueryBlock[],parentId?:string,outputs?:{readonly variables:readonly string[]|undefined})=>{
    const id=crypto.randomUUID();
    const success=await editCollections(defs=>[...defs,{id,name,conditions,...(parentId ? {parentId} : {}),...(outputs ? outputs.variables ? {outputVariables:outputs.variables} : {outputMode:"all" as const} : {})}]);
    if(success){setSelectedCollectionId(id);setConditions(conditions);}return success;
  },[editCollections]);
  const removeCollection=useCallback(async(id:string)=>{
    const removed=new Set([id]);
    const success=await editCollections(defs=>{
      for(let i=0;i<defs.length;i++)for(const d of defs)if(d.parentId && removed.has(d.parentId))removed.add(d.id);
      return defs.filter(d=>!removed.has(d.id));
    });
    if(success && selectedCollectionId && removed.has(selectedCollectionId))setQuery(undefined);
    return success;
  },[editCollections,selectedCollectionId,setQuery]);
  const effectiveQuery=selected?.conditions ?? query;
  const outputVariables=selected ? selected.definition.outputMode==="all" ? undefined : selected.definition.outputVariables : queryOutputs;
  const result=useMemo(()=>{
    if(cacheError || !projection)return {matches:[],paperIds:[],error:cacheError};
    if(selected)return selected;
    if(selectedCollectionId)return {matches:[],paperIds:[],error:"查询集合已被移除，请选择其他查询"};
    try{return effectiveQuery ? projection.query(effectiveQuery,outputVariables ?? nalQueryVariables(effectiveQuery)) : {matches:[],paperIds:[]};}
    catch(e){return {matches:[],paperIds:[],error:e instanceof Error ? e.message : "关系推导失败"};}
  },[projection,selected,selectedCollectionId,effectiveQuery,outputVariables,cacheError]);
  const error="error" in result ? result.error : undefined;
  useEffect(()=>{if(error)notify.error(error);},[error]);
  const allowed=useMemo(()=>new Set(effectiveQuery ? result.paperIds : items.map(p=>p.id)),[result.paperIds,effectiveQuery,items]);
  return {state,query:effectiveQuery,outputVariables,setQuery,ready,busy,refresh,mutate,vocabulary,matches:result.matches,allowed,
    collections,selectedCollectionId,selectCollection,saveCollection,removeCollection,editCollections,cacheError};
}
export type NalController=ReturnType<typeof useNal>;
