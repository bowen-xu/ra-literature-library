import { Plus,X } from "lucide-react";
import { nalQueryVariables,type NalQueryBlock } from "@research-assistant/core/nal";

/** All variables stay visible; the per-tag action changes only the output projection. */
export function NalQueryOutputs({conditions,value,onChange,disabled=false}:{readonly conditions:readonly NalQueryBlock[];readonly value:readonly string[]|undefined;readonly onChange:(names:readonly string[]|undefined)=>void;readonly disabled?:boolean}) {
  const variables=nalQueryVariables(conditions),selected=value ?? variables;
  return <section className="nal-query-outputs" aria-label="输出变量"><strong>输出变量</strong>
    {variables.length ? <div className="nal-query-output-list">{variables.map(name=>{
      const included=selected.includes(name);
      return <button type="button" className="nal-output-tag" data-included={included} key={name} aria-label={`${included ? "移除" : "添加"}输出变量 ?${name}`} aria-pressed={included} disabled={disabled} onClick={()=>{
        const next=included ? selected.filter(n=>n!==name && variables.includes(n)) : [...selected.filter(n=>variables.includes(n)),name];
        onChange(next.length===variables.length ? undefined : next);
      }}><span className="nal-variable-term">?{name}</span>{included ? <X size={12} aria-hidden="true"/> : <Plus size={12} aria-hidden="true"/>}</button>;
    })}</div> : <small>添加变量后自动列出。</small>}
  </section>;
}
