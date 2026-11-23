import {resolveKnowledgeRuntimeGateway} from "@research-assistant/workbench-sdk/literature-runtime";
import type { ResearchKnowledgeGateway } from "../public/contracts/knowledgeGateway";
export type { ConceptCaptureSourcePreview, ResearchKnowledgeGateway } from "../public/contracts/knowledgeGateway";


import { browserKnowledgeGateway } from "./browserKnowledgeGateway";
import {runtimeKnowledgeGateway, runtimeLiteratureGateway} from "./configureLiteratureServices";

export function researchKnowledgeErrorMessage(reason: unknown): string {
  if (reason instanceof Error) return reason.message;
  if (typeof reason === "object" && reason !== null && !Array.isArray(reason)) {
    const value = reason as { readonly message?: unknown; readonly currentRevision?: unknown };
    if (typeof value.message === "string") {
      return typeof value.currentRevision === "number" && !value.message.includes(String(value.currentRevision))
        ? `${value.message}（当前版本 v${value.currentRevision}）`
        : value.message;
    }
  }
  return String(reason);
}

export function getResearchKnowledgeGateway(): ResearchKnowledgeGateway {
  const runtime = runtimeKnowledgeGateway();
  if (runtime) return runtime;
  try {return resolveKnowledgeRuntimeGateway(browserKnowledgeGateway);}
  catch (reason) {
    if (runtimeLiteratureGateway() === undefined || !(reason instanceof Error)
      || !("code" in reason) || reason.code !== "literature_gateway_unavailable") throw reason;
    // The retained production panel already presents failed async reads. Keep
    // this unconfigured domain unavailable without crashing literature details
    // during render or supplying fabricated knowledge results.
    return new Proxy(browserKnowledgeGateway, {get(target, key) {
      if (typeof key !== "string" || !Object.hasOwn(target, key)) return Reflect.get(target, key);
      return async () => {throw reason;};
    }});
  }
}
