// @vitest-environment happy-dom
import { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import type { LiteratureGateway } from "../../services/literatureGateway";
import { panelItem } from "../ai/paperOverviewTestFixtures";
import { PaperReadingReader } from "./PaperReadingReader";

const lifetime=vi.hoisted(()=>({mount:vi.fn(),unmount:vi.fn(),render:vi.fn()}));
vi.mock("../../components/PdfReader",()=>({PdfReader:({readingPanel}:{readingPanel:ReactNode})=><div>{readingPanel}</div>}));
vi.mock("../ai/PaperOverviewPanel",()=>({PaperOverviewPanel:()=>{
  lifetime.render();useEffect(()=>{lifetime.mount();return()=>{lifetime.unmount();};},[]);
  return <input aria-label="retained reading draft" defaultValue="unfinished"/>;
}}));

it("retains the reading rail, draft and data owner across PDF activation changes",async()=>{
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true);
  const host=document.createElement("div"),root=createRoot(host);document.body.append(host);
  const item=panelItem(),attachment=item.attachments[0]!;
  const gateway={} as LiteratureGateway;
  const render=(active:boolean)=>act(async()=>root.render(<PaperReadingReader item={item} attachment={attachment} gateway={gateway}
    active={active} onOpenAttachment={()=>undefined} onPaperReviewChanged={async()=>undefined}/>));
  try {
    await render(true);const input=host.querySelector("input")!;input.value="unsaved field";
    await render(false);await render(true);await render(false);await render(true);
    expect(host.querySelector("input")).toBe(input);expect(input.value).toBe("unsaved field");
    expect(lifetime.render).toHaveBeenCalledTimes(1);expect(lifetime.mount).toHaveBeenCalledTimes(1);
    expect(lifetime.unmount).not.toHaveBeenCalled();
  } finally {await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();vi.clearAllMocks();}
});
