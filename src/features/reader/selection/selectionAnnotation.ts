import { decodeAgentEvidenceInput, type AgentEvidenceInput } from "@research-assistant/core/agent";
import { formatSourceLink } from "@research-assistant/core/source";
import type { SourceRect } from "@research-assistant/core/literature";
import type { PdfPendingSelection } from "../../knowledge/PdfSelectionActions";
import type { ReaderSessionController } from "../session/ReaderSessionController";
import { captureEvidenceImage } from "@research-assistant/workbench-sdk/agent-ui";

export async function selectionAnnotation(paperId: string, fileId: string, title: string, selection: PdfPendingSelection, controller: Pick<ReaderSessionController, "renderPageRegionPng">): Promise<readonly AgentEvidenceInput[]> {
  const segments = selection.segments.length ? selection.segments : [{pageIndex:selection.pageIndex,rects:[selection.popupRect],text:selection.text,location:undefined}];
  return Promise.all(segments.map(async segment => {
    if (selection.text.trim() || segment.text.trim()) {
      return decodeAgentEvidenceInput({type: "annotation", title: `${title} · 第 ${segment.pageIndex + 1} 页`,
        source: formatSourceLink({path: ["library", paperId, fileId], ...(segment.location ? {locator: {kind: "line" as const, pageNumber: segment.pageIndex + 1, range: segment.location}} : {})}),
        text: segment.text, comment: ""});
    }
    const rects = segment.rects.length ? segment.rects : [selection.popupRect];
    const x = Math.min(...rects.map(rect => rect.x)), y = Math.min(...rects.map(rect => rect.y));
    const rect: SourceRect = {x,y,width:Math.max(...rects.map(rect => rect.x + rect.width))-x,height:Math.max(...rects.map(rect => rect.y + rect.height))-y};
    const png = await controller.renderPageRegionPng(segment.pageIndex, rect);
    if (!png.startsWith("data:image/png;base64,") || png.length > 700000) throw new Error("选区图片超过 512 KiB，请缩小选区。");
    const bytes = Array.from(atob(png.slice(22)), character => character.charCodeAt(0));
    const image=await captureEvidenceImage(bytes,"image/png",title);
    return decodeAgentEvidenceInput({type:"annotation",title:`${title} · 第 ${segment.pageIndex+1} 页`,
      source:formatSourceLink({path:["library",paperId,fileId],...(segment.location ? {locator:{kind:"line" as const,pageNumber:segment.pageIndex+1,range:segment.location}} : {})}),
      text: JSON.stringify({pageNumber:segment.pageIndex+1,rect,selectedText:segment.text}),displayText:segment.text || `PDF 第 ${segment.pageIndex+1} 页区域截图`,comment:"",image});
  }));
}
