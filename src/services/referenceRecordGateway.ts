import {resolveReferenceRecordRuntimeGateway} from "@research-assistant/workbench-sdk/literature-runtime";
import {runtimeReferenceRecordGateway} from "./configureLiteratureServices";
import type { ReferenceRecordGateway } from "../public/contracts/referenceRecordGateway";
export type { ReferenceRecordGateway } from "../public/contracts/referenceRecordGateway";
import { getAppStorage } from "@research-assistant/workbench-sdk/storage";
import type {
  ReferenceRecord,
  ReferenceRecordDraft,
} from "@research-assistant/core/synthesis";

import {
  decodeReferenceRecords,
} from "./referenceRecordDecoders";

const BROWSER_STORAGE_KEY = "research-assistant.reference-records.v1";

function readBrowserRecords(): readonly ReferenceRecord[] {
  const raw = getAppStorage().getItem(BROWSER_STORAGE_KEY);
  if (raw === null) return [];
  try {
    return decodeReferenceRecords(JSON.parse(raw)) ?? [];
  } catch {
    return [];
  }
}

function writeBrowserRecords(records: readonly ReferenceRecord[]): void {
  getAppStorage().setItem(BROWSER_STORAGE_KEY, JSON.stringify(records));
}

function saveBrowserRecord(draft: ReferenceRecordDraft): ReferenceRecord {
  const identityValid = (draft.identityState === "matched_existing")
    === (draft.matchedItemId !== undefined);
  const semanticValid = draft.semanticState === "reviewed"
    ? draft.usageKind !== undefined
      && draft.usageAnchorId !== undefined
      && draft.usageSummary.trim() !== ""
    : draft.usageKind === undefined
      && draft.usageAnchorId === undefined
      && draft.usageSummary === "";
  if (
    draft.rawText.trim() === ""
    || !identityValid
    || !semanticValid
    || draft.fields.some((field) => field.sourceKind === "ai_inference" && field.confirmedByUser)
  ) {
    throw new Error("参考条目字段或状态组合无效");
  }
  const records = readBrowserRecords();
  const existing = draft.id === undefined
    ? undefined
    : records.find((record) => record.id === draft.id);
  if (draft.id !== undefined && existing === undefined) throw new Error("找不到参考条目");
  if (existing === undefined && draft.expectedRevision !== undefined) {
    throw new Error("新参考条目不能携带预期版本");
  }
  if (existing !== undefined && existing.revision !== draft.expectedRevision) {
    throw new Error(`参考条目版本冲突；当前版本为 v${existing.revision}`);
  }
  const now = new Date().toISOString();
  const next: ReferenceRecord = {
    id: existing?.id ?? crypto.randomUUID(),
    citingPaperId: draft.citingPaperId,
    sourceAnchorId: draft.sourceAnchorId,
    rawText: draft.rawText.trim(),
    fields: draft.fields,
    parseState: draft.parseState,
    identityState: draft.identityState,
    ...(draft.matchedItemId === undefined ? {} : { matchedItemId: draft.matchedItemId }),
    semanticState: draft.semanticState,
    ...(draft.usageKind === undefined ? {} : { usageKind: draft.usageKind }),
    usageSummary: draft.usageSummary.trim(),
    ...(draft.usageAnchorId === undefined ? {} : { usageAnchorId: draft.usageAnchorId }),
    provenanceKind: existing?.provenanceKind ?? "human_original",
    revision: (existing?.revision ?? 0) + 1,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  writeBrowserRecords([next, ...records.filter((record) => record.id !== next.id)]);
  return next;
}

const browserGateway: ReferenceRecordGateway = {
  async list(paperId) {
    return readBrowserRecords().filter((record) => record.citingPaperId === paperId);
  },
  async save(draft) {
    return saveBrowserRecord(draft);
  },
};

export function getReferenceRecordGateway(): ReferenceRecordGateway {
  return runtimeReferenceRecordGateway() ?? resolveReferenceRecordRuntimeGateway(browserGateway);
}
