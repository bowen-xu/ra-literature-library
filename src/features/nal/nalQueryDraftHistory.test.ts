import { describe, expect, it } from "vitest";
import type { NalQueryBlock } from "@research-assistant/core/nal";
import { newStatementDraft } from "./nalQueryBuilderModel";
import { createNalQueryDraftHistory, reduceNalQueryDraftHistory as reduce } from "./nalQueryDraftHistory";

const initial = { conditions: [newStatementDraft()], outputs: undefined };
const completed: readonly NalQueryBlock[] = [{ copula: "inheritance", subject: { kind: "variable", name: "x" }, predicate: { kind: "concept", id: "ai" } }];

describe("local query draft history", () => {
  it("restores the exact AST and automatic output mode through the complete undo/redo chain", () => {
    const start = createNalQueryDraftHistory(initial);
    const structure = reduce(start, { kind: "conditions", value: completed });
    const projection = reduce(structure, { kind: "outputs", value: [] });
    const undoProjection = reduce(projection, { kind: "undo" });
    expect(undoProjection.present).toEqual({ conditions: completed, outputs: undefined });
    const undoStructure = reduce(undoProjection, { kind: "undo" });
    expect(undoStructure.present).toEqual(initial);
    expect(reduce(undoStructure, { kind: "undo" })).toBe(undoStructure);
    expect(reduce(reduce(undoStructure, { kind: "redo" }), { kind: "redo" }).present).toEqual(projection.present);
  });

  it("discards only the redo branch when editing after undo", () => {
    let history = reduce(createNalQueryDraftHistory(initial), { kind: "conditions", value: completed });
    history = reduce(history, { kind: "outputs", value: [] });
    history = reduce(history, { kind: "undo" });
    history = reduce(history, { kind: "conditions", value: [{ kind: "group", connector: "conjunction", children: completed }] });
    expect(history.future).toEqual([]);
    expect(reduce(history, { kind: "redo" })).toBe(history);
    expect(reduce(history, { kind: "undo" }).present.conditions).toEqual(completed);
  });

  it("does not lose redo for a semantic no-op and clears history on a new query", () => {
    let history = reduce(createNalQueryDraftHistory(initial), { kind: "conditions", value: completed });
    history = reduce(history, { kind: "undo" });
    expect(reduce(history, { kind: "conditions", value: structuredClone(initial.conditions) })).toBe(history);
    const reset = reduce(history, { kind: "reset", value: { conditions: completed, outputs: ["x"] } });
    expect(reset).toEqual({ past: [], present: { conditions: completed, outputs: ["x"] }, future: [] });
  });

  it("keeps nested groups and compound term order as one committed operation", () => {
    const block: NalQueryBlock = { kind: "group", connector: "disjunction", children: [
      { copula: "implication", subject: { kind: "product", terms: [{ kind: "variable", name: "b" }, { kind: "variable", name: "a" }] }, predicate: { kind: "variable", name: "c" } },
    ] };
    const history = reduce(createNalQueryDraftHistory(initial), { kind: "conditions", value: [block] });
    expect(history.past).toHaveLength(1);
    expect(reduce(reduce(history, { kind: "undo" }), { kind: "redo" }).present.conditions).toEqual([block]);
  });
});

it("pads old one-child nested groups on opening without mutating their stored AST or recording an edit",()=>{
  const conditions:readonly NalQueryBlock[]=[{kind:"group",connector:"disjunction",children:[
    {kind:"group",connector:"conjunction",children:completed},
  ]}];
  const before=JSON.stringify(conditions);
  const history=createNalQueryDraftHistory({conditions,outputs:undefined});
  expect(history.past).toEqual([]);
  expect(history.present.conditions).toEqual([{kind:"group",connector:"disjunction",children:[
    {kind:"group",connector:"conjunction",children:[...completed,newStatementDraft()]},newStatementDraft(),
  ]}]);
  expect(JSON.stringify(conditions)).toBe(before);
});
