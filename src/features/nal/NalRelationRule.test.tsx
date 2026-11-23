/** @vitest-environment happy-dom */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { emptyNalState } from "@research-assistant/core/nal";
import { NalRelationRule } from "./NalRelationRule";

it("shows only saved rules and preserves the saved state when add or delete fails",async()=>{
  (globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
  const host=document.createElement("div");document.body.append(host);const root=createRoot(host);
  const mutate=vi.fn(async()=>false),state={...emptyNalState(),revision:7};
  const controller={state,mutate,ready:true,busy:false,vocabulary:[{atom:{kind:"concept" as const,id:"r"},label:"所属领域"}]};
  try{
    await act(async()=>root.render(<NalRelationRule controller={controller} conceptId="r"/>));
    expect(host.querySelector("code")).toBeNull();
    expect(host.querySelector("input")).toBeNull();
    await act(async()=>host.querySelector("button")?.click());
    expect(mutate).toHaveBeenLastCalledWith({kind:"set_transitivity",relationConceptId:"r",enabled:true},7);
    expect(host.querySelector("code")).toBeNull();
    const saved={...controller,state:{...state,revision:8,rules:[{id:"transitive:r",kind:"transitive" as const,relationConceptId:"r"}]}};
    await act(async()=>root.render(<NalRelationRule controller={saved} conceptId="r"/>));
    expect(host.querySelector("code")?.textContent).toContain("($y × $z) → 所属领域");
    expect(host.querySelector("button")?.getAttribute("aria-label")).toBe("删除传递规则");
    await act(async()=>host.querySelector("button")?.click());
    expect(mutate).toHaveBeenLastCalledWith({kind:"set_transitivity",relationConceptId:"r",enabled:false},8);
    expect(host.querySelector("code")).not.toBeNull();
    await act(async()=>root.render(<NalRelationRule controller={{...saved,busy:true}} conceptId="r"/>));
    expect(host.querySelector<HTMLButtonElement>("button")?.disabled).toBe(true);
  }finally{await act(async()=>root.unmount());host.remove();}
});
