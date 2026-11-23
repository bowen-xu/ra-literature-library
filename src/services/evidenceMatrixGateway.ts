import {resolveEvidenceMatrixRuntimeGateway} from "@research-assistant/workbench-sdk/literature-runtime";
import type { EvidenceMatrixGateway } from "../public/contracts/evidenceMatrixGateway";
export type { EvidenceMatrixGateway } from "../public/contracts/evidenceMatrixGateway";
import { getAppStorage } from "@research-assistant/workbench-sdk/storage";
import type {
  EvidenceMatrix,
  EvidenceMatrixCell,
  EvidenceMatrixCellDraft,
  EvidenceMatrixDraft,
} from "@research-assistant/core/synthesis";

import {
  decodeEvidenceMatrices,
  decodeEvidenceMatrix,
  decodeEvidenceMatrixCell,
  decodeEvidenceMatrixCells,
} from "./evidenceMatrixDecoders";

import {runtimeEvidenceMatrixGateway} from "./configureLiteratureServices";

const MATRIX_KEY = "research-assistant.evidence-matrices.v1";
const CELL_KEY = "research-assistant.evidence-matrix-cells.v1";
const CELL_REVISION_KEY = "research-assistant.evidence-matrix-cell-revisions.v1";

function read<T>(key: string, decode: (value: unknown) => readonly T[] | undefined): readonly T[] {
  const raw = getAppStorage().getItem(key);
  if (raw === null) return [];
  try {
    return decode(JSON.parse(raw)) ?? [];
  } catch {
    return [];
  }
}

function write(key: string, value: unknown): void {
  getAppStorage().setItem(key, JSON.stringify(value));
}

function saveBrowserMatrix(draft: EvidenceMatrixDraft): EvidenceMatrix {
  const matrices = read(MATRIX_KEY, decodeEvidenceMatrices);
  const existing = draft.id === undefined
    ? undefined
    : matrices.find((matrix) => matrix.id === draft.id);
  if (draft.id !== undefined && existing === undefined) throw new Error("找不到证据矩阵");
  if (existing !== undefined && existing.revision !== draft.expectedRevision) {
    throw new Error(`证据矩阵版本冲突；当前版本为 v${existing.revision}`);
  }
  if (existing !== undefined && existing.projectId !== draft.projectId) {
    throw new Error("证据矩阵不能移动到另一项目");
  }
  const now = new Date().toISOString();
  const matrix: EvidenceMatrix = {
    id: existing?.id ?? crypto.randomUUID(),
    projectId: draft.projectId,
    title: draft.title.trim(),
    paperIds: draft.paperIds,
    dimensions: draft.dimensions,
    revision: (existing?.revision ?? 0) + 1,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  if (decodeEvidenceMatrix(matrix) === undefined) throw new Error("证据矩阵参数无效");
  write(MATRIX_KEY, [matrix, ...matrices.filter((item) => item.id !== matrix.id)]);
  return matrix;
}

function saveBrowserCell(draft: EvidenceMatrixCellDraft): EvidenceMatrixCell {
  const matrix = read(MATRIX_KEY, decodeEvidenceMatrices)
    .find((item) => item.id === draft.matrixId);
  if (matrix === undefined
    || !matrix.paperIds.includes(draft.paperId)
    || !matrix.dimensions.some((item) => item.id === draft.dimensionId)) {
    throw new Error("证据矩阵单元不在当前矩阵范围内");
  }
  const cells = read(CELL_KEY, decodeEvidenceMatrixCells);
  const existing = cells.find((cell) => cell.matrixId === draft.matrixId
    && cell.paperId === draft.paperId && cell.dimensionId === draft.dimensionId);
  if (existing !== undefined && existing.revision !== draft.expectedRevision) {
    throw new Error(`证据矩阵单元版本冲突；当前版本为 v${existing.revision}`);
  }
  const now = new Date().toISOString();
  const cell: EvidenceMatrixCell = {
    id: existing?.id ?? crypto.randomUUID(),
    matrixId: draft.matrixId,
    paperId: draft.paperId,
    dimensionId: draft.dimensionId,
    coverageState: draft.coverageState,
    coverageNote: draft.coverageNote.trim(),
    statements: draft.statements,
    provenanceKind: existing?.provenanceKind ?? "human_original",
    revision: (existing?.revision ?? 0) + 1,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  if (decodeEvidenceMatrixCell(cell) === undefined) throw new Error("证据矩阵单元参数无效");
  write(CELL_KEY, [cell, ...cells.filter((item) => item.id !== cell.id)]);
  const revisions = read(CELL_REVISION_KEY, decodeEvidenceMatrixCells);
  const priorRevision = existing === undefined
    || revisions.some((item) => item.id === existing.id && item.revision === existing.revision)
    ? []
    : [existing];
  write(CELL_REVISION_KEY, [
    cell,
    ...priorRevision,
    ...revisions.filter((item) => item.id !== cell.id || item.revision !== cell.revision),
  ]);
  return cell;
}

const browserGateway: EvidenceMatrixGateway = {
  async list(projectId) {
    return read(MATRIX_KEY, decodeEvidenceMatrices).filter((matrix) => matrix.projectId === projectId);
  },
  async save(draft) {
    return saveBrowserMatrix(draft);
  },
  async listCells(matrixId) {
    return read(CELL_KEY, decodeEvidenceMatrixCells).filter((cell) => cell.matrixId === matrixId);
  },
  async saveCell(draft) {
    return saveBrowserCell(draft);
  },
};

export function getEvidenceMatrixGateway(): EvidenceMatrixGateway {
  return runtimeEvidenceMatrixGateway() ?? resolveEvidenceMatrixRuntimeGateway(browserGateway);
}
