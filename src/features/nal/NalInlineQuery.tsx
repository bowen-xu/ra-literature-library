import { ControlHint } from "@research-assistant/workbench-sdk/overlay";
import type { NalDisplayVocabulary } from "./nalPaperCitation";
import { Fragment, useId, useRef, useState, useLayoutEffect, type ReactNode } from "react";
import { Minus, Plus } from "lucide-react";
import { NoteActionMenu, NoteActionMenuItem } from "@research-assistant/workbench-sdk/block-controls";
import type { NalCopula, NalPattern, NalQuery, NalState } from "@research-assistant/core/nal";
import { NalTerm } from "./NalExpression";
import { NalInlineTermMenu } from "./NalInlineTermMenu";
import { NalInlineChoice } from "./NalInlineChoice";
import { newStatementDraft } from "./nalQueryBuilderModel";
import { useNalEditorPolicy } from "./NalEditorPolicy";

interface PatternProps {
  readonly value:NalPattern;readonly label:string;readonly vocabulary:readonly NalDisplayVocabulary[];
  readonly onChange:(value:NalPattern)=>void;readonly disabled:boolean;readonly depth?:number;readonly onAnnounce:(text:string)=>void;
  readonly onRemoveSlot?:()=>void;
}
const symbols={product:"×",conjunction:"∧",disjunction:"∨"} as const;
function Copula({value,label,onChange,disabled}:{readonly value:NalQuery["copula"];readonly label:string;readonly onChange:(c:NalCopula|null)=>void;readonly disabled:boolean}) {
  return <NalInlineChoice<NalCopula> value={value===null ? undefined : value ?? "inheritance"} label={label}
    display={value===null ? "[选择连接符]" : value==="implication" ? "⇒" : "→"} disabled={disabled} onChange={onChange} onClear={()=>onChange(null)}
    choices={[{value:"inheritance",label:"-->（继承）"},{value:"implication",label:"==>（蕴含）"}]} />;
}
function Pattern({value,label,vocabulary,onChange,disabled,depth=0,onAnnounce,onRemoveSlot}:PatternProps) {
  const policy=useNalEditorPolicy();
  const trigger=useRef<HTMLButtonElement>(null);
  const root=useRef<HTMLSpanElement>(null);
  const focusClearedSlot=useRef(false);
  const group=useId(),dragging=useRef<number|undefined>(undefined),[over,setOver]=useState<number>();
  const items=useRef(new Map<number,HTMLSpanElement>()),pendingFocus=useRef<number|undefined>(undefined);
  useLayoutEffect(()=>{
    if(focusClearedSlot.current){(trigger.current ?? root.current?.querySelector<HTMLElement>("button"))?.focus({preventScroll:true});focusClearedSlot.current=false;}
    if(pendingFocus.current!==undefined){items.current.get(pendingFocus.current)?.focus();pendingFocus.current=undefined;}
  },[value]);
  const slot=(display:ReactNode)=><NalInlineTermMenu triggerRef={trigger} value={value} label={label} display={display}
    onChange={next=>{if("terms" in next)pendingFocus.current=0;onChange(next);}} disabled={disabled} vocabulary={vocabulary} depth={depth} {...(onRemoveSlot ? {onRemoveSlot} : {})}/>;
  const add=(index:number)=>{
    if(!("terms" in value) || value.terms.length>=16)return;
    const terms=[...value.terms];terms.splice(index,0,{kind:"concept",id:""});
    pendingFocus.current=index;onChange({...value,terms});onAnnounce(`已在第 ${index+1} 项插入空槽`);
  };
  const remove=(index:number)=>{
    if(!("terms" in value))return;
    const terms=value.terms.filter((_,n)=>n!==index);
    if(terms.length<2){focusClearedSlot.current=true;onChange(terms[0] ?? {kind:"concept",id:""});}
    else{pendingFocus.current=Math.min(index,terms.length-1);onChange({...value,terms});}
    onAnnounce(`已删除第 ${index+1} 项`);
  };
  const boundary=(side:"left"|"right")=>("terms" in value && <NoteActionMenu className="nal-inline-choice"
    label={`${label} ${side==="left" ? "左括号" : "右括号"}`} trigger={side==="left" ? "(" : ")"} triggerClassName="nal-inline-token" disabled={disabled} portal>
    <NoteActionMenuItem disabled={value.terms.length>=16} onClick={()=>add(side==="left" ? 0 : value.terms.length)}><Plus /><span>增加槽位</span></NoteActionMenuItem>
  </NoteActionMenu>);
  const move=(from:number,to:number,focus=false)=>{
    if(!("terms" in value) || from===to || from<0 || to<0 || to>=value.terms.length)return;
    const terms=[...value.terms],term=terms.splice(from,1)[0]!;terms.splice(to,0,term);if(focus)pendingFocus.current=to;onChange({...value,terms});
    onAnnounce(`已从第 ${from+1} 项移到第 ${to+1} 项`);
  };
  return <span ref={root} className="nal-inline-product" onClick={event=>{if(event.target===event.currentTarget && !("terms" in value)){event.stopPropagation();trigger.current?.click();}}}>
    {"terms" in value ? boundary("left") : slot(value.kind==="statement" ? "<" : <NalTerm term={value} vocabulary={vocabulary} emptyTermLabel="[选择词项]"/>)}
    {"terms" in value && <>{value.terms.map((term,index)=><Fragment key={index}>
      {index>0 && <NalInlineChoice<"product"|"conjunction"|"disjunction"> value={value.kind==="compound" ? undefined : value.kind} label={`${label} connector ${index}`} display={value.kind==="compound" ? " [选择连接符] " : ` ${symbols[value.kind]} `}
        disabled={disabled} onChange={kind=>onChange({...value,kind})} onClear={()=>{focusClearedSlot.current=true;onChange({kind:"concept",id:""});}}
        choices={[{value:"product",label:"product（×）"},...(policy.purpose==="query" ? [{value:"conjunction" as const,label:"conjunction（∧）"},{value:"disjunction" as const,label:"disjunction（∨）"}] : [])]}>
        <NoteActionMenuItem disabled={value.terms.length>=16} onClick={()=>add(index)}><Plus /><span>增加槽位</span></NoteActionMenuItem>
        {onRemoveSlot && <NoteActionMenuItem onClick={onRemoveSlot} aria-label="删除槽位" aria-description="整个组合及内部词项"><Minus /><span>删除槽位<small className="nal-menu-caption" aria-hidden="true">整个组合</small></span></NoteActionMenuItem>}
      </NalInlineChoice>}
      <ControlHint content="拖动调整顺序；Alt + 左右方向键移动"><span className="nal-compound-item" ref={element=>{if(element)items.current.set(index,element);else items.current.delete(index);}} data-drop-target={over===index || undefined} draggable={!disabled} role="group" aria-label={`${label} 第 ${index+1} 项（可拖动排序）`} tabIndex={disabled ? -1 : 0} onDragStart={e=>{
          e.stopPropagation();dragging.current=index;e.dataTransfer.effectAllowed="move";e.dataTransfer.setData("application/x-nal-compound",group);
        }} onDragOver={e=>{if(e.dataTransfer.types.includes("application/x-nal-compound"))e.stopPropagation();if(dragging.current!==undefined){e.preventDefault();e.dataTransfer.dropEffect="move";setOver(index);}}}
        onDragLeave={()=>setOver(undefined)} onDragEnd={e=>{e.stopPropagation();dragging.current=undefined;setOver(undefined);}}
        onDrop={e=>{if(e.dataTransfer.types.includes("application/x-nal-compound"))e.stopPropagation();if(dragging.current!==undefined && e.dataTransfer.getData("application/x-nal-compound")===group){e.preventDefault();move(dragging.current,index);}dragging.current=undefined;setOver(undefined);}}
        onKeyDown={e=>{if(e.altKey && (e.key==="ArrowLeft" || e.key==="ArrowRight")){e.preventDefault();e.stopPropagation();move(index,index+(e.key==="ArrowLeft" ? -1 : 1),true);}}}>
        <Pattern value={term} label={`${label} · 第 ${index+1} 项`} vocabulary={vocabulary} disabled={disabled} depth={depth+1} onAnnounce={onAnnounce} onRemoveSlot={()=>remove(index)} onChange={next=>onChange({...value,terms:value.terms.map((t,n)=>n===index ? next : t)})}/>
      </span></ControlHint>
    </Fragment>)}{boundary("right")}</>}
    {value.kind==="statement" && <><Statement query={value} label={label} vocabulary={vocabulary} disabled={disabled} depth={depth+1} onAnnounce={onAnnounce} onChange={next=>onChange({kind:"statement",...next})}/>{">"}</>}
  </span>;
}
function Statement({query,label,vocabulary,onChange,disabled,depth=0,onAnnounce,connector}:{readonly query:NalQuery;readonly label:string;readonly vocabulary:readonly NalDisplayVocabulary[];readonly onChange:(q:NalQuery)=>void;readonly disabled:boolean;readonly depth?:number;readonly onAnnounce:(text:string)=>void;readonly connector?:ReactNode}) {
  return <>
    {query.copula!==null && <><Pattern value={query.subject} label={`${label} 左槽`} vocabulary={vocabulary} disabled={disabled} depth={depth} onAnnounce={onAnnounce} onChange={subject=>onChange({...query,subject})}/>{" "}</>}
    {connector ?? <Copula value={query.copula} label={`${label} 连接符`} disabled={disabled} onChange={copula=>onChange(copula===null ? newStatementDraft() : {...query,copula})}/>}
    {query.copula!==null && <>{" "}<Pattern value={query.predicate} label={`${label} 右槽`} vocabulary={vocabulary} disabled={disabled} depth={depth} onAnnounce={onAnnounce} onChange={predicate=>onChange({...query,predicate})}/></>}
  </>;
}
export function NalInlineQuery({query,number,vocabulary,onChange,disabled,onAnnounce=()=>{},connector}:{readonly query:NalQuery;readonly number:number|string;readonly state:NalState;readonly vocabulary:readonly NalDisplayVocabulary[];readonly onChange:(value:NalQuery)=>void;readonly disabled:boolean;readonly onAnnounce?:(text:string)=>void;readonly connector?:ReactNode}) {
  return <Statement query={query} label={`条件 ${number}`} vocabulary={vocabulary} onChange={onChange} disabled={disabled} onAnnounce={onAnnounce} connector={connector}/>;
}
