import { useEffect, useRef, useState, type FormEvent } from "react";
import { assertAvailableConceptName, type Concept } from "@research-assistant/core/knowledge";
import type { NalConceptKind } from "@research-assistant/core/nal";
import { getResearchKnowledgeGateway, researchKnowledgeErrorMessage } from "../../services/knowledgeGateway";
import { notify } from "@research-assistant/workbench-sdk/feedback";
import { getNalGateway } from "../../services/nalGateway";
import { NalDialog } from "./NalDialog";
import { NalExistingConceptEditor } from "./NalExistingConceptEditor";
import { ConceptName } from "../knowledge/ConceptName";
import type { NalController } from "./useNal";

interface NalConceptEditorProps {
  readonly embedded?: boolean;
  readonly onBusy?: (busy: boolean) => void;
  readonly controller: Pick<NalController, "refresh"|"state">;
  readonly onCreated: (id: string) => void;
  readonly onClose: () => void;
}

export function NalConceptEditor({ controller, onCreated, onClose, embedded=false, onBusy }: NalConceptEditorProps) {
  const [label, setLabel] = useState("");
  const [explanation, setExplanation] = useState("");
  const [conceptKind,setConceptKind]=useState<NalConceptKind>("ordinary");
  const [saved, setSaved] = useState<Concept>();
  const [busy, setBusy] = useState(false);
  const [editingExisting,setEditingExisting]=useState<string>();
  const [existingBusy,setExistingBusy]=useState(false);
  const [completed,setCompleted]=useState(false);
  const conflicts=controller.state.concepts.filter(concept=>concept.label.trim() === label.trim());
  const locked = useRef(false);
  const classified=useRef(false);
  const nameInput=useRef<HTMLInputElement>(null);
  useEffect(()=>{nameInput.current?.focus();},[]);
  useEffect(()=>{onBusy?.(busy || existingBusy);},[busy,existingBusy,onBusy]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (locked.current || completed || existingBusy || !label.trim()) return;
    locked.current = true;
    setBusy(true);
    try {
      if (!saved) assertAvailableConceptName(label,controller.state.concepts);
      const concept = saved ?? await getResearchKnowledgeGateway().saveConcept({
        preferredTerm: label.trim(), label: label.trim(), explanation: explanation.trim(),
        disambiguation: "", domain: "", tradition: "", period: "",
      });
      setSaved(concept);
      if (!classified.current) {
        const gateway=getNalGateway(),current=await gateway.read();
        await gateway.mutate({kind:"set_concept_kind",conceptId:concept.id,conceptKind},current.revision);
        classified.current=true;
      }
      if (await controller.refresh()) {
        notify.success("概念已创建");
        if(editingExisting)setCompleted(true);
        else onCreated(concept.id);
      }
    } catch (error) {
      notify.error(researchKnowledgeErrorMessage(error));
      await controller.refresh();
    } finally {
      locked.current = false;
      setBusy(false);
    }
  };

  const content=<>
    {embedded && <header className="nal-embedded-editor-heading"><h4>新增概念</h4><button type="button" disabled={busy || existingBusy} onClick={onClose}>取消新增</button></header>}
    <div className="nal-concept-editors"><section aria-label="新概念草稿">
    <form className="nal-form" onSubmit={event => void submit(event)}>
      <label>概念类型<select aria-label="概念类型" disabled={busy || Boolean(saved)} value={conceptKind} onChange={event=>setConceptKind(event.target.value as NalConceptKind)}><option value="ordinary">普通概念</option><option value="relation">关系概念</option></select></label>
      <label>名称<input aria-label="名称" ref={nameInput} required maxLength={500} disabled={busy || Boolean(saved)} value={label} onChange={event => setLabel(event.target.value)} placeholder="例如：感知`AI、感知`心理学"/></label>
      <label>解释（选填）<textarea aria-label="解释" disabled={busy || Boolean(saved)} value={explanation} onChange={event => setExplanation(event.target.value)} placeholder="说明概念含义；作为关系使用时，说明各参数的顺序与含义。"/></label>
      <p>{conceptKind === "relation" ? "关系概念描述对象之间的关系，例如所属领域、研究发展。请在解释中说明参数顺序。" : "普通概念描述领域、方法等对象，例如 AI领域、active inference 方法。"}完整名称不能重复。不同语境可写为 感知`AI、感知`心理学。</p>
      {!saved && conflicts.length>0 && <section className="nal-name-conflict" aria-label="概念名称冲突"><p role="alert">概念名称已存在，请修改名称或添加 `语境。</p>{conflicts.map(concept=><div key={concept.id}><strong><ConceptName label={concept.label}/></strong><p>{concept.explanation}</p><button type="button" disabled={busy || existingBusy} onClick={()=>setEditingExisting(concept.id)}>编辑已有概念</button></div>)}</section>}
      {saved && <p role="status">{completed ? "新概念已保存；已有概念的草稿仍保留，请继续保存或取消其编辑。" : `${classified.current ? "概念已保存，正在等待列表载入。" : "概念已保存，类型设置尚未完成。"}重试会使用同一概念。`}</p>}
      <button type="submit" disabled={busy || completed || existingBusy || (!saved && conflicts.length>0) || !label.trim()}>{completed ? "新概念已保存" : saved ? "重新载入概念" : "创建概念"}</button>
    </form>
    </section>{editingExisting && <NalExistingConceptEditor key={editingExisting} id={editingExisting} controller={controller} disabled={busy} onBusy={setExistingBusy} onClose={()=>{setEditingExisting(undefined);if(completed && saved)onCreated(saved.id);}}/>}</div>
  </>;
  return embedded ? <section aria-label="新增概念" className={editingExisting ? "nal-concept-comparison-dialog" : ""}>{content}</section> : <NalDialog title="新增概念" busy={busy || existingBusy} className={editingExisting ? "nal-concept-comparison-dialog" : ""} onClose={onClose}>{content}</NalDialog>;
}
