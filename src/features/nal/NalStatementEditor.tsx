import { useEffect, useState } from "react";
import { nalAtoms } from "@research-assistant/core/nal";
import { NalDialog } from "./NalDialog";
import { NalQueryEditorContent } from "./NalQueryEditorContent";
import { NalStatements, type NalAnnotationTarget } from "./NalStatements";
import { factsFromDraft, newFactDraft, SELECTED_PAPER_VARIABLE } from "./nalStatementDraft";
import { useNalQueryDraft } from "./useNalQueryDraft";
import type { NalController } from "./useNal";

export function NalStatementEditor({ controller, itemIds, onClose, onAnnotate, embedded = false }: {
  readonly controller: Pick<NalController,"state"|"vocabulary"|"busy"|"ready"|"mutate">; readonly itemIds: readonly string[]; readonly onClose: () => void;
  readonly onAnnotate: (target: NalAnnotationTarget) => void; readonly embedded?: boolean;
}) {
  const [revision, setRevision] = useState(controller.state.revision);
  const draft = useNalQueryDraft({ conditions: [newFactDraft(itemIds)], outputs: undefined });
  useEffect(() => { if (embedded && !draft.canUndo) setRevision(controller.state.revision); }, [embedded, draft.canUndo, controller.state.revision]);
  const stale = revision !== controller.state.revision;
  let facts: ReturnType<typeof factsFromDraft> | undefined;
  let validationError: string | undefined;
  try { facts = factsFromDraft(draft.conditions, itemIds); }
  catch (error) { validationError = error instanceof Error ? error.message : String(error); }
  const related = controller.state.statements.filter(statement => !itemIds.length || [...nalAtoms(statement.subject), ...nalAtoms(statement.predicate)].some(atom => atom.kind === "paper" && itemIds.includes(atom.id)));
  async function save(): Promise<void> {
    if (!facts || stale || controller.busy || !controller.ready) return;
    const statements = facts.map(fact => ({ ...fact, id: crypto.randomUUID(), origin: "human" as const }));
    if (!await controller.mutate({ kind: "add_statements", statements }, revision)) return;
    if (embedded) draft.reset({ conditions: [newFactDraft(itemIds)], outputs: undefined });
    else onClose();
  }
  const content = <>
    {stale && <button type="button" onClick={() => setRevision(controller.state.revision)}>关系已变化，载入当前版本后继续编辑</button>}
    <form className="nal-form nal-query-editor nal-statement-editor" aria-label="Narsese 关系语句编辑器" onSubmit={event => {
      event.preventDefault();
      void save();
    }}>
      {itemIds.length > 1 && <p>“?选中文献”在添加时分别替换为所选的 {itemIds.length} 篇文献；其余词项按编辑结果保留。</p>}
      <NalQueryEditorContent conditions={draft.conditions} onChange={draft.setConditions} state={controller.state} vocabulary={controller.vocabulary}
        outputVariables={undefined} onOutputVariablesChange={draft.setOutputs} history={draft} maxConditions={500}
        disabled={controller.busy || stale || !controller.ready} policy={{ purpose: "statements", ...(itemIds.length > 1 ? { paperBinding: SELECTED_PAPER_VARIABLE } : {}) }} />
      <p role="status">{facts ? `将添加 ${facts.length} 条关系语句` : validationError}</p>
      <button type="submit" disabled={controller.busy || stale || !controller.ready || !facts}>{itemIds.length ? "为选中文献添加关系" : "添加语句"}</button>
    </form>
    <NalStatements controller={controller} statements={related} onAnnotate={target => { onClose(); onAnnotate(target); }} />
  </>;
  return embedded ? <section aria-label="关系语句">{content}</section> : <NalDialog title={itemIds.length ? `文献关系 · ${itemIds.length} 篇` : "关系语句"} busy={controller.busy} onClose={onClose}>{content}</NalDialog>;
}
