import {decodeNalAnnotation, decodeNalQueryDefinitions} from "@research-assistant/core/nal";
import type {NalGateway, NalQueryStore} from "@research-assistant/data/nal";

export function literatureAttachmentBytes(value: ArrayBuffer | Uint8Array | readonly number[]): Uint8Array {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  return Uint8Array.from(value);
}

export function literatureCommandError(reason: unknown): Error {
  if (reason instanceof Error) return reason;
  if (typeof reason === "object" && reason !== null && "message" in reason) {
    const message = (reason as { readonly message?: unknown }).message;
    if (typeof message === "string") return new Error(message);
  }
  return new Error(String(reason));
}

export function collectionCommandError(reason: unknown): Error {
  if (reason instanceof Error) return reason;
  if (reason && typeof reason === "object" && "message" in reason && typeof reason.message === "string") return new Error(reason.message);
  return new Error("分类操作失败，请重试");
}

export function decodeNalQueryStore(value: unknown): NalQueryStore {
  if (!value || typeof value !== "object") throw new Error("查询集合存储格式无效");
  const v = value as NalQueryStore;
  if (!Number.isSafeInteger(v.revision) || v.revision < 0 || typeof v.legacyImported !== "boolean") throw new Error("查询集合存储格式无效");
  return { ...v, definitions: decodeNalQueryDefinitions(v.definitions) };
}

export function validateNalAnnotationRequest(request: Parameters<NalGateway["ensureAnnotation"]>[0]): void {
  if(!["concept","statement"].includes(request.targetKind) || !request.targetId.trim() || !request.title.trim() || request.title.length>300)throw new Error("笔记目标或标题无效");
}
export function decodeNalAnnotationResponse(value: unknown, request: Parameters<NalGateway["ensureAnnotation"]>[0]) {
  const annotation=decodeNalAnnotation(value);
  if(annotation.targetKind !== request.targetKind || annotation.targetId !== request.targetId)throw new Error("返回的笔记目标不一致，请刷新后重试");
  return annotation;
}
