import {resolveResearchExportRuntimeGateway} from "@research-assistant/workbench-sdk/literature-runtime";
import {hasPlatformCapabilities} from "@research-assistant/workbench-sdk/environment";
import type {ResearchExportGateway} from "../public/contracts/researchExportGateway";
import {ResearchExportGatewayError} from "./researchExportTransport";
import {runtimeResearchExportGateway} from "./configureLiteratureServices";
export {ResearchExportGatewayError, createResearchExportGateway, decodeResearchExportReport} from "./researchExportTransport";
export type {ResearchExportErrorCode, ResearchExportGateway, ResearchExportReport} from "../public/contracts/researchExportGateway";

const browserGateway: ResearchExportGateway = {
  async exportAll() {
    throw new ResearchExportGatewayError("unavailable", "全部研究知识导出只在桌面应用中可用");
  },
  async cancel() { return false; },
};

export function getResearchExportGateway(): ResearchExportGateway {
  if (hasPlatformCapabilities()) {
    const runtime = runtimeResearchExportGateway();
    if (runtime) return runtime;
  }
  return resolveResearchExportRuntimeGateway(browserGateway);
}
