import { useReducer } from "react";
import type { NalQueryBlock } from "@research-assistant/core/nal";
import { createNalQueryDraftHistory, reduceNalQueryDraftHistory, type NalQueryDraft } from "./nalQueryDraftHistory";

export interface NalQueryDraftUndo {
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly undo: () => void;
  readonly redo: () => void;
}

export function useNalQueryDraft(initial: NalQueryDraft) {
  const [history, dispatch] = useReducer(reduceNalQueryDraftHistory, initial, createNalQueryDraftHistory);
  return {
    ...history.present,
    setConditions: (value: readonly NalQueryBlock[]) => dispatch({ kind: "conditions", value }),
    setOutputs: (value: readonly string[] | undefined) => dispatch({ kind: "outputs", value }),
    reset: (value: NalQueryDraft) => dispatch({ kind: "reset", value }),
    canUndo: history.past.length > 0, canRedo: history.future.length > 0,
    undo: () => dispatch({ kind: "undo" }), redo: () => dispatch({ kind: "redo" }),
  };
}
