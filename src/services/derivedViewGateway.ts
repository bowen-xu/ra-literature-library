import {runtimeDerivedViewGateway} from "./configureLiteratureServices";
import {resolveDerivedViewRuntimeGateway} from "@research-assistant/workbench-sdk/literature-runtime";
import type { DerivedResearchViewGateway } from "../public/contracts/derivedViewGateway";
export type { DerivedResearchViewGateway } from "../public/contracts/derivedViewGateway";
import { getAppStorage } from "@research-assistant/workbench-sdk/storage";
import type {
  DerivedResearchView,
  DerivedResearchViewDraft,
  EvidenceMatrixCell,
} from "@research-assistant/core/synthesis";

import {
  decodeDerivedResearchView,
  decodeDerivedResearchViews,
} from "./derivedViewDecoders";
import {
  decodeEvidenceMatrixCells,
} from "./evidenceMatrixDecoders";

const VIEW_KEY = "research-assistant.derived-research-views.v1";
const CELL_KEY = "research-assistant.evidence-matrix-cells.v1";
const CELL_REVISION_KEY = "research-assistant.evidence-matrix-cell-revisions.v1";

function readViews(): readonly DerivedResearchView[] {
  const raw = getAppStorage().getItem(VIEW_KEY);
  if (raw === null) return [];
  try {
    return decodeDerivedResearchViews(JSON.parse(raw)) ?? [];
  } catch {
    return [];
  }
}

function validateBrowserInputs(draft: DerivedResearchViewDraft): void {
  const cells = readCells(CELL_REVISION_KEY);
  const currentCells = readCells(CELL_KEY);
  const allowedAnchors = new Set<string>();
  for (const input of draft.inputs) {
    const cell = [...cells, ...currentCells].find((item) => item.id === input.objectId
      && item.revision === input.objectRevision && item.coverageState === "populated");
    if (cell === undefined) throw new Error("派生视图输入已经变化或不是有来源单元");
    cell.statements.forEach((statement) => {
      statement.evidenceAnchorIds.forEach((anchorId) => allowedAnchors.add(anchorId));
    });
  }
  if (draft.items.some((item) => item.evidenceAnchorIds.some((id) => !allowedAnchors.has(id)))) {
    throw new Error("派生视图条目引用了未选择输入之外的证据");
  }
}

function readCells(key: string): readonly EvidenceMatrixCell[] {
  const raw = getAppStorage().getItem(key);
  if (raw === null) return [];
  try {
    return decodeEvidenceMatrixCells(JSON.parse(raw)) ?? [];
  } catch {
    return [];
  }
}

function saveBrowserView(draft: DerivedResearchViewDraft): DerivedResearchView {
  validateBrowserInputs(draft);
  const views = readViews();
  const existing = draft.id === undefined ? undefined : views.find((view) => view.id === draft.id);
  if (draft.id !== undefined && existing === undefined) throw new Error("找不到派生研究视图");
  if (existing !== undefined && existing.revision !== draft.expectedRevision) {
    throw new Error(`派生视图版本冲突；当前版本为 v${existing.revision}`);
  }
  if (existing !== undefined && existing.projectId !== draft.projectId) {
    throw new Error("派生视图不能移动到另一项目");
  }
  const now = new Date().toISOString();
  const view: DerivedResearchView = {
    id: existing?.id ?? crypto.randomUUID(),
    projectId: draft.projectId,
    viewKind: draft.viewKind,
    title: draft.title.trim(),
    scopeNote: draft.scopeNote.trim(),
    inputs: draft.inputs,
    items: draft.items,
    reviewState: draft.reviewState,
    provenanceKind: existing?.provenanceKind ?? "human_original",
    ...(existing?.providerId === undefined ? {} : { providerId: existing.providerId }),
    ...(existing?.modelId === undefined ? {} : { modelId: existing.modelId }),
    generatedAt: existing?.generatedAt ?? now,
    revision: (existing?.revision ?? 0) + 1,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  if (decodeDerivedResearchView(view) === undefined) throw new Error("派生研究视图参数无效");
  getAppStorage().setItem(
    VIEW_KEY,
    JSON.stringify([view, ...views.filter((item) => item.id !== view.id)]),
  );
  return view;
}

const browserGateway: DerivedResearchViewGateway = {
  async list(projectId) {
    return readViews().filter((view) => view.projectId === projectId);
  },
  async save(draft) {
    return saveBrowserView(draft);
  },
};

export function getDerivedResearchViewGateway(): DerivedResearchViewGateway {
  return runtimeDerivedViewGateway() ?? resolveDerivedViewRuntimeGateway(browserGateway);
}
