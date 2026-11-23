import type { NalQueryBlock } from "@research-assistant/core/nal";
import { normalizeQueryDraftGroups } from "./nalQueryBuilderModel";

export interface NalQueryDraft {
  readonly conditions: readonly NalQueryBlock[];
  /** undefined retains automatic inclusion of all variables. */
  readonly outputs: readonly string[] | undefined;
}
export interface NalQueryDraftHistory {
  readonly past: readonly NalQueryDraft[];
  readonly present: NalQueryDraft;
  readonly future: readonly NalQueryDraft[];
}
export type NalQueryDraftAction =
  | { readonly kind: "conditions"; readonly value: readonly NalQueryBlock[] }
  | { readonly kind: "outputs"; readonly value: readonly string[] | undefined }
  | { readonly kind: "reset"; readonly value: NalQueryDraft }
  | { readonly kind: "undo" }
  | { readonly kind: "redo" };

export function createNalQueryDraftHistory(present: NalQueryDraft): NalQueryDraftHistory {
  return { past: [], present: {...present,conditions:normalizeQueryDraftGroups(present.conditions)}, future: [] };
}

/** Only confirmed local query edits enter history; persistence has its own owner. */
export function reduceNalQueryDraftHistory(history: NalQueryDraftHistory, action: NalQueryDraftAction): NalQueryDraftHistory {
  if (action.kind === "reset") return createNalQueryDraftHistory(action.value);
  if (action.kind === "undo") {
    const previous = history.past.at(-1);
    return previous ? { past: history.past.slice(0, -1), present: previous, future: [history.present, ...history.future] } : history;
  }
  if (action.kind === "redo") {
    const next = history.future[0];
    return next ? { past: [...history.past, history.present], present: next, future: history.future.slice(1) } : history;
  }
  const present = action.kind === "conditions" ? { ...history.present, conditions: action.value }
    : { ...history.present, outputs: action.value };
  if (JSON.stringify(present) === JSON.stringify(history.present)) return history;
  return { past: [...history.past, history.present].slice(-100), present, future: [] };
}
