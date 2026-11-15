import { ControlHint } from "@research-assistant/workbench-sdk/overlay";
import { notify } from "@research-assistant/workbench-sdk/feedback";
import { confirm } from "@research-assistant/workbench-sdk/platform";
import { useRef,useState } from "react";
import { NotebookPen,Trash2 } from "lucide-react";
import { formatNalStatement,type NalStatement } from "@research-assistant/core/nal";
import type { NalController } from "./useNal";
import { NalExpression } from "./NalExpression";
export interface NalAnnotationTarget {readonly kind:"concept"|"statement";readonly id:string;readonly label:string}
export function NalStatements({controller,statements,onAnnotate}:{readonly controller:Pick<NalController,"state"|"vocabulary"|"busy"|"mutate">;readonly statements:readonly NalStatement[];readonly onAnnotate:(target:NalAnnotationTarget)=>void}){
  const deleteLocked=useRef(false);
  const [deleting,setDeleting]=useState(false);
  async function deleteStatement(id:string,label:string) {
    if(controller.busy || deleteLocked.current)return;
    const revision=controller.state.revision;
    deleteLocked.current=true;setDeleting(true);
    try {
      if(!await confirm(`删除语句“${label}”？文献、概念和笔记本身保留。`))return;
      await controller.mutate({kind:"delete_statement",id},revision);
    } catch(e){notify.error(e instanceof Error ? e.message : typeof e === "string" ? e : "语句删除失败");}
    finally{deleteLocked.current=false;setDeleting(false);}
  }
  return <ul className="nal-statements">{statements.map(s=>{
    const label=formatNalStatement(s,controller.vocabulary,{displayOnly:true});
    return <li key={s.id}><div><code><NalExpression statement={s} vocabulary={controller.vocabulary}/></code>{s.origin === "legacy" && <small>原归类迁移</small>}</div><div className="nal-row-actions">
      <ControlHint content="语句笔记"><button type="button" aria-label={`语句笔记：${label}`} onClick={()=>onAnnotate({kind:"statement",id:s.id,label})}><NotebookPen size={15}/></button></ControlHint>
      <ControlHint content="删除语句"><button type="button" disabled={controller.busy || deleting} aria-label={`删除语句：${label}`} onClick={()=>void deleteStatement(s.id,label)}><Trash2 size={14}/></button></ControlHint>
    </div></li>;
  })}{!statements.length && <li className="nal-empty">尚无关系语句</li>}</ul>;
}
