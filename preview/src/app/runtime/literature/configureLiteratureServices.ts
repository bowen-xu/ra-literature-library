import type {AppRuntime} from "@research-assistant/workbench-preview/app-runtime";
import {createCollectionGateway, createNalGateway, createNalQueryGateway} from "../../../../../src/public/runtimeAdapters.ts";
import {tauriLiteratureGateway} from "./tauriLiteratureGateway";
import {tauriKnowledgeGateway, tauriEvidenceGateway, tauriEvidenceMatrixGateway, tauriDerivedViewGateway, tauriReferenceRecordGateway} from "./tauriResearchGateways";
import {tauriCollectionGateway, tauriNalGateway, tauriNalQueryGateway} from "./tauriCollectionNalGateways";

/** Existing full mocks retain their supplied authorities. Native Agent preview
 * receives none of these domain capabilities implicitly. */
export function configureLiteratureServices(runtime: AppRuntime): void {
  if (runtime.mode !== "desktop") return;
  const selected = runtime.gateways;
  selected.getLiteratureGateway ??= tauriLiteratureGateway;
  selected.getCollectionGateway ??= createCollectionGateway(tauriCollectionGateway);
  selected.getNalGateway ??= createNalGateway(tauriNalGateway);
  selected.getNalQueryGateway ??= createNalQueryGateway(tauriNalQueryGateway);
  selected.getResearchKnowledgeGateway ??= tauriKnowledgeGateway;
  selected.getEvidenceGateway ??= tauriEvidenceGateway;
  selected.getEvidenceMatrixGateway ??= tauriEvidenceMatrixGateway;
  selected.getDerivedResearchViewGateway ??= tauriDerivedViewGateway;
  selected.getReferenceRecordGateway ??= tauriReferenceRecordGateway;
}
