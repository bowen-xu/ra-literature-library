import type {AppRuntime} from "@research-assistant/workbench-preview/app-runtime";
import {invoke} from "@research-assistant/workbench-preview/platform-core";
import {createResearchExportGateway} from "../../../../../src/public/researchExport.ts";

export const electronResearchExportGateway = createResearchExportGateway({
  exportAll: targetDirectory => invoke("export_research_knowledge", {request: {targetDirectory}}),
  cancel: () => invoke("cancel_research_export"),
});

/** Research export already uses the selected preview transport. Unlike the
 * other literature ports it must keep that existing preview capability. */
export function configureResearchExport(runtime: AppRuntime): void {
  if (runtime.mode !== "browser") runtime.gateways.getResearchExportGateway ??= electronResearchExportGateway;
}
