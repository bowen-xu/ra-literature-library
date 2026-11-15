import { describe, expect, it } from "vitest";
import type { NalPattern, NalQuery } from "@research-assistant/core/nal";
import { factsFromDraft, newFactDraft, SELECTED_PAPER_VARIABLE } from "./nalStatementDraft";
const concept = (id:string) => ({kind:"concept" as const,id});
const paper = (id:string) => ({kind:"paper" as const,id});
const selected = {kind:"variable" as const,name:SELECTED_PAPER_VARIABLE};
const statement = (subject:NalPattern,predicate:NalPattern=concept("relation")):NalQuery => ({copula:"inheritance",subject,predicate});

describe("shared editor source-fact boundary",()=>{
  it("starts blank in management, preselects one paper and binds multiple papers locally",()=>{
    expect(newFactDraft([]).copula).toBeNull();
    expect(newFactDraft(["a"]).subject).toEqual(paper("a"));
    expect(newFactDraft(["a","b"]).subject).toEqual(selected);
  });
  it("resolves selected papers recursively in place and preserves product order and constant facts",()=>{
    const draft=[statement({kind:"product",terms:[concept("domain"),{kind:"product",terms:[selected,paper("constant")]}]},selected),statement(concept("x"),concept("y"))];
    const before=JSON.stringify(draft);
    expect(factsFromDraft(draft,["a","b","a"])).toEqual([
      {subject:{kind:"product",terms:[concept("domain"),{kind:"product",terms:[paper("a"),paper("constant")]}]},predicate:paper("a")},
      {subject:{kind:"product",terms:[concept("domain"),{kind:"product",terms:[paper("b"),paper("constant")]}]},predicate:paper("b")},
      {subject:concept("x"),predicate:concept("y")},
    ]);
    expect(JSON.stringify(draft)).toBe(before);
  });
  it("rejects unfinished terms and every query-only structure rather than silently converting them",()=>{
    for(const subject of [{kind:"variable",name:"x"},{kind:"conjunction",terms:[concept("x"),concept("y")]},{kind:"disjunction",terms:[concept("x"),concept("y")]},{kind:"statement",...statement(concept("x"))}] satisfies NalPattern[]){
      expect(()=>factsFromDraft([statement(subject)],["a"])).toThrow();
    }
    expect(()=>factsFromDraft([{...statement(concept("x")),copula:"implication"}],[])).toThrow("仅支持继承");
    expect(()=>factsFromDraft([newFactDraft([])],[])).toThrow("连接符");
    expect(()=>factsFromDraft([statement(concept(""))],[])).toThrow("词项");
    expect(()=>factsFromDraft([statement(selected)],[])).toThrow("重新选择");
    expect(()=>factsFromDraft([{kind:"group",connector:"conjunction",children:[statement(concept("a")),statement(concept("b"))]}],[])).toThrow();
  });
  it("enforces the existing 500-statement mutation limit after binding",()=>{
    const ids=Array.from({length:250},(_,i)=>String(i));
    expect(factsFromDraft([statement(selected),statement(selected)],ids)).toHaveLength(500);
    expect(()=>factsFromDraft([statement(selected),statement(selected)], [...ids,"extra"])).toThrow("500");
  });
});
