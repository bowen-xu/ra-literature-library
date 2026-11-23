import { ControlHint } from "@research-assistant/workbench-sdk/overlay";
import { NalTransitivityExpression } from "./NalExpression";
import type { NalController } from "./useNal";
import { Plus, Trash2 } from "lucide-react";

export function NalRelationRule({controller,conceptId}:{readonly controller:Pick<NalController,"state"|"vocabulary"|"ready"|"busy"|"mutate">;readonly conceptId:string}) {
  const defined = controller.state.rules.some(r=>r.relationConceptId === conceptId);
  return <section className="nal-relation-rule" aria-label="关系传递规则">
    {defined ? <>
      <header><span>传递规则</span><ControlHint content="删除传递规则"><button type="button" aria-label="删除传递规则" disabled={controller.busy || !controller.ready}
        onClick={()=>void controller.mutate({kind:"set_transitivity",relationConceptId:conceptId,enabled:false},controller.state.revision)}><Trash2 size={14}/></button></ControlHint></header>
      <code><NalTransitivityExpression conceptId={conceptId} vocabulary={controller.vocabulary}/></code>
    </> : <button type="button" className="nal-rule-create" disabled={controller.busy || !controller.ready}
      onClick={()=>void controller.mutate({kind:"set_transitivity",relationConceptId:conceptId,enabled:true},controller.state.revision)}><Plus size={14}/>添加传递规则</button>}
  </section>;
}
