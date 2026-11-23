import { BlockControlsProvider, FloatingBlockControls } from "@research-assistant/workbench-sdk/block-controls";
import { nalBlockDragDom } from "./nalBlockDragDom";
import type { NalDisplayVocabulary } from "./nalPaperCitation";
import { useId,useRef,useState,useLayoutEffect,useMemo } from "react";
import { X } from "lucide-react";
import { isNalQueryGroup,nalQueryLeaves,nalConceptKind,type NalQueryBlock,type NalQueryGroup,type NalState } from "@research-assistant/core/nal";
import { NoteActionMenu as ActionMenu,NoteActionMenuItem as ActionMenuItem } from "@research-assistant/workbench-sdk/block-controls";
import { ControlHint } from "@research-assistant/workbench-sdk/overlay";
import { BlockAddButton, BlockDragButton } from "@research-assistant/workbench-sdk/block-controls";
import { useNalBlockDrag } from "./useNalBlockDrag";
import { useNalEditorPolicy } from "./NalEditorPolicy";
import { NalInlineQuery } from "./NalInlineQuery";
import { NalInlineChoice } from "./NalInlineChoice";
import { newGroupDraft,newStatementDraft } from "./nalQueryBuilderModel";
interface Props {
  readonly conditions:readonly NalQueryBlock[];readonly onChange:(value:readonly NalQueryBlock[])=>void;
  readonly state:NalState;readonly vocabulary:readonly NalDisplayVocabulary[];readonly disabled?:boolean;readonly maxConditions?:number;
}
interface ListProps extends Omit<Props,"conditions"|"onChange"> {
  readonly blocks:readonly NalQueryBlock[];readonly onChange:(blocks:readonly NalQueryBlock[])=>void;
  readonly prefix:string;readonly depth:number;readonly leafCount:number;readonly announce:(message:string)=>void;
}
const groupDepth=(block:NalQueryBlock):number=>isNalQueryGroup(block) ? 1+Math.max(0,...block.children.map(groupDepth)) : 0;
function BlockList({blocks,onChange,prefix,depth,leafCount,announce,state,vocabulary,disabled=false,maxConditions=16}:ListProps){
  const query=useNalEditorPolicy().purpose==="query";
  const scope=useId(),identities=useRef(new WeakMap<NalQueryBlock,string>()),sequence=useRef(0);
  const identity=(block:NalQueryBlock):string=>{
    let id=identities.current.get(block);
    if(!id){id=`${scope}-${++sequence.current}`;identities.current.set(block,id);}
    return id;
  };
  const ids=blocks.map(identity);
  const handles=useRef(new Map<number,HTMLButtonElement>()),pendingFocus=useRef<number|undefined>(undefined);
  useLayoutEffect(()=>{if(pendingFocus.current!==undefined){handles.current.get(pendingFocus.current)?.focus();pendingFocus.current=undefined;}},[blocks]);
  const replace=(index:number,next:NalQueryBlock)=>{
    const previous=blocks[index];if(previous)identities.current.set(next,identity(previous));
    onChange(blocks.map((block,i)=>i===index ? next : block));
  };
  const insert=(index:number,connector?:NalQueryGroup["connector"])=>{
    const block=connector ? newGroupDraft(connector) : newStatementDraft();
    const next=[...blocks];next.splice(index,0,block);onChange(next);
  };
  const move=(from:number,to:number,focus=false)=>{
    if(disabled || from===to || to<0 || to>=blocks.length)return;
    const next=[...blocks],block=next.splice(from,1)[0]!;next.splice(to,0,block);if(focus)pendingFocus.current=to;onChange(next);announce(`block 已从第 ${from+1} 行移到第 ${to+1} 行`);
  };
  const pointerDown=useNalBlockDrag(ids,disabled,move);
  return <div className="nal-query-block-list">{blocks.map((block,i)=>{
    const number=prefix ? `${prefix}.${i+1}` : String(i+1),isGroup=isNalQueryGroup(block),label=`${isGroup ? "分组" : "条件"} ${number}`;
    const canAddGroup=depth<12,canWrap=depth+groupDepth(block)<12;
    return <div key={ids[i]} data-nal-block-id={ids[i]} className={isGroup ? "nal-query-group" : "nal-query-block"} role="group" aria-label={label}>
      <div data-nal-block-content data-block-interaction-row className={isGroup ? "nal-query-group-heading" : "nal-query-block-content"}>
        <FloatingBlockControls blockId={ids[i]!} label={`块控件：${label}`}>
          <ActionMenu className="nal-block-add-menu" label={`添加 block：${label}`} trigger={null} triggerClassName="block-control-button block-add-button" triggerRender={<BlockAddButton/>} contentClassName="nal-block-menu" disabled={disabled} placement="bottom-start" portal>
            <ActionMenuItem disabled={leafCount>=maxConditions} onClick={()=>insert(i+1)}>添加 statement</ActionMenuItem>
            {query && <><ActionMenuItem disabled={leafCount+2>maxConditions || !canAddGroup} onClick={()=>insert(i+1,"conjunction")}>添加 conjunction 分组</ActionMenuItem>
            <ActionMenuItem disabled={leafCount+2>maxConditions || !canAddGroup} onClick={()=>insert(i+1,"disjunction")}>添加 disjunction 分组</ActionMenuItem>
            <ActionMenuItem disabled={!canWrap || leafCount>=maxConditions} onClick={()=>replace(i,newGroupDraft("conjunction",block))}>放入 conjunction 分组</ActionMenuItem>
            <ActionMenuItem disabled={!canWrap || leafCount>=maxConditions} onClick={()=>replace(i,newGroupDraft("disjunction",block))}>放入 disjunction 分组</ActionMenuItem></>}
          </ActionMenu>
          <BlockDragButton ref={element=>{if(element)handles.current.set(i,element);else handles.current.delete(i);}} disabled={disabled} aria-label={`拖动${label}`}
            onPointerDown={event=>pointerDown(event,ids[i]!)}
            onKeyDown={e=>{if(e.altKey && (e.key==="ArrowUp" || e.key==="ArrowDown")){e.preventDefault();e.stopPropagation();move(i,i+(e.key==="ArrowUp" ? -1 : 1),true);}}}/>
        </FloatingBlockControls>
        {isGroup ? <div className="nal-group-connector"><NalInlineChoice<NalQueryGroup["connector"]> label={`${label} connector`} value={block.connector}
          display={block.connector==="conjunction" ? "∧ conjunction" : "∨ disjunction"} disabled={disabled}
          onChange={connector=>replace(i,{...block,connector})} choices={[{value:"conjunction",label:"∧ conjunction"},{value:"disjunction",label:"∨ disjunction"}]}/></div>
          : <output className="nal-inline-statement" aria-label={`${label} Narsese 语句`}><code><NalInlineQuery query={block} number={number} state={state} vocabulary={vocabulary} disabled={disabled} onAnnounce={announce} onChange={next=>replace(i,next)}
            connector={<NalInlineChoice<"inheritance"|"implication"|"conjunction"|"disjunction"> label={`${label} 连接符`} value={block.copula===null ? undefined : block.copula ?? "inheritance"}
              display={block.copula===null ? "[选择连接符]" : block.copula==="implication" ? "⇒" : "→"} disabled={disabled}
              onChange={connector=>replace(i,connector==="inheritance" || connector==="implication" ? {...block,copula:connector} : newGroupDraft(connector,block))}
              onClear={()=>replace(i,newStatementDraft())}
              choices={[{value:"inheritance",label:"-->（继承）"},...(query ? [{value:"implication" as const,label:"==>（蕴含）"}] : []),
                ...(query && block.copula===null ? [
                  {value:"conjunction" as const,label:"conjunction（∧）",disabled:!canWrap || leafCount>=maxConditions},
                  {value:"disjunction" as const,label:"disjunction（∨）",disabled:!canWrap || leafCount>=maxConditions},
                ] : [])]}/>}/></code></output>}
        <ControlHint content="移除 block"><button type="button" className="nal-query-block-remove" disabled={disabled || (!isGroup && (depth===0 ? blocks.length<=1 : blocks.length<=2 && block.copula===null))} aria-label={`移除${label}`} onClick={()=>{
          if(blocks.length<=(depth>0 ? 2 : 1))replace(i,newStatementDraft());
          else onChange(blocks.filter((_,n)=>n!==i));
        }}><X size={14}/></button></ControlHint>
      </div>
      {isGroup && <BlockList blocks={block.children} onChange={children=>replace(i,{...block,children})} prefix={number} depth={depth+1} leafCount={leafCount} announce={announce} state={state} vocabulary={vocabulary} disabled={disabled} maxConditions={maxConditions}/>}
    </div>;
  })}</div>;
}
export function NalQueryBuilder({conditions,onChange,state,vocabulary,disabled=false,maxConditions=16}:Props){
  const [announcement,setAnnouncement]=useState("");
  const surfaceId=useId();
  const surface=useRef<HTMLDivElement>(null);
  const editorVocabulary=useMemo(()=>{
    const kinds=new Map(state.concepts.map(concept=>[concept.id,nalConceptKind(concept,state)]));
    return vocabulary.map(entry=>{
      const conceptKind=entry.atom.kind==="concept" ? kinds.get(entry.atom.id) : undefined;
      return conceptKind ? {...entry,conceptKind} : entry;
    });
  },[state,vocabulary]);
  return <BlockControlsProvider root={surface} dom={nalBlockDragDom}><div ref={surface} className="nal-query-builder" data-nal-block-surface={surfaceId} aria-label="查询条件"><BlockList blocks={conditions} onChange={onChange} prefix="" depth={0} leafCount={nalQueryLeaves(conditions).length} announce={setAnnouncement} state={state} vocabulary={editorVocabulary} disabled={disabled} maxConditions={maxConditions}/><span className="nal-sr-only" role="status">{announcement}</span></div></BlockControlsProvider>;
}
