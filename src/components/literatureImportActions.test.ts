import type { ImportJob, LiteratureDraft, LiteratureItem, MetadataPreview } from "@research-assistant/core/literature";
import { describe, expect, it, vi } from "vitest";

import type { LiteratureGateway } from "../services/literatureGateway";
import { createLiteratureCreatorInput } from "./literatureCreatorInput";
import { createLiteratureImportActions } from "./literatureImportActions";
import { DoiPreviewRequest } from "./doiPreviewRequest";
import {emptyNalState} from "@research-assistant/core/nal";
import type {RuntimeLiteraturePort} from "@research-assistant/workbench-sdk/literature-runtime";
import {configureLiteratureServices} from "../services/configureLiteratureServices";
import {getLiteratureGateway} from "../services/literatureGateway";

async function unrelatedAttachment(): Promise<never> {throw new Error("Unexpected attachment operation in import fixture");}

const desktopMocks = vi.hoisted(() => ({
  hasPlatform: vi.fn(() => true),
  open: vi.fn(),
}));

vi.mock("@research-assistant/workbench-sdk/environment", () => ({ hasPlatformCapabilities: desktopMocks.hasPlatform }));
vi.mock("@research-assistant/workbench-sdk/platform", () => ({ open: desktopMocks.open }));

const draft: LiteratureDraft = {
  itemType: "journalArticle",
  title: "Draft before persistence",
  abstractText: "",
  containerTitle: "",
  volume: "",
  issue: "",
  pages: "",
  doi: "",
  url: "",
  language: "",
  bibtexKey: "",
  creators: [],
  tags: [],
};

const savedItem: LiteratureItem = {
  ...draft,
  id: "item-1",
  readingStatus: "unread",
  attachments: [],
  projectIds: [],
  metadataSources: [],
  createdAt: "2026-08-05T00:00:00.000Z",
  updatedAt: "2026-08-05T00:00:00.000Z",
};

function setup(overrides: Partial<Parameters<typeof createLiteratureImportActions>[0]> = {}) {
  const save = vi.fn(async () => savedItem);
  const refresh = vi.fn(async () => undefined);
  const setPanel = vi.fn();
  const setError = vi.fn();
  const setNotice = vi.fn();
  const setWarning = vi.fn();
  const context = {
    gateway: { save } as unknown as LiteratureGateway,
    doiRequest: new DoiPreviewRequest({ save } as unknown as LiteratureGateway, vi.fn(), vi.fn()),
    selected: undefined,
    query: "",
    panel: "manual" as const,
    bibtex: "",
    bibtexPreview: { drafts: [], error: undefined },
    pdfCandidates: [],
    pdfCreatorInputs: {},
    doi: "",
    manual: draft,
    manualCreatorInput: createLiteratureCreatorInput([]),
    lastImportJob: undefined,
    metadataPreview: undefined,
    setPanel,
    setBibtex: vi.fn(),
    setPdfCandidates: vi.fn(),
    setPdfCreatorInputs: vi.fn(),
    setDoi: vi.fn(),
    setManual: vi.fn(),
    setManualCreatorInput: vi.fn(),
    setLastImportJob: vi.fn(),
    setMetadataPreview: vi.fn(),
    setSelectedId: vi.fn(),
    setError,
    setNotice,
    setWarning,
    refresh,
    onImported: vi.fn(async () => undefined),
    ...overrides,
  };
  const actions = createLiteratureImportActions(context);

  return { actions, context, refresh, save, setError, setNotice, setPanel, setWarning };
}

describe("manual literature draft persistence", () => {
  it("does not create an item when the manual editor is cancelled", async () => {
    const { actions, save, setPanel } = setup();

    await actions.cancelPanel();

    expect(save).not.toHaveBeenCalled();
    expect(setPanel).toHaveBeenCalledWith(undefined);
  });

  it("creates exactly one item only when the completed draft is submitted", async () => {
    const { actions, context, refresh, save } = setup();

    expect(save).not.toHaveBeenCalled();
    await actions.saveManual();

    expect(save).toHaveBeenCalledOnce();
    expect(save).toHaveBeenCalledWith(expect.objectContaining({
      sourceKind: "user",
      title: "Draft before persistence",
    }));
    expect(context.onImported).toHaveBeenCalledWith(savedItem.id);
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe("DOI candidate handoff", () => {
  const preview: MetadataPreview = { id: "candidate-1", importJobId: "doi-job-1", draft,
    sourceKind: "datacite", sourceReference: "10.1234/test", diffs: [], warnings: ["已保留基础元数据"] };

  it("opens confirmation without querying an unfinished job or showing import progress", async () => {
    const previewDoi = vi.fn(async () => preview), getImportJob = vi.fn();
    const gateway = { previewDoi, getImportJob, rejectMetadataCandidate: vi.fn() } as unknown as LiteratureGateway;
    const { actions, context, setPanel, setNotice, setWarning } = setup({ gateway, doi: "10.1234/test",
      doiRequest: new DoiPreviewRequest(gateway, vi.fn(), vi.fn()) });
    await actions.importByDoi();
    expect(context.setMetadataPreview).toHaveBeenCalledWith(preview);
    expect(setPanel).toHaveBeenCalledWith("manual");
    expect(getImportJob).not.toHaveBeenCalled();
    expect(context.setLastImportJob).not.toHaveBeenCalled();
    expect(setNotice).toHaveBeenCalledWith("已获取 DOI 元数据，请确认后添加到文献库");
    expect(setWarning).toHaveBeenCalledWith("已保留基础元数据");
  });

  it("does not reopen a form after cancellation during lookup", async () => {
    let resolve: (preview: MetadataPreview) => void = () => undefined;
    const gateway = { previewDoi: vi.fn(() => new Promise<MetadataPreview>(yes => { resolve = yes; })),
      rejectMetadataCandidate: vi.fn(async () => undefined) } as unknown as LiteratureGateway;
    const { actions, setPanel, context } = setup({ gateway, panel: "doi", doiRequest: new DoiPreviewRequest(gateway, vi.fn(), vi.fn()) });
    const pending = actions.importByDoi();
    await Promise.resolve();
    await actions.cancelPanel();
    resolve(preview);
    await pending;
    await vi.waitFor(() => expect(gateway.rejectMetadataCandidate).toHaveBeenCalledWith(preview.id));
    expect(setPanel).not.toHaveBeenCalledWith("manual");
    expect(context.setMetadataPreview).not.toHaveBeenCalledWith(preview);
  });

  it("keeps a successful save visible even if reading its final task status fails", async () => {
    const applyMetadataCandidate = vi.fn(async () => savedItem);
    const gateway = { applyMetadataCandidate, getImportJob: vi.fn(async () => { throw new Error("IPC disconnected"); }) } as unknown as LiteratureGateway;
    const { actions, context, setWarning, setPanel } = setup({ gateway, metadataPreview: preview });
    await actions.saveManual();
    expect(applyMetadataCandidate).toHaveBeenCalledOnce();
    expect(context.onImported).toHaveBeenCalledWith(savedItem.id);
    expect(setPanel).toHaveBeenCalledWith(undefined);
    expect(setWarning).toHaveBeenCalledWith(expect.stringContaining("doi-job-1：操作已完成"));
  });

  it("preserves the current view when updating existing DOI metadata", async () => {
    const gateway = { applyMetadataCandidate: vi.fn(async () => savedItem), getImportJob: vi.fn() } as unknown as LiteratureGateway;
    const { actions, context, refresh } = setup({ gateway, query: "current search", metadataPreview: { ...preview, itemId: savedItem.id } });
    await actions.saveManual();
    expect(context.onImported).not.toHaveBeenCalled();
    expect(refresh).toHaveBeenCalledWith("current search");
    expect(context.setSelectedId).toHaveBeenCalledWith(savedItem.id);
  });

  it("runs the original confirmation, rejection and task refresh through the injected package owner", async () => {
    const owner: RuntimeLiteraturePort = {literature: {
      importPdfs: unrelatedAttachment, attachPdf: unrelatedAttachment, renameAttachment: unrelatedAttachment,
      removeAttachment: unrelatedAttachment, readAttachment: unrelatedAttachment, revealAttachments: unrelatedAttachment,
      saveReadingState: unrelatedAttachment, getReadingState: unrelatedAttachment,
      isAttachmentIndexed: unrelatedAttachment, indexAttachment: unrelatedAttachment,
      list: vi.fn(async () => [savedItem]), get: vi.fn(async () => savedItem), listDuplicates: vi.fn(async () => []), listMergeOperations: vi.fn(async () => []),
      save: vi.fn(async () => savedItem), updateMetadataField: vi.fn(async () => savedItem), confirmMetadataFields: vi.fn(async () => savedItem),
      importBibtex: vi.fn(async () => ({id: "bibtex-job", sourceKind: "bibtex", state: "completed", totalCount: 0, completedCount: 0,
        cancellationRequested: false, results: [], createdAt: "created", updatedAt: "updated"})),
      listTrash: vi.fn(async () => []), decideDuplicate: vi.fn(async () => undefined), mergeDuplicate: vi.fn(),
      undoMerge: vi.fn(async () => undefined), archive: vi.fn(async () => undefined), restore: vi.fn(async () => undefined),
      trash: vi.fn(async () => undefined), trashMany: vi.fn(async () => undefined), restoreTrash: vi.fn(async () => undefined),
      previewDoi: vi.fn(async () => preview), applyMetadataCandidate: vi.fn(async () => savedItem), applyMetadataCandidateFields: vi.fn(async () => savedItem),
      rejectMetadataCandidate: vi.fn(async () => undefined), getImportJob: vi.fn(async () => ({id: preview.importJobId, sourceKind: "doi", state: "completed",
        totalCount: 1, completedCount: 1, cancellationRequested: false, results: [], createdAt: "created", updatedAt: "updated"})), cancelImportJob: vi.fn(async () => undefined),
    }, referenceRecords: {list: vi.fn(async () => {throw new Error("Unexpected reference read");}), save: vi.fn(async () => {throw new Error("Unexpected reference save");})},
    nal: {read: async () => emptyNalState(), mutate: unrelatedAttachment, ensureAnnotation: unrelatedAttachment},
    knowledge: {searchConcepts: unrelatedAttachment, saveConcept: unrelatedAttachment, listReadingUnits: unrelatedAttachment, saveReadingUnit: unrelatedAttachment}, queries: {read: async () => ({revision: 1, definitions: [], cache: null, legacyImported: true}),
      save: async () => ({revision: 2, definitions: [], cache: null, legacyImported: true})}};
    const release = configureLiteratureServices(owner);
    try {
      const gateway = getLiteratureGateway();
      const lookup = setup({gateway, doi: "10.1234/test", doiRequest: new DoiPreviewRequest(gateway, vi.fn(), vi.fn())});
      await lookup.actions.importByDoi();
      expect(lookup.context.setMetadataPreview).toHaveBeenCalledWith(preview);
      expect(owner.literature.getImportJob).not.toHaveBeenCalled();
      const confirmation = setup({gateway, metadataPreview: preview});
      await confirmation.actions.saveManual();
      expect(owner.literature.applyMetadataCandidate).toHaveBeenCalledOnce();
      expect(confirmation.context.onImported).toHaveBeenCalledWith(savedItem.id);
      expect(owner.literature.getImportJob).toHaveBeenCalledWith(preview.importJobId);
      const cancellation = setup({gateway, panel: "manual", metadataPreview: preview});
      await cancellation.actions.cancelPanel();
      expect(owner.literature.rejectMetadataCandidate).toHaveBeenCalledExactlyOnceWith(preview.id);
      expect(cancellation.context.setMetadataPreview).toHaveBeenCalledWith(undefined);
    } finally {release();}
  });
});

describe("selection after batch import", () => {
  const job: ImportJob = { id: "import-1", state: "completed_with_errors", sourceKind: "bibtex", totalCount: 4,
    completedCount: 4, cancellationRequested: false, createdAt: "", updatedAt: "", results: [
      { inputLabel: "duplicate", rawInput: "", state: "duplicate", itemId: "old-item" },
      { inputLabel: "failed", rawInput: "", state: "failed" },
      { inputLabel: "first", rawInput: "", state: "imported", itemId: "new-first" },
      { inputLabel: "second", rawInput: "", state: "imported", itemId: "new-second" },
    ] };

  it.each(["bibtex", "pdf"] as const)("selects the first new item from a completed %s import", async sourceKind => {
    const gateway = { importBibtex: vi.fn(async () => job), importPdfs: vi.fn(async () => ({ ...job, sourceKind })) } as unknown as LiteratureGateway;
    const { actions, context } = setup({ gateway, bibtexPreview: { drafts: [draft], error: undefined },
      pdfCandidates: [{ path: "paper.pdf", draft }] });
    await (sourceKind === "pdf" ? actions.importPdfs() : actions.importBibtex());
    expect(context.onImported).toHaveBeenCalledExactlyOnceWith("new-first");
  });

  it("waits for a running PDF job to reach its terminal receipt", async () => {
    const running = { ...job, sourceKind: "pdf", state: "running" };
    const gateway = { importPdfs: vi.fn(async () => running) } as unknown as LiteratureGateway;
    const { actions, context } = setup({ gateway, pdfCandidates: [{ path: "paper.pdf", draft }] });
    await actions.importPdfs();
    expect(context.onImported).not.toHaveBeenCalled();
    await actions.finishImportJob({ ...job, sourceKind: "pdf" });
    expect(context.onImported).toHaveBeenCalledExactlyOnceWith("new-first");
  });

  it("retains selection when the import only has duplicates or failures", async () => {
    const { actions, context, refresh } = setup();
    await actions.finishImportJob({ ...job, results: job.results.slice(0, 2) });
    expect(context.onImported).not.toHaveBeenCalled();
    expect(context.setSelectedId).not.toHaveBeenCalled();
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("also selects a new item after retrying failed BibTeX inputs", async () => {
    const gateway = { importBibtex: vi.fn(async () => job) } as unknown as LiteratureGateway;
    const { actions, context } = setup({ gateway, lastImportJob: { ...job,
      results: [{ inputLabel: "retry", rawInput: JSON.stringify(draft), state: "failed" }] } });
    await actions.retryFailedImport();
    expect(context.onImported).toHaveBeenCalledExactlyOnceWith("new-first");
  });

  it("uses the injected owner for manual input, partial BibTeX results, original failed-input retry and cancellation", async () => {
    const failedDraft = {...draft, title: "Failed original", rawBibtex: "@article{failed, title={Failed original}}",
      creators: [{familyName: "Xu", givenName: "Bo", literalName: "", role: "editor"}], tags: ["a", "a"]};
    const batch = {...job, results: job.results.map(result => result.state === "failed"
      ? {...result, rawInput: JSON.stringify(failedDraft)} : result)};
    const cancelled = {...batch, state: "cancelled", cancellationRequested: true};
    const owner: RuntimeLiteraturePort = {literature: {
      importPdfs: unrelatedAttachment, attachPdf: unrelatedAttachment, renameAttachment: unrelatedAttachment,
      removeAttachment: unrelatedAttachment, readAttachment: unrelatedAttachment, revealAttachments: unrelatedAttachment,
      saveReadingState: unrelatedAttachment, getReadingState: unrelatedAttachment,
      isAttachmentIndexed: unrelatedAttachment, indexAttachment: unrelatedAttachment,
      list: vi.fn(async () => [savedItem]), get: vi.fn(async () => savedItem), save: vi.fn(async () => savedItem),
      updateMetadataField: vi.fn(async () => savedItem), confirmMetadataFields: vi.fn(async () => savedItem),
      importBibtex: vi.fn(async () => batch), listDuplicates: vi.fn(async () => []), listMergeOperations: vi.fn(async () => []),
      listTrash: vi.fn(async () => []), decideDuplicate: vi.fn(async () => undefined), mergeDuplicate: vi.fn(),
      undoMerge: vi.fn(async () => undefined), archive: vi.fn(async () => undefined), restore: vi.fn(async () => undefined),
      trash: vi.fn(async () => undefined), trashMany: vi.fn(async () => undefined), restoreTrash: vi.fn(async () => undefined),
      previewDoi: vi.fn(), applyMetadataCandidate: vi.fn(async () => savedItem), applyMetadataCandidateFields: vi.fn(async () => savedItem),
      rejectMetadataCandidate: vi.fn(async () => undefined), getImportJob: vi.fn(async () => cancelled), cancelImportJob: vi.fn(async () => undefined),
    }, referenceRecords: {list: vi.fn(async () => {throw new Error("Unexpected reference read");}), save: vi.fn(async () => {throw new Error("Unexpected reference save");})},
    nal: {read: async () => emptyNalState(), mutate: unrelatedAttachment, ensureAnnotation: unrelatedAttachment},
    knowledge: {searchConcepts: unrelatedAttachment, saveConcept: unrelatedAttachment, listReadingUnits: unrelatedAttachment, saveReadingUnit: unrelatedAttachment}, queries: {read: async () => ({revision: 1, definitions: [], cache: null, legacyImported: true}),
      save: async () => ({revision: 2, definitions: [], cache: null, legacyImported: true})}};
    const release = configureLiteratureServices(owner);
    try {
      const gateway = getLiteratureGateway(), manual = setup({gateway});
      await manual.actions.saveManual();
      expect(owner.literature.save).toHaveBeenCalledExactlyOnceWith({...draft, sourceKind: "user"});
      expect(manual.context.onImported).toHaveBeenCalledExactlyOnceWith(savedItem.id);
      const imported = setup({gateway, bibtexPreview: {drafts: [draft, failedDraft], error: undefined}});
      await imported.actions.importBibtex();
      expect(owner.literature.importBibtex).toHaveBeenNthCalledWith(1, [draft, failedDraft]);
      expect(imported.context.setLastImportJob).toHaveBeenCalledExactlyOnceWith(batch);
      expect(imported.context.onImported).toHaveBeenCalledExactlyOnceWith("new-first");
      const retry = setup({gateway, lastImportJob: batch});
      await retry.actions.retryFailedImport();
      expect(owner.literature.importBibtex).toHaveBeenNthCalledWith(2, [failedDraft]);
      expect(retry.context.onImported).toHaveBeenCalledExactlyOnceWith("new-first");
      const cancelling = setup({gateway, lastImportJob: {...batch, state: "running"}});
      await cancelling.actions.cancelImport();
      expect(owner.literature.cancelImportJob).toHaveBeenCalledExactlyOnceWith(batch.id);
      expect(owner.literature.getImportJob).toHaveBeenCalledExactlyOnceWith(batch.id);
      expect(cancelling.context.setLastImportJob).toHaveBeenCalledExactlyOnceWith(cancelled);
      expect(owner.literature.save).toHaveBeenCalledTimes(1);
      expect(owner.literature.importBibtex).toHaveBeenCalledTimes(2);
    } finally {release();}
  });
});

describe("PDF file selection feedback", () => {
  it.each([null, []])("silently ignores a cancelled or empty dialog result", async (result) => {
    desktopMocks.hasPlatform.mockReturnValue(true);
    desktopMocks.open.mockResolvedValueOnce(result);
    const { actions, setError, setNotice, setPanel } = setup();

    await actions.choosePdfs();

    expect(setError).toHaveBeenCalledWith(undefined);
    expect(setError).not.toHaveBeenCalledWith(expect.any(String));
    expect(setNotice).not.toHaveBeenCalled();
    expect(setPanel).not.toHaveBeenCalledWith("pdf");
  });

  it("reports an unsupported dropped file without opening PDF review", () => {
    const { actions, setError, setPanel, setWarning } = setup();

    actions.reviewPdfPaths(["notes.txt"]);

    expect(setWarning).toHaveBeenCalledWith("仅支持 PDF 文件，请重新选择。");
    expect(setError).not.toHaveBeenCalledWith(expect.any(String));
    expect(setPanel).not.toHaveBeenCalledWith("pdf");
  });
});
