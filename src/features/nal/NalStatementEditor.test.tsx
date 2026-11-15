/** @vitest-environment happy-dom */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { emptyNalState, type NalMutation } from "@research-assistant/core/nal";
import { NalStatementEditor } from "./NalStatementEditor";

it("keeps source drafts and undo on failed save, resets only after success and guards stale revisions",async()=>{
  (globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
  const host=document.createElement("div");document.body.append(host);const root=createRoot(host);
  const mutate=vi.fn(async(_mutation:NalMutation,_revision:number)=>false),close=vi.fn();
  const state={...emptyNalState(),revision:7,concepts:[{id:"a",label:"AI领域",explanation:"",revision:1}]};
  const controller={state,mutate,ready:true,busy:false,vocabulary:[{atom:{kind:"concept" as const,id:"a"},label:"AI领域"},{atom:{kind:"paper" as const,id:"p"},label:"一篇文献"}]};
  const click=async(selector:string)=>{await act(async()=>{const button=document.querySelector<HTMLButtonElement>(selector);if(!button)throw new Error(selector);button.click();});};
  const submit=async()=>{await act(async()=>{host.querySelector("form")?.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true}));});};
  const expression=()=>host.querySelector("output")?.textContent;
  try{
    await act(async()=>root.render(<NalStatementEditor embedded controller={controller} itemIds={["p"]} onClose={close} onAnnotate={()=>{}}/>));
    await click('[aria-label="条件 1 右槽"]');await click('[aria-label="条件 1 右槽 atomic"]');await click('[aria-label="条件 1 右槽 concept"]');await click('[role="menuitemradio"][aria-label="AI领域"]');
    expect(expression()).toBe("{一篇文献} → AI领域");
    await submit();
    expect(mutate).toHaveBeenLastCalledWith({kind:"add_statements",statements:[expect.objectContaining({subject:{kind:"paper",id:"p"},predicate:{kind:"concept",id:"a"},origin:"human"})]},7);
    expect(expression()).toBe("{一篇文献} → AI领域");
    expect(host.querySelector<HTMLButtonElement>('[aria-label="撤销语句编辑"]')?.disabled).toBe(false);
    await act(async()=>root.render(<NalStatementEditor embedded controller={{...controller,state:{...state,revision:8}}} itemIds={["p"]} onClose={close} onAnnotate={()=>{}}/>));
    expect(host.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(true);
    expect(expression()).toBe("{一篇文献} → AI领域");
    await act(async()=>{[...host.querySelectorAll("button")].find(b=>b.textContent==="关系已变化，载入当前版本后继续编辑")?.click();});
    mutate.mockResolvedValue(true);await submit();
    expect(mutate.mock.lastCall?.[1]).toBe(8);
    expect(expression()).toBe("{一篇文献} → [选择词项]");
    expect(host.querySelector<HTMLButtonElement>('[aria-label="撤销语句编辑"]')?.disabled).toBe(true);
    expect(close).not.toHaveBeenCalled();
  }finally{await act(async()=>root.unmount());host.remove();}
});
