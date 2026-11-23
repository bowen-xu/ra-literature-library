import { hasPlatformCapabilities } from "@research-assistant/workbench-sdk/environment";
import { open } from "@research-assistant/workbench-sdk/platform";

import type { ResearchExportGateway, ResearchExportReport } from "../../services/researchExportGateway";

export async function exportAllResearchKnowledge(
  gateway: ResearchExportGateway,
): Promise<ResearchExportReport | undefined> {
  if (!hasPlatformCapabilities()) throw new Error("全部研究知识导出只在桌面应用中可用；浏览器预览不会访问本机目录");
  const targetDirectory = await open({
    directory: true,
    multiple: false,
    title: "选择全部研究知识导出目录",
  });
  if (targetDirectory === null) return undefined;
  return gateway.exportAll(targetDirectory);
}
