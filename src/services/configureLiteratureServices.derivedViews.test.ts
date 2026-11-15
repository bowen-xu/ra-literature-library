import {afterEach, expect, it, vi} from "vitest";
import type {RuntimeLiteraturePort} from "@research-assistant/workbench-sdk/literature-runtime";
import type {DerivedResearchView, DerivedResearchViewDraft} from "@research-assistant/core/synthesis";
import {configureLiteratureServices} from "./configureLiteratureServices";
import {getDerivedResearchViewGateway} from "./derivedViewGateway";
const fallback = vi.hoisted(() => vi.fn());
vi.mock("@research-assistant/workbench-sdk/literature-runtime", () => ({resolveDerivedViewRuntimeGateway: fallback}));
let dispose: (() => void) | undefined;
afterEach(() => {dispose?.(); dispose = undefined; fallback.mockReset();});
const draft: DerivedResearchViewDraft = {projectId: "p", viewKind: "taxonomy", title: "Compare", scopeNote: "Selected", inputs: [{objectKind: "matrix_cell", objectId: "c", objectRevision: 1, selectionReason: "Chosen"}], items: [{id: "i", text: "Provisional", epistemicRole: "synthesis", evidenceAnchorIds: ["a"], hasConflict: true}], reviewState: "accepted", changeReason: "manual"};
const view: DerivedResearchView = {projectId: draft.projectId, viewKind: draft.viewKind, title: draft.title, scopeNote: draft.scopeNote, inputs: draft.inputs, items: draft.items, reviewState: draft.reviewState, id: "v", provenanceKind: "ai_accepted_after_edit", providerId: "provider", modelId: "model", generatedAt: "before", revision: 2, createdAt: "before", updatedAt: "after"};
it("decodes original derived views and revokes both methods on a captured facade", async () => {
  const methods = {list: vi.fn(async () => [view]), save: vi.fn(async () => view)};
  dispose = configureLiteratureServices({derivedViews: methods} as unknown as RuntimeLiteraturePort);
  const gateway = getDerivedResearchViewGateway();
  await expect(gateway.list("p")).resolves.toEqual([view]); await expect(gateway.save(draft)).resolves.toEqual(view);
  expect(methods.save).toHaveBeenCalledExactlyOnceWith(draft);
  dispose();
  await expect(gateway.list("p")).rejects.toMatchObject({code: "literature_gateway_unavailable"});
  await expect(gateway.save(draft)).rejects.toMatchObject({code: "literature_gateway_unavailable"});
  expect(methods.save).toHaveBeenCalledTimes(1); expect(methods.list).toHaveBeenCalledTimes(1); expect(fallback).not.toHaveBeenCalled();
});
it("refuses malformed results and missing methods without static IPC or browser fallback", async () => {
  dispose = configureLiteratureServices({derivedViews: {list: async () => [{...view, inputs: []}], save: async () => ({...view, modelId: null})}} as unknown as RuntimeLiteraturePort);
  await expect(getDerivedResearchViewGateway().list("p")).rejects.toThrow("不兼容的派生视图列表");
  await expect(getDerivedResearchViewGateway().save(draft)).rejects.toThrow("不兼容的派生视图");
  dispose(); dispose = configureLiteratureServices({} as RuntimeLiteraturePort);
  await expect(getDerivedResearchViewGateway().list("p")).rejects.toMatchObject({code: "literature_gateway_unavailable"}); expect(fallback).not.toHaveBeenCalled();
});
