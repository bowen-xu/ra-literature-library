import type {AppRuntime} from "@research-assistant/workbench-preview/app-runtime";
import type {LiteratureItem} from "@research-assistant/core/literature";
import {getAiAssistanceTransport} from "@research-assistant/workbench-preview/ai-assistance-gateway";
import {getDoclingGateway} from "@research-assistant/workbench-preview/docling-gateway";
import {getLiteratureGateway} from "../../../../../src/public/literatureGateway.ts";
import {createPreparedPaperGenerationGateway} from "../../../../../src/public/paperPreparation.ts";
import {configureLiteratureServices} from "./configureLiteratureServices";
import {configureResearchExport} from "./electronResearchExportGateway";

export function configureLiteratureWorkbench(runtime: AppRuntime): void {
  if (runtime.mode === "preview" && !runtime.nativeAgentPreview) return;
  configureResearchExport(runtime);
  const needsLiterature = runtime.mode !== "preview" && !runtime.gateways.getLiteratureGateway;
  configureLiteratureServices(runtime);
  if (needsLiterature) runtime.gateways.getLiteratureGateway = getLiteratureGateway();
  const literature = runtime.gateways.getLiteratureGateway;
  if (literature) runtime.gateways.doclingAttachmentMetadata ??= {
    async describe(itemId, attachmentId) {
      const item = await literature.get(itemId);
      return {paperTitle: item.title, fileName: item.attachments.find((value: LiteratureItem["attachments"][number]) => value.id === attachmentId)?.displayName ?? "PDF"};
    },
  };
  runtime.gateways.getAiAssistanceGateway ??= createPreparedPaperGenerationGateway(getAiAssistanceTransport(), getDoclingGateway);
}
