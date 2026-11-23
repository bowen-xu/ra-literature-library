/** @vitest-environment happy-dom */
import { renderToStaticMarkup } from "react-dom/server";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { emptyNalState, type NalQuery, type NalState, type NalVocabulary } from "@research-assistant/core/nal";
import { NalQueryBuilder } from "./NalQueryBuilder";
import { nalPreviewDefinition } from "../../services/nalLegacyCleanup";
import { newStatementDraft } from "./nalQueryBuilderModel";
const condition=(relation:string,reverse=false,variable="x"):NalQuery=>({subject:{kind:"product",terms:reverse ? [{kind:"concept",id:"domain"},{kind:"variable",name:variable}] : [{kind:"variable",name:variable},{kind:"concept",id:"domain"}]},predicate:{kind:"concept",id:relation}});


const concepts=[
  {id:"domain",label:"AI领域",explanation:"自定义",revision:1},
  {id:"relation",label:"所属领域",explanation:nalPreviewDefinition("所属领域"),revision:1,conceptKind:"relation" as const},
];
function render(queries:readonly NalQuery[],state:NalState={...emptyNalState(),concepts}) {
  const vocabulary:readonly NalVocabulary[]=state.concepts.map(c=>({atom:{kind:"concept",id:c.id},label:c.label}));
  const host=document.createElement("div");
  host.innerHTML=renderToStaticMarkup(<NalQueryBuilder conditions={queries} onChange={()=>{}} state={state} vocabulary={vocabulary}/>);
  return host;
}

it("shows each exact query structure, variable identity, direction and incomplete term in its preview",()=>{
  const forward=condition("relation");
  const reverse=condition("relation",true);
  const nested:NalQuery={subject:{kind:"product",terms:[{kind:"variable",name:"article"},{kind:"product",terms:[{kind:"concept",id:"domain"},{kind:"variable",name:"other"}]}]},predicate:{kind:"concept",id:"relation"}};
  const host=render([forward,reverse,newStatementDraft(),nested]);
  expect([...host.querySelectorAll("output")].map(o=>o.textContent)).toEqual([
    "(?x × AI领域) → 所属领域","(AI领域 × ?x) → 所属领域","[选择连接符]","(?article × (AI领域 × ?other)) → 所属领域",
  ]);
  expect(render([forward],{...emptyNalState(),concepts:concepts.map(c=>c.id === "domain" ? {...c,label:"人工智能领域"} : c)}).querySelector("output")?.textContent).toBe("(?x × 人工智能领域) → 所属领域");
});

it("offers all active concepts when the selected term is edited, without changing source identities",async()=>{
  const state:NalState={...emptyNalState(),concepts:[...concepts,
    {id:"old",label:"related-field",explanation:"旧集合关系。反向显示：related-field；有向：false。",revision:1,conceptKind:"relation"},
    {...concepts[1]!,id:"duplicate"},
    {id:"custom",label:"related-field",explanation:"用户定义",revision:1},
  ]};
  const before=JSON.stringify(state);
  (globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
  const host=document.createElement("div");document.body.append(host);const root=createRoot(host);
  const vocabulary=state.concepts.map(c=>({atom:{kind:"concept" as const,id:c.id},label:c.label}));
  try {
    await act(async()=>root.render(<NalQueryBuilder conditions={[condition("relation")]} state={state} vocabulary={vocabulary} onChange={()=>{}}/>));
    expect(host.querySelector("select")).toBeNull();
    await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="条件 1 右槽"]')!.click());
    await act(async()=>document.querySelector<HTMLButtonElement>('[aria-label="条件 1 右槽 atomic"]')!.click());
    await act(async()=>document.querySelector<HTMLButtonElement>('[aria-label="条件 1 右槽 concept"]')!.click());
    const options=[...document.querySelectorAll('[role="menuitemradio"]')];
    expect(options.filter(o=>o.getAttribute("aria-label") === "所属领域")).toHaveLength(2);
    expect(options.filter(o=>o.getAttribute("aria-label") === "related-field")).toHaveLength(2);
    expect(options.filter(o=>o.getAttribute("aria-description") === "关系词项")).toHaveLength(3);
    expect(options.filter(o=>o.getAttribute("aria-label") === "related-field").map(o=>Boolean(o.querySelector(".nal-menu-relation-badge")))).toEqual([true,false]);
    expect(JSON.stringify(state)).toBe(before);
  } finally {await act(async()=>root.unmount());host.remove();}
});
