import type { NalQueryBlock, NalState, NalVocabulary } from "@research-assistant/core/nal";
import { NalQueryBuilder } from "./NalQueryBuilder";
import { NalQueryOutputs } from "./NalQueryOutputs";
import { Undo2, Redo2 } from "lucide-react";
import { useRef, type KeyboardEvent } from "react";
import { ControlHint } from "@research-assistant/workbench-sdk/overlay";
import type { NalQueryDraftUndo } from "./useNalQueryDraft";
import { NalEditorPolicyContext, type NalEditorPolicy } from "./NalEditorPolicy";

/** Shared editing surface for ad-hoc queries, saved queries and the isolated demo. */
export function NalQueryEditorContent({ conditions, onChange, state, vocabulary, outputVariables,
  onOutputVariablesChange, history, outputConditions = conditions, disabled = false, maxConditions = 16, policy = { purpose: "query" } }: {
  readonly conditions: readonly NalQueryBlock[];
  readonly onChange: (value: readonly NalQueryBlock[]) => void;
  readonly state: NalState;
  readonly vocabulary: readonly NalVocabulary[];
  readonly outputVariables: readonly string[] | undefined;
  readonly onOutputVariablesChange: (value: readonly string[] | undefined) => void;
  readonly outputConditions?: readonly NalQueryBlock[];
  readonly disabled?: boolean;
  readonly maxConditions?: number;
  readonly history: NalQueryDraftUndo;
  readonly policy?: NalEditorPolicy;
}): React.JSX.Element {
  const root = useRef<HTMLDivElement>(null);
  function restore(kind: "undo" | "redo"): void {
    // An undo can remove the focused block. Keep the next shortcut in this editor.
    root.current?.focus({ preventScroll: true });
    history[kind]();
  }
  function historyKey(event: KeyboardEvent<HTMLDivElement>): void {
    if (disabled || event.nativeEvent.isComposing || event.altKey || !(event.metaKey || event.ctrlKey)) return;
    // Menu text inputs retain their native undo stacks.
    if (event.target instanceof Element && event.target.closest('input,textarea,select,[contenteditable="true"],[role="menu"]')) return;
    const key = event.key.toLowerCase();
    if (key !== "z" && !(key === "y" && event.ctrlKey && !event.metaKey)) return;
    event.preventDefault(); event.stopPropagation();
    restore(key === "y" || event.shiftKey ? "redo" : "undo");
  }
  return <NalEditorPolicyContext.Provider value={policy}><div ref={root} className="nal-query-panel-content" tabIndex={-1} onKeyDownCapture={historyKey}>
    <div className="nal-query-history" role="group" aria-label="语句编辑历史">
      <ControlHint content="撤销语句编辑"><button type="button" aria-label="撤销语句编辑" disabled={disabled || !history.canUndo} onClick={() => restore("undo")}><Undo2 size={15} /></button></ControlHint>
      <ControlHint content="重做语句编辑"><button type="button" aria-label="重做语句编辑" disabled={disabled || !history.canRedo} onClick={() => restore("redo")}><Redo2 size={15} /></button></ControlHint>
    </div>
    <NalQueryBuilder conditions={conditions} onChange={onChange} state={state} vocabulary={vocabulary}
      disabled={disabled} maxConditions={maxConditions} />
    {policy.purpose === "query" && <NalQueryOutputs conditions={outputConditions} value={outputVariables} onChange={onOutputVariablesChange} disabled={disabled} />}
  </div></NalEditorPolicyContext.Provider>;
}
