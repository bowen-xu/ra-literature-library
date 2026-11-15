import { useEffect, useRef, useState } from "react";
import { assertAvailableConceptName, type Concept } from "@research-assistant/core/knowledge";
import { getResearchKnowledgeGateway, researchKnowledgeErrorMessage } from "../../services/knowledgeGateway";
import { notify } from "@research-assistant/workbench-sdk/feedback";
import type { NalController } from "./useNal";

/** Also embedded beside a new concept draft so either conflicting name can be edited. */
export function NalExistingConceptEditor({id, controller, disabled=false, onBusy, onClose}: {
  readonly id: string;
  readonly controller: Pick<NalController,"state"|"refresh">;
  readonly disabled?: boolean;
  readonly onBusy?: (busy:boolean)=>void;
  readonly onClose: ()=>void;
}) {
  const [concept, setConcept] = useState<Concept>();
  const [label, setLabel] = useState("");
  const [explanation, setExplanation] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  useEffect(()=>{
    let active=true;
    void getResearchKnowledgeGateway().searchConcepts("").then(values=>{
      if (!active) return;
      const value=values.find(c=>c.id === id);
      if (!value) {setError("概念已不存在，请刷新后重试");return;}
      setConcept(value);setLabel(value.label);setExplanation(value.explanation);
    }).catch(()=>{if(active)setError("概念载入失败，请关闭后重试");});
    return()=>{active=false;};
  },[id]);
  return <section className="nal-existing-concept-editor" aria-label="编辑已有概念">
    <header><h4>编辑已有概念</h4><button type="button" disabled={busy || disabled} onClick={onClose}>取消编辑</button></header>
    {error && <p role="alert">{error}</p>}
    {!concept ? !error && <p>正在载入概念…</p> : <form className="nal-form" onSubmit={event=>{
      event.preventDefault();
      if(lock.current || disabled)return;
      lock.current=true;setBusy(true);onBusy?.(true);setError("");
      void (async()=>{
        try {
          const name=assertAvailableConceptName(label,controller.state.concepts,concept);
          const saved=await getResearchKnowledgeGateway().saveConcept({
            id:concept.id,expectedRevision:concept.revision,preferredTerm:concept.preferredTerm.text,
            language:concept.preferredTerm.language,label:name,explanation,
            disambiguation:concept.disambiguation,domain:concept.domain,tradition:concept.tradition,period:concept.period,
          });
          setConcept(saved);setLabel(saved.label);
          if(await controller.refresh()){notify.success("概念已保存");onClose();}
        } catch(reason) {setError(researchKnowledgeErrorMessage(reason));}
        finally {lock.current=false;setBusy(false);onBusy?.(false);}
      })();
    }}>
      <label>已有概念名称<input aria-label="已有概念名称" required maxLength={500} disabled={busy || disabled} value={label} onChange={event=>setLabel(event.target.value)}/></label>
      <label>已有概念解释（选填）<textarea aria-label="已有概念解释" disabled={busy || disabled} value={explanation} onChange={event=>setExplanation(event.target.value)}/></label>
      <button type="submit" disabled={busy || disabled || !label.trim()}>保存已有概念</button>
    </form>}
  </section>;
}
