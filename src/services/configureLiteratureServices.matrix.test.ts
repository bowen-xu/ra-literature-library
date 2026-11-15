import {afterEach, expect, it, vi} from "vitest";
import type {RuntimeLiteraturePort} from "@research-assistant/workbench-sdk/literature-runtime";
import type {EvidenceMatrix, EvidenceMatrixCell, EvidenceMatrixDraft, EvidenceMatrixCellDraft} from "@research-assistant/core/synthesis";
import {configureLiteratureServices} from "./configureLiteratureServices";
import {getEvidenceMatrixGateway} from "./evidenceMatrixGateway";
import {getEvidenceGateway} from "./evidenceGateway";

const fallback = vi.hoisted(() => vi.fn());
vi.mock("@research-assistant/workbench-sdk/literature-runtime", () => ({resolveEvidenceMatrixRuntimeGateway: fallback, resolveEvidenceRuntimeGateway: fallback}));
let dispose: (() => void) | undefined;
afterEach(() => {dispose?.(); dispose = undefined; fallback.mockReset();});
const matrix: EvidenceMatrix = {id: "m", projectId: "p", title: "Compare", paperIds: ["a", "b"], dimensions: [{id: "d", label: "Claim"}], revision: 1, createdAt: "before", updatedAt: "before"};
const cell: EvidenceMatrixCell = {id: "c", matrixId: "m", paperId: "a", dimensionId: "d", coverageState: "not_found", coverageNote: "No result", statements: [], provenanceKind: "human_original", revision: 1, createdAt: "before", updatedAt: "before"};
const draft: EvidenceMatrixDraft = {projectId: "p", title: " Compare ", paperIds: matrix.paperIds, dimensions: matrix.dimensions, changeReason: "manual"};
const cellDraft: EvidenceMatrixCellDraft = {matrixId: "m", paperId: "a", dimensionId: "d", coverageState: "not_found", coverageNote: " No result ", statements: [], changeReason: "manual"};
it("decodes the original source inventory and keeps writes unavailable without a static fallback", async () => {
  const source = {anchorId: "anchor", itemId: "a", itemTitle: "Synthetic paper", attachmentId: "pdf", attachmentName: "synthetic.pdf", contentSha256: "a".repeat(64), pageIndex: 0, rects: [], quoteExact: "Synthetic quote", quotePrefix: "", quoteSuffix: "", annotationBody: "", createdAt: "now"};
  const methods = {listClaims: vi.fn(async () => []), listSources: vi.fn(async () => [source]), listClaimEvidence: vi.fn(async () => [])};
  dispose = configureLiteratureServices({evidence: methods} as unknown as RuntimeLiteraturePort);
  const selected = getEvidenceGateway();
  await expect(selected.listSources("p")).resolves.toEqual([source]);
  await expect(selected.listClaims("p")).resolves.toEqual([]); await expect(selected.listClaimEvidence("claim")).resolves.toEqual([]);
  await expect(selected.saveClaim({statement: "Unsent", epistemicRole: "assertion"})).rejects.toMatchObject({code: "literature_gateway_unavailable"});
  dispose(); await expect(selected.listSources("p")).rejects.toMatchObject({code: "literature_gateway_unavailable"});
  expect(methods.listSources).toHaveBeenCalledExactlyOnceWith("p"); expect(fallback).not.toHaveBeenCalled();
});
it("uses the production matrix facade with original decoding and revokes a captured port on disposal", async () => {
  const methods = {list: vi.fn(async () => [matrix]), save: vi.fn(async () => matrix), listCells: vi.fn(async () => [cell]), saveCell: vi.fn(async () => cell)};
  dispose = configureLiteratureServices({evidenceMatrix: methods} as unknown as RuntimeLiteraturePort);
  const port = getEvidenceMatrixGateway();
  await expect(port.list("p")).resolves.toEqual([matrix]); await expect(port.save(draft)).resolves.toEqual(matrix);
  await expect(port.listCells("m")).resolves.toEqual([cell]); await expect(port.saveCell(cellDraft)).resolves.toEqual(cell);
  expect(methods.save).toHaveBeenCalledExactlyOnceWith(draft); expect(methods.saveCell).toHaveBeenCalledExactlyOnceWith(cellDraft);
  dispose();
  await expect(port.saveCell(cellDraft)).rejects.toMatchObject({code: "literature_gateway_unavailable"});
  expect(methods.saveCell).toHaveBeenCalledTimes(1); expect(fallback).not.toHaveBeenCalled();
});
it("refuses malformed results and missing matrix methods without using static IPC or browser storage", async () => {
  dispose = configureLiteratureServices({evidenceMatrix: {list: async () => [{...matrix, paperIds: []}]}} as unknown as RuntimeLiteraturePort);
  await expect(getEvidenceMatrixGateway().list("p")).rejects.toThrow("不兼容的证据矩阵列表");
  dispose(); dispose = configureLiteratureServices({} as RuntimeLiteraturePort);
  await expect(getEvidenceMatrixGateway().list("p")).rejects.toMatchObject({code: "literature_gateway_unavailable"});
  expect(fallback).not.toHaveBeenCalled();
});
