import type {AppRuntime} from "@research-assistant/workbench-preview/app-runtime";
import {createCollectionGateway, createNalGateway, createNalQueryGateway} from "../../../../../src/public/runtimeAdapters.ts";
import {electronLiteratureGateway} from "./electronLiteratureGateway";
import {electronKnowledgeGateway, electronEvidenceGateway, electronEvidenceMatrixGateway, electronDerivedViewGateway, electronReferenceRecordGateway} from "./electronResearchGateways";
import {electronCollectionGateway, electronNalGateway, electronNalQueryGateway} from "./electronCollectionNalGateways";

/** Existing full mocks retain their supplied authorities. Native Agent preview
 * receives none of these domain capabilities implicitly. */
export function configureLiteratureServices(runtime: AppRuntime): void {
  if (runtime.mode !== "desktop") return;
  const selected = runtime.gateways;
  selected.getLiteratureGateway ??= electronLiteratureGateway;
  selected.getCollectionGateway ??= createCollectionGateway(electronCollectionGateway);
  selected.getNalGateway ??= createNalGateway(electronNalGateway);
  selected.getNalQueryGateway ??= createNalQueryGateway(electronNalQueryGateway);
  selected.getResearchKnowledgeGateway ??= electronKnowledgeGateway;
  selected.getEvidenceGateway ??= electronEvidenceGateway;
  selected.getEvidenceMatrixGateway ??= electronEvidenceMatrixGateway;
  selected.getDerivedResearchViewGateway ??= electronDerivedViewGateway;
  selected.getReferenceRecordGateway ??= electronReferenceRecordGateway;
}
