import { useEffect, useRef } from "react";
import { getNalGateway } from "../../services/nalGateway";
import { notify } from "@research-assistant/workbench-sdk/feedback";
import { useNoteAnnotations } from "@research-assistant/workbench-sdk/note-resources";
import type { NalAnnotationTarget } from "./NalStatements";
import type { NalController } from "./useNal";

/** Resolves the document; the existing app-owned note host owns editing. */
export function useNalAnnotation(controller: Pick<NalController,"refresh">) {
  const client=useNoteAnnotations(), pending=useRef(false), alive=useRef(true);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  return async(target:NalAnnotationTarget):Promise<void>=>{
    if(pending.current)return;
    pending.current=true;
    try {
      const annotation=await getNalGateway().ensureAnnotation({targetKind:target.kind,targetId:target.id,title:target.label.slice(0,240)});
      client.notifyChanged();
      if(alive.current){
        await controller.refresh();
        if(alive.current)window.dispatchEvent(new CustomEvent("research-assistant:open-annotation-note",{detail:{pageId:annotation.notePageId,kind:target.kind}}));
      }
    }catch(reason){if(alive.current)notify.error(reason instanceof Error ? reason.message : String(reason));}
    finally{pending.current=false;}
  };
}
