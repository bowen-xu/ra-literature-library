import type { PaperAiReadingImageAssetDraft } from "@research-assistant/core/ai";

import type { AiAssistanceGateway } from "@research-assistant/workbench-sdk/ai-assistance";
import type { DoclingParserGateway } from "@research-assistant/workbench-sdk/docling";
import type { LiteratureGateway } from "../../services/literatureGateway";
import { preparePaperGenerationSources } from "../../services/paperGenerationPreparation";
import { renderPdfRegionPng } from "../reader/pdf/pdfRegionScreenshot";

type PreparationPhase = "preparing" | "parsing" | "rendering";

interface PaperAnalysisPreparation {
  readonly aiGateway: AiAssistanceGateway;
  readonly attachmentIds: readonly string[];
  readonly doclingGateway: DoclingParserGateway;
  readonly isCanceled: () => boolean;
  readonly literatureGateway: LiteratureGateway;
  readonly paperId: string;
  readonly setPhase: (phase: PreparationPhase) => void;
}

export async function preparePaperAnalysisAssets({
  aiGateway,
  attachmentIds,
  doclingGateway,
  isCanceled,
  literatureGateway,
  paperId,
  setPhase,
}: PaperAnalysisPreparation): Promise<readonly PaperAiReadingImageAssetDraft[] | undefined> {
  const prepared = await preparePaperGenerationSources({aiGateway, attachmentIds, doclingGateway, isCanceled, paperId, setPhase});
  if (!prepared) return;

  setPhase("rendering");
  const imageAssets: PaperAiReadingImageAssetDraft[] = [];
  const attachmentBytes = new Map<string, Uint8Array>();
  for (const request of prepared.imageRequests) {
    if (isCanceled()) return undefined;
    const region = request.regions[0];
    if (region === undefined) {
      throw new Error(`结构化图片块 ${request.contextItemId} 没有可截图区域`);
    }
    let bytes = attachmentBytes.get(request.attachmentId);
    if (bytes === undefined) {
      bytes = await literatureGateway.readAttachment(request.attachmentId);
      attachmentBytes.set(request.attachmentId, bytes);
    }
    imageAssets.push({
      contextItemId: request.contextItemId,
      dataUrl: await renderPdfRegionPng(bytes, region.pageIndex, region.rect),
    });
  }
  return imageAssets;
}
