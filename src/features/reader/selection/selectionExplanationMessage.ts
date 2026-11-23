import type { AttachmentSummary, LiteratureItem } from "@research-assistant/core/literature";
import type { PdfPendingSelection } from "../../knowledge/PdfSelectionActions";
import { selectionDoclingContext, type SelectionDoclingContext } from "./selectionDoclingContext";
import type { DoclingParserGateway } from "@research-assistant/workbench-sdk/docling";
import type { ReaderSessionController } from "../session/ReaderSessionController";
import { PromptTemplate, type AgentEvidenceInput } from "@research-assistant/core/agent";
import explanationPrompt from "./prompts/selection-explanation.md?raw";
import { formatSourceLink } from "@research-assistant/core/source";

const explanationTemplate = PromptTemplate.parse(explanationPrompt.trimEnd());

const unavailableReasons = { notParsed: "当前 PDF 版本没有可用的 Docling 解析，请先解析 PDF。", noMatchingBlocks: "没有与选区位置匹配的 Docling 解析块。", budget: "匹配数据超过本轮范围限制，请缩小选区。", readFailed: "Docling 数据读取或来源校验失败，请重试。" };

export async function prepareSelectionExplanationMessage(item: Pick<LiteratureItem, "id" | "title">, attachment: Pick<AttachmentSummary, "id" | "displayName" | "contentSha256">, selection: PdfPendingSelection,
  gateway: Pick<DoclingParserGateway, "listParseRuns" | "getParseRun" | "getPageOverlay">, controller: Pick<ReaderSessionController, "resolveQuoteSelection">): Promise<string> {
  const {positioned, docling} = await prepareSelection(item, attachment, selection, gateway, controller);
  return selectionExplanationMessage(item, attachment, positioned, docling);
}
export async function prepareSelectionExplanationInput(item: Pick<LiteratureItem, "id" | "title">, attachment: Pick<AttachmentSummary, "id" | "displayName" | "contentSha256">, selection: PdfPendingSelection,
  gateway: Pick<DoclingParserGateway, "listParseRuns" | "getParseRun" | "getPageOverlay">, controller: Pick<ReaderSessionController, "resolveQuoteSelection">): Promise<{text: string; evidence: readonly AgentEvidenceInput[]}> {
  const {positioned} = await prepareSelection(item, attachment, selection, gateway, controller);
  return {text: "请查阅相关上下文和术语定义，用中文解释这些选段。", evidence: positioned.segments.map(segment => ({
    type: "annotation", comment: "", title: `${item.title} · ${attachment.displayName} · 第 ${segment.pageIndex + 1} 页`, text: segment.text,
    source: formatSourceLink({path: ["library", item.id, attachment.id], locator: {kind: "line", pageNumber: segment.pageIndex + 1, range: segment.location}}),
  }))};
}
async function prepareSelection(item: Pick<LiteratureItem, "id" | "title">, attachment: Pick<AttachmentSummary, "id" | "displayName" | "contentSha256">, selection: PdfPendingSelection,
  gateway: Pick<DoclingParserGateway, "listParseRuns" | "getParseRun" | "getPageOverlay">, controller: Pick<ReaderSessionController, "resolveQuoteSelection">) {
  const segments = await Promise.all(selection.segments.map(async segment => {
    const location = segment.location ?? (await controller.resolveQuoteSelection(segment.pageIndex, segment.text, segment.prefix, segment.suffix))?.segments[0]?.location;
    if (!location) throw new Error("无法确定选区的起止行列，请重新选择 PDF 原文后重试。");
    return { ...segment, location };
  }));
  const positioned = { ...selection, segments };
  const docling = await selectionDoclingContext(gateway, item, attachment, positioned);
  if (docling.state !== "available") throw new Error(unavailableReasons[docling.reason]);
  return {positioned, docling};
}

/** Freeze exact selected text and source identity without creating a reading note. */
export function selectionExplanationMessage(item: Pick<LiteratureItem, "id" | "title">, attachment: Pick<AttachmentSummary, "id" | "displayName" | "contentSha256">, selection: PdfPendingSelection,
  docling: SelectionDoclingContext = { state: "unavailable", reason: "notParsed" }): string {
  const locations = selection.segments.map(segment => {
    const position = segment.location;
    const citation = position ? formatSourceLink({ path: ["library", item.id, attachment.id], locator: { kind: "line", pageNumber: segment.pageIndex + 1, range: position } }) : undefined;
    return `第 ${segment.pageIndex + 1} 页（印刷 ${segment.pageLabel}）：${position ? `${position.startLine}:${position.startColumn}–${position.endLine}:${position.endColumn}` : "行列未知"}${citation ? `\n来源链接：${citation}` : ""}`;
  }).join("\n");
  const source = `文件：${attachment.displayName}\n文件 ID：${attachment.id}`;
  const refs = docling.state === "available" ? docling.blocks.map(block => block.ref).join("、") : "未提供";
  return explanationTemplate.render([
    ["title", item.title], ["source", `文献 ID：${item.id}\n${source}`], ["locations", locations],
    ["selection", selection.text], ["refs", refs],
  ]);
}
