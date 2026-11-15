import { expect,it } from "vitest";
import { describeQueryCondition,newStatementDraft,simpleQueryCondition,validQueryConditions } from "./nalQueryBuilderModel";
import { parseNalConditions,type NalQuery,type NalVocabulary } from "@research-assistant/core/nal";
const vocabulary:readonly NalVocabulary[]=["domain","relation"].map(id=>({atom:{kind:"concept",id},label:id==="domain" ? "AI领域" : "所属领域"}));
it("keeps legacy query identities and parameter directions in directory descriptions",()=>{
  for(const expression of ["(?后续文献 × AI领域) → 所属领域","(AI领域 × ?后续文献) → 所属领域","?后续文献 → AI领域","AI领域 → ?后续文献"]){
    const query=parseNalConditions(expression,vocabulary)[0]!;
    expect(simpleQueryCondition(query)?.variable).toBe("后续文献");
    expect(validQueryConditions([query])).toBe(true);
    expect(describeQueryCondition(query,vocabulary)).toContain("AI领域");
  }
});
it("leaves compound and constant patterns intact for structural editing",()=>{
  const query:NalQuery={subject:{kind:"product",terms:[{kind:"paper",id:"p"},{kind:"concept",id:"domain"},{kind:"variable",name:"method"}]},predicate:{kind:"concept",id:"relation"}};
  expect(simpleQueryCondition(query)).toBeUndefined();expect(validQueryConditions([query])).toBe(true);
  expect(describeQueryCondition(query,vocabulary)).toContain("组合");
});
it("starts with an unset copula and excludes unfinished slots and oversized queries from execution",()=>{
  const draft=newStatementDraft();
  expect(draft.copula).toBeNull();expect(validQueryConditions([draft])).toBe(false);
  expect(validQueryConditions([{...draft,copula:"inheritance"}])).toBe(false);
  const query=parseNalConditions("(?文章 × AI领域) → 所属领域",vocabulary)[0]!;
  expect(validQueryConditions([])).toBe(false);expect(validQueryConditions(Array.from({length:17},()=>query))).toBe(false);
  expect(validQueryConditions([{...query,subject:{kind:"variable",name:" "}}])).toBe(false);
});
