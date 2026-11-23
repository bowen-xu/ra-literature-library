import { expect, it } from "vitest";
import { emptyNalState, type NalState } from "@research-assistant/core/nal";
import { obsoleteNalConceptIds, nalPreviewDefinition, repairPreviewFieldStatement, retiredNalPreviewConceptIds } from "./nalLegacyCleanup";

const placeholder = {
  id: "legacy-related", label: "related-field", revision: 1,
  explanation: "旧集合关系。反向显示：related-field；有向：false。",
};
const state: NalState = { ...emptyNalState(), concepts: [placeholder] };

it("replaces the generated field inheritance with ordered membership while preserving the statement and annotation identities",()=>{
  const concepts=["深度学习领域","AI领域","所属领域"].map(label=>({id:label,label,explanation:nalPreviewDefinition(label),revision:1}));
  const input:NalState={...emptyNalState(),concepts,statements:[{id:"old-arrow",origin:"human",subject:{kind:"concept",id:"深度学习领域"},predicate:{kind:"concept",id:"AI领域"}}],
    annotations:[{id:"note",targetKind:"statement",targetId:"old-arrow",notePageId:"page"}]};
  const next=repairPreviewFieldStatement(input);
  expect(next.statements).toEqual([{id:"old-arrow",origin:"human",subject:{kind:"product",terms:[{kind:"concept",id:"深度学习领域"},{kind:"concept",id:"AI领域"}]},predicate:{kind:"concept",id:"所属领域"}}]);
  expect(next.annotations).toEqual(input.annotations);
  expect(next.concepts.find(c=>c.id === "所属领域")?.conceptKind).toBe("relation");
  expect(repairPreviewFieldStatement(next)).toBe(next);
  const manual={...input,concepts:concepts.map(c=>({...c,explanation:"用户的其他定义"}))};
  expect(repairPreviewFieldStatement(manual)).toBe(manual);
});

it("identifies only the unused auto-migrated placeholder for deletion", () => {
  expect([...obsoleteNalConceptIds(state)]).toEqual([placeholder.id]);
  expect([...obsoleteNalConceptIds({ ...state, concepts: [{ ...placeholder,
    explanation: "从旧集合关系迁移。反向显示：related-field；有向：false。" }] })]).toEqual([placeholder.id]);
  const custom = { ...placeholder, explanation: "用户定义的相关领域关系" };
  expect([...obsoleteNalConceptIds({ ...state, concepts: [custom] })]).toEqual([]);
  expect(state.concepts).toEqual([placeholder]);
});

it("preserves the concept when referenced by a statement, annotation, or explicit rule", () => {
  expect([...obsoleteNalConceptIds({ ...state, statements: [{ id: "s", origin: "legacy",
    subject: { kind: "product", terms: [{ kind: "paper", id: "paper" }, { kind: "concept", id: placeholder.id }] },
    predicate: { kind: "concept", id: "another-relation" } }] })]).toEqual([]);
  expect([...obsoleteNalConceptIds({ ...state, annotations: [{ id: "a", targetKind: "concept",
    targetId: placeholder.id, notePageId: "note" }] })]).toEqual([]);
  expect([...obsoleteNalConceptIds({ ...state, rules: [{ id: "r", kind: "transitive",
    relationConceptId: placeholder.id }] })]).toEqual([]);
});

it("does not delete distinct user definitions with the same name", () => {
  const first = {id:"a",label:"方法",explanation:"人工定义",revision:1};
  const second = {...first,id:"b"};
  const input = {...state,concepts:[first,first,second]};
  expect([...obsoleteNalConceptIds(input)]).toEqual([]);
  expect(input.concepts).toHaveLength(3);
});

it("deletes duplicate built-in preview definitions, preferring a referenced identity", () => {
  const first = {id:"a",label:"基于方法",explanation:nalPreviewDefinition("基于方法"),revision:1};
  const duplicate = {...first,id:"b"};
  const custom = {...first,id:"c",explanation:"用户自己定义的方法关系"};
  const input = {...state,concepts:[first,duplicate,custom]};
  expect([...obsoleteNalConceptIds(input,true)]).toEqual([duplicate.id]);
  expect([...obsoleteNalConceptIds(input,false)]).toEqual([]);
  expect(input.concepts).toHaveLength(3);
  expect([...obsoleteNalConceptIds({...input,annotations:[{id:"note",targetKind:"concept",targetId:"b",notePageId:"page"}]},true)]).toEqual([first.id]);
});

it("retires the three selected preview migration identities without removing history or same-name user concepts", () => {
  const concepts = [
    {id:"member",label:"原归类",explanation:"旧迁移",revision:1},
    {id:"tag",label:"旧关系标注",explanation:"旧迁移",revision:1},
    {id:"preview",label:"预览研究",explanation:"从原集合迁移。合成文献集合",revision:1},
    {id:"manual",label:"原归类",explanation:"旧迁移",revision:1},
    {id:"other",label:"预览研究",explanation:"其他研究定义",revision:1},
  ];
  const input: NalState = {...emptyNalState(),concepts,annotations:[{id:"a",targetKind:"concept",targetId:"member",notePageId:"note"}]};
  const before = JSON.stringify(input);
  const retired = retiredNalPreviewConceptIds(input,JSON.stringify({membership:"member",assignment:"tag","collection:old":"preview","collection:other":"other"}));
  expect([...retired]).toEqual(["member","tag","preview"]);
  expect([...obsoleteNalConceptIds(input,true,retired)]).toEqual(["member","tag","preview"]);
  expect([...obsoleteNalConceptIds(input,false,retired)]).toEqual([]);
  expect(JSON.stringify(input)).toBe(before);
});

it("ignores absent, malformed or unrelated migration mappings", () => {
  expect([...retiredNalPreviewConceptIds(state,null)]).toEqual([]);
  expect([...retiredNalPreviewConceptIds(state,"bad-json")]).toEqual([]);
  expect([...retiredNalPreviewConceptIds(state,"[]")]).toEqual([]);
  expect([...retiredNalPreviewConceptIds(state,JSON.stringify({membership:placeholder.id,assignment:5}))]).toEqual([]);
});
