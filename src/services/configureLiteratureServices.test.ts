import {afterEach, expect, it, vi} from "vitest";
import type {ImportJob, LiteratureItem, MergeOperation, MetadataPreview} from "@research-assistant/core/literature";
import type {ReferenceRecord, ReferenceRecordDraft} from "@research-assistant/core/synthesis";
import {emptyNalState} from "@research-assistant/core/nal";
import type {RuntimeLiteraturePort} from "@research-assistant/workbench-sdk/literature-runtime";
import type {LiteratureGateway, ResearchKnowledgeGateway} from "@research-assistant/data/literature";
import type {ReaderViewStateV2} from "@research-assistant/core/reader";
import type {Concept, ConceptDraft, StructuredReadingUnit, StructuredReadingUnitDraft} from "@research-assistant/core/knowledge";
import {configureLiteratureServices} from "./configureLiteratureServices";
import {getLiteratureGateway} from "./literatureGateway";
import {getNalGateway} from "./nalGateway";
import {getNalQueryGateway} from "./nalQueryGateway";
import {getReferenceRecordGateway} from "./referenceRecordGateway";
import {getResearchKnowledgeGateway} from "./knowledgeGateway";
import {browserKnowledgeGateway} from "./browserKnowledgeGateway";
import {DoiPreviewRequest} from "../components/doiPreviewRequest";

const legacy = vi.hoisted(() => ({resolveLiteratureRuntimeGateway: vi.fn(), resolveNalRuntimeGateway: vi.fn(), resolveNalQueryRuntimeGateway: vi.fn(),
  resolveReferenceRecordRuntimeGateway: vi.fn(), resolveKnowledgeRuntimeGateway: vi.fn()}));
vi.mock("@research-assistant/workbench-sdk/literature-runtime", () => legacy);
const releases: (() => void)[] = [];
afterEach(() => {for (const release of releases.splice(0).reverse()) release(); vi.clearAllMocks();});
const item: LiteratureItem = {id: "paper", itemType: "journalArticle", title: "Original", abstractText: "", doi: "10.1000/test",
  containerTitle: "", volume: "", issue: "", pages: "", url: "", language: "", bibtexKey: "", creators: [], tags: [],
  attachments: [], projectIds: [], metadataSources: [], readingStatus: "unread", createdAt: "created", updatedAt: "updated"};
const preview: MetadataPreview = {id: "candidate", importJobId: "job", sourceKind: "doi.org:csl-json",
  sourceReference: "10.1000/test", draft: item, diffs: []};
const job: ImportJob = {id: "job", sourceKind: "doi", state: "queued", totalCount: 1, completedCount: 0,
  cancellationRequested: false, results: [], createdAt: "created", updatedAt: "updated"};
const query = {revision: 1, definitions: [], cache: null, legacyImported: true};
const operation: MergeOperation = {id: "merge-1", survivorItemId: "survivor", survivorTitle: "Kept", mergedItemId: "merged",
  mergedTitle: "Original", state: "applied", createdAt: "created"};
const attachment = {id: "attachment", displayName: "原文.pdf", mimeType: "application/pdf", byteSize: 3, contentSha256: "a".repeat(64)};
const bytes = new Uint8Array([0, 255, 42]);
const readingState: ReaderViewStateV2 = {schemaVersion: 2, pageIndex: 2, scale: {kind: "page-width"}, top: 7,
  scrollMode: "vertical", spreadMode: "none"};
const candidates = [{path: " /synthetic 原文.pdf ", draft: item}], pages = [{pageIndex: 2, text: " 原文\u0000 "}];
const reference: ReferenceRecord = {id: "reference-1", citingPaperId: "paper", sourceAnchorId: "anchor-1", rawText: "Original reference",
  fields: [{name: "title", value: "Original title", sourceKind: "reference_text", confirmedByUser: false}], parseState: "parsed",
  identityState: "unverified", semanticState: "unreviewed", usageSummary: "", provenanceKind: "human_original", revision: 1,
  createdAt: "created", updatedAt: "updated"};
const referenceDraft: ReferenceRecordDraft = {id: reference.id, citingPaperId: reference.citingPaperId, sourceAnchorId: reference.sourceAnchorId,
  rawText: " Original reference\n", fields: reference.fields, parseState: reference.parseState, identityState: reference.identityState,
  semanticState: reference.semanticState, usageSummary: "", expectedRevision: 1, changeReason: " human review "};
const term = {id: "term", text: "Concept", normalizedText: "concept", language: "und", provenanceKind: "human_original" as const,
  revision: 1, createdAt: "created", updatedAt: "updated"};
const concept: Concept = {id: "concept", preferredTerm: term, terms: [term], label: "Concept", explanation: "", disambiguation: "",
  domain: "", tradition: "", period: "", provenanceKind: "human_original", revision: 1, definitionCount: 0, sourceCount: 0,
  createdAt: "created", updatedAt: "updated"};
const conceptDraft: ConceptDraft = {preferredTerm: " Concept\u0000 ", label: " Concept\u0000 ", explanation: "", disambiguation: "",
  domain: "", tradition: "", period: "", expectedRevision: 8};
const annotationRequest = {targetKind: "concept" as const, targetId: "concept", title: "Original annotation"};
const annotation = {id: "annotation", targetKind: "concept" as const, targetId: "concept", notePageId: "same-core-page"};
const readingUnit: StructuredReadingUnit = {id: "unit", paperId: "paper", unitKind: "other", title: "Original", body: "Original body",
  provenanceKind: "human_original", epistemicRole: "working_note", revision: 7, evidenceCount: 1, createdAt: "created", updatedAt: "updated"};
const readingDraft: StructuredReadingUnitDraft = {id: "unit", expectedRevision: 7, paperId: " paper\u0000 ",
  unitKind: "other", title: " Original ", body: " Original body\n", epistemicRole: "working_note", anchorId: "anchor", evidenceStance: "context"};
function port(): RuntimeLiteraturePort {
  return {literature: {
    list: vi.fn(async () => [item]), get: vi.fn(async () => item), listDuplicates: vi.fn(async () => []), listMergeOperations: vi.fn(async () => []),
    save: vi.fn(async () => item), updateMetadataField: vi.fn(async () => item), confirmMetadataFields: vi.fn(async () => item), importBibtex: vi.fn(async () => job),
    importPdfs: vi.fn(async () => job), attachPdf: vi.fn(async () => attachment), renameAttachment: vi.fn(async () => undefined),
    removeAttachment: vi.fn(async () => ({fileStatus: "retained" as const, warning: null})), readAttachment: vi.fn(async () => bytes),
    revealAttachments: vi.fn(async () => undefined), saveReadingState: vi.fn(async () => undefined), getReadingState: vi.fn(async () => readingState),
    isAttachmentIndexed: vi.fn(async () => false), indexAttachment: vi.fn(async () => undefined),
    listTrash: vi.fn(async () => [item]), decideDuplicate: vi.fn(async () => undefined), mergeDuplicate: vi.fn(async () => operation),
    undoMerge: vi.fn(async () => undefined), archive: vi.fn(async () => undefined), restore: vi.fn(async () => undefined),
    trash: vi.fn(async () => undefined), trashMany: vi.fn(async () => undefined), restoreTrash: vi.fn(async () => undefined),
    previewDoi: vi.fn(async () => preview), applyMetadataCandidate: vi.fn(async () => item), applyMetadataCandidateFields: vi.fn(async () => item),
    rejectMetadataCandidate: vi.fn(async () => undefined), getImportJob: vi.fn(async () => job), cancelImportJob: vi.fn(async () => undefined),
  }, referenceRecords: {list: vi.fn(async () => [reference]), save: vi.fn(async () => reference)},
  nal: {read: vi.fn(async () => emptyNalState()), mutate: vi.fn(async () => emptyNalState()), ensureAnnotation: vi.fn(async () => annotation)},
  knowledge: {searchConcepts: vi.fn(async () => [concept]), saveConcept: vi.fn(async () => concept),
    listReadingUnits: vi.fn(async () => [readingUnit]), saveReadingUnit: vi.fn(async () => readingUnit)},
  queries: {read: vi.fn(async () => query), save: vi.fn(async () => query)}};
}

const attachmentCalls = [
  {method: "attachPdf", run: (gateway: LiteratureGateway) => gateway.attachPdf(" paper ", " /synthetic 原文.pdf "), args: [" paper ", " /synthetic 原文.pdf "]},
  {method: "renameAttachment", run: (gateway: LiteratureGateway) => gateway.renameAttachment(" paper ", "attachment", " Original\u0000.pdf "), args: [" paper ", "attachment", " Original\u0000.pdf "]},
  {method: "removeAttachment", run: (gateway: LiteratureGateway) => gateway.removeAttachment(" paper ", "attachment"), args: [" paper ", "attachment"]},
  {method: "readAttachment", run: (gateway: LiteratureGateway) => gateway.readAttachment("attachment"), args: ["attachment"]},
  {method: "revealAttachments", run: (gateway: LiteratureGateway) => gateway.revealAttachments(["z", "a", "z"]), args: [["z", "a", "z"]]},
  {method: "saveReadingState", run: (gateway: LiteratureGateway) => gateway.saveReadingState(" paper ", "attachment", readingState), args: [" paper ", "attachment", readingState]},
  {method: "getReadingState", run: (gateway: LiteratureGateway) => gateway.getReadingState(" paper ", "attachment"), args: [" paper ", "attachment"]},
  {method: "isAttachmentIndexed", run: (gateway: LiteratureGateway) => gateway.isAttachmentIndexed("attachment"), args: ["attachment"]},
  {method: "indexAttachment", run: (gateway: LiteratureGateway) => gateway.indexAttachment(" paper ", "attachment", pages), args: [" paper ", "attachment", pages]},
  {method: "importPdfs", run: (gateway: LiteratureGateway) => gateway.importPdfs(candidates), args: [candidates]},
] as const;

it("binds all original attachment and PDF import consumers to the injected owner without rewriting their input", async () => {
  const owner = port(); releases.push(configureLiteratureServices(owner));
  legacy.resolveLiteratureRuntimeGateway.mockImplementation(() => {throw new Error("static gateway must not run");});
  const gateway = getLiteratureGateway(), actual = [];
  for (const call of attachmentCalls) {
    actual.push(await call.run(gateway));
    expect(owner.literature[call.method]).toHaveBeenCalledExactlyOnceWith(...call.args);
  }
  expect(actual).toEqual([attachment, undefined, {fileStatus: "retained", warning: null}, bytes, undefined, undefined, readingState, false, undefined, job]);
  expect(actual[3]).toBe(bytes); expect(actual[6]).toBe(readingState); expect(actual[9]).toBe(job);
  expect(legacy.resolveLiteratureRuntimeGateway).not.toHaveBeenCalled();
});

it("keeps static attachment resolution before activation but refuses every fixed method in an older runtime context", async () => {
  const original = port().literature;
  legacy.resolveLiteratureRuntimeGateway.mockReturnValue(original);
  expect(getLiteratureGateway()).toBe(original);
  releases.push(configureLiteratureServices(undefined));
  const gateway = getLiteratureGateway();
  for (const call of attachmentCalls) {
    await expect(call.run(gateway)).rejects.toMatchObject({code: "literature_gateway_unavailable"});
    expect(original[call.method]).not.toHaveBeenCalled();
  }
  expect(legacy.resolveLiteratureRuntimeGateway).toHaveBeenCalledOnce();
});

it.each(attachmentCalls)("refuses a missing $method on an older supplied port without a static fallback", async call => {
  const owner = port(), original = owner.literature[call.method];
  Reflect.deleteProperty(owner.literature, call.method); releases.push(configureLiteratureServices(owner));
  legacy.resolveLiteratureRuntimeGateway.mockImplementation(() => {throw new Error("static gateway must not run");});
  await expect(call.run(getLiteratureGateway())).rejects.toMatchObject({code: "literature_gateway_unavailable"});
  await expect(getLiteratureGateway().list()).resolves.toEqual([item]);
  expect(original).not.toHaveBeenCalled(); expect(legacy.resolveLiteratureRuntimeGateway).not.toHaveBeenCalled();
});

it("withdraws captured attachment methods without clearing a replacement or abandoning an already accepted byte read", async () => {
  const original = port();
  let resolve!: (value: Uint8Array) => void;
  vi.mocked(original.literature.readAttachment).mockImplementationOnce(() => new Promise(accept => {resolve = accept;}));
  const stop = configureLiteratureServices(original); releases.push(stop);
  const captured = getLiteratureGateway(), accepted = captured.readAttachment("attachment");
  const replacement = port(); releases.push(configureLiteratureServices(replacement)); stop();
  resolve(bytes); await expect(accepted).resolves.toBe(bytes);
  for (const call of attachmentCalls) await expect(call.run(captured)).rejects.toMatchObject({code: "literature_gateway_unavailable"});
  await expect(getLiteratureGateway().readAttachment("attachment")).resolves.toBe(bytes);
  expect(original.literature.readAttachment).toHaveBeenCalledExactlyOnceWith("attachment");
  expect(replacement.literature.readAttachment).toHaveBeenCalledExactlyOnceWith("attachment");
});

it("retains the exact attachment failure and leaves ordinary Note/NAL capabilities separate", async () => {
  const owner = port(), reason = Object.assign(new Error("original attachment failure"), {code: "storage_error", requestId: "request-1"});
  Reflect.deleteProperty(owner.nal, "mutate"); Reflect.deleteProperty(owner.nal, "ensureAnnotation");
  vi.mocked(owner.literature.attachPdf).mockRejectedValueOnce(reason); releases.push(configureLiteratureServices(owner));
  await expect(getLiteratureGateway().attachPdf("paper", "/synthetic.pdf")).rejects.toBe(reason);
  await expect(getNalGateway().mutate({} as never, 1)).rejects.toMatchObject({code: "literature_gateway_unavailable"});
  await expect(getNalGateway().ensureAnnotation({targetKind: "concept", targetId: "concept", title: "Original"}))
    .rejects.toMatchObject({code: "literature_gateway_unavailable"});
});

it("binds the original NAL edit, annotation and concept editor methods without consulting static ports", async () => {
  const owner = port(); releases.push(configureLiteratureServices(owner));
  const mutation = {kind: "set_concept_kind" as const, conceptId: "concept", conceptKind: "relation" as const};
  await expect(getNalGateway().mutate(mutation, 8)).resolves.toEqual(emptyNalState());
  await expect(getNalGateway().ensureAnnotation(annotationRequest)).resolves.toBe(annotation);
  await expect(getResearchKnowledgeGateway().searchConcepts(" Concept\u0000 ")).resolves.toEqual([concept]);
  await expect(getResearchKnowledgeGateway().saveConcept(conceptDraft)).resolves.toEqual(concept);
  expect(owner.nal.mutate).toHaveBeenCalledExactlyOnceWith(mutation, 8);
  expect(owner.nal.ensureAnnotation).toHaveBeenCalledExactlyOnceWith(annotationRequest);
  expect(owner.knowledge.searchConcepts).toHaveBeenCalledExactlyOnceWith(" Concept\u0000 ");
  expect(owner.knowledge.saveConcept).toHaveBeenCalledExactlyOnceWith(conceptDraft);
  await expect(getResearchKnowledgeGateway().listReadingProfiles()).rejects.toMatchObject({code: "literature_gateway_unavailable"});
  expect(legacy.resolveKnowledgeRuntimeGateway).not.toHaveBeenCalled(); expect(legacy.resolveNalRuntimeGateway).not.toHaveBeenCalled();
});

it("binds manual reading-unit list/save to the selected owner without rewriting filters or drafts", async () => {
  const owner = port(); releases.push(configureLiteratureServices(owner));
  const gateway = getResearchKnowledgeGateway();
  await expect(gateway.listReadingUnits(undefined, " paper\u0000 ")).resolves.toEqual([readingUnit]);
  await expect(gateway.listReadingUnits(" project ", undefined)).resolves.toEqual([readingUnit]);
  await expect(gateway.saveReadingUnit(readingDraft)).resolves.toEqual(readingUnit);
  expect(owner.knowledge.listReadingUnits).toHaveBeenNthCalledWith(1, undefined, " paper\u0000 ");
  expect(owner.knowledge.listReadingUnits).toHaveBeenNthCalledWith(2, " project ", undefined);
  expect(owner.knowledge.saveReadingUnit).toHaveBeenCalledExactlyOnceWith(readingDraft);
  expect(legacy.resolveKnowledgeRuntimeGateway).not.toHaveBeenCalled();
  for (const method of ["listReadingProfiles", "listDefinitionClaims", "captureConceptUsage"] as const)
    await expect(Reflect.apply(gateway[method], gateway, [])).rejects.toMatchObject({code: "literature_gateway_unavailable"});
});

it.each([{revision: 0}, {epistemicRole: "assertion"}, {provenanceKind: "legacy_ai"}, {paperId: null},
  {templateField: {portraitCandidateId: "candidate", fieldId: "Invalid field"}}])("retains original strict reading-unit decoding for %j", async invalid => {
  const owner = port(); releases.push(configureLiteratureServices(owner));
  const broken = {...readingUnit, ...invalid} as StructuredReadingUnit;
  vi.mocked(owner.knowledge.listReadingUnits).mockResolvedValueOnce([readingUnit, broken]);
  vi.mocked(owner.knowledge.saveReadingUnit).mockResolvedValueOnce(broken);
  await expect(getResearchKnowledgeGateway().listReadingUnits()).rejects.toThrow("不兼容的研究知识数据");
  await expect(getResearchKnowledgeGateway().saveReadingUnit(readingDraft)).rejects.toThrow("不兼容的研究知识数据");
  expect(owner.knowledge.listReadingUnits).toHaveBeenCalledOnce(); expect(owner.knowledge.saveReadingUnit).toHaveBeenCalledOnce();
});

it("refuses absent or withdrawn reading-unit methods without consulting a replacement or static fallback", async () => {
  const owner = port(), stop = configureLiteratureServices(owner); releases.push(stop);
  const captured = getResearchKnowledgeGateway(), replacement = port();
  releases.push(configureLiteratureServices(replacement)); stop();
  await expect(captured.listReadingUnits()).rejects.toMatchObject({code: "literature_gateway_unavailable"});
  await expect(captured.saveReadingUnit(readingDraft)).rejects.toMatchObject({code: "literature_gateway_unavailable"});
  Reflect.deleteProperty(replacement.knowledge, "listReadingUnits"); Reflect.deleteProperty(replacement.knowledge, "saveReadingUnit");
  await expect(getResearchKnowledgeGateway().listReadingUnits()).rejects.toMatchObject({code: "literature_gateway_unavailable"});
  await expect(getResearchKnowledgeGateway().saveReadingUnit(readingDraft)).rejects.toMatchObject({code: "literature_gateway_unavailable"});
  expect(owner.knowledge.listReadingUnits).not.toHaveBeenCalled(); expect(owner.knowledge.saveReadingUnit).not.toHaveBeenCalled();
  expect(legacy.resolveKnowledgeRuntimeGateway).not.toHaveBeenCalled();
});

it("retains original concept and annotation boundary decoding and refuses mismatched or invalid replies", async () => {
  const owner = port(); releases.push(configureLiteratureServices(owner));
  vi.mocked(owner.knowledge.searchConcepts).mockResolvedValueOnce([{...concept, provenanceKind: "legacy_ai"} as unknown as Concept]);
  vi.mocked(owner.knowledge.saveConcept).mockResolvedValueOnce({...concept, revision: 0});
  await expect(getResearchKnowledgeGateway().searchConcepts("Concept")).rejects.toThrow("不兼容的研究知识数据");
  await expect(getResearchKnowledgeGateway().saveConcept(conceptDraft)).rejects.toThrow("不兼容的研究知识数据");
  vi.mocked(owner.nal.ensureAnnotation).mockResolvedValueOnce({...annotation, targetId: "another-concept"});
  await expect(getNalGateway().ensureAnnotation(annotationRequest)).rejects.toThrow("返回的笔记目标不一致");
  await expect(getNalGateway().ensureAnnotation({...annotationRequest, title: ""})).rejects.toThrow("笔记目标或标题无效");
  expect(owner.nal.ensureAnnotation).toHaveBeenCalledOnce();
});

it("refuses new methods from older contexts and withdraws captured owners without affecting their replacements", async () => {
  const original = port(), stop = configureLiteratureServices(original); releases.push(stop);
  const nal = getNalGateway(), knowledge = getResearchKnowledgeGateway(), current = port();
  releases.push(configureLiteratureServices(current)); stop();
  await expect(nal.mutate({kind: "delete_concept", id: "concept"}, 8)).rejects.toMatchObject({code: "literature_gateway_unavailable"});
  await expect(nal.ensureAnnotation(annotationRequest)).rejects.toMatchObject({code: "literature_gateway_unavailable"});
  await expect(knowledge.searchConcepts("Concept")).rejects.toMatchObject({code: "literature_gateway_unavailable"});
  await expect(knowledge.saveConcept(conceptDraft)).rejects.toMatchObject({code: "literature_gateway_unavailable"});
  await expect(getResearchKnowledgeGateway().saveConcept(conceptDraft)).resolves.toEqual(concept);
  Reflect.deleteProperty(current, "knowledge");
  await expect(getResearchKnowledgeGateway().searchConcepts("Concept")).rejects.toMatchObject({code: "literature_gateway_unavailable"});
  expect(original.knowledge.saveConcept).not.toHaveBeenCalled(); expect(legacy.resolveKnowledgeRuntimeGateway).not.toHaveBeenCalled();
});

it("keeps the original full browser/static knowledge resolver when activation supplies no runtime port", async () => {
  const knownFailure = new Error("Original unrelated reading-unit gateway failure");
  const original: ResearchKnowledgeGateway = {...browserKnowledgeGateway, ...port().knowledge,
    listReadingUnits: vi.fn(async () => {throw knownFailure;})};
  legacy.resolveKnowledgeRuntimeGateway.mockReturnValue(original);
  releases.push(configureLiteratureServices(undefined));
  expect(getResearchKnowledgeGateway()).toBe(original);
  await expect(getResearchKnowledgeGateway().searchConcepts("Concept")).resolves.toEqual([concept]);
  await expect(getResearchKnowledgeGateway().saveConcept(conceptDraft)).resolves.toEqual(concept);
  await expect(getResearchKnowledgeGateway().listReadingUnits("project", "paper")).rejects.toBe(knownFailure);
  expect(original.listReadingUnits).toHaveBeenCalledExactlyOnceWith("project", "paper");
});

it("retains the existing async unavailable knowledge adapter when an older activation has no selected legacy gateway", async () => {
  const reason = Object.assign(new Error("Original missing knowledge gateway"), {code: "literature_gateway_unavailable"});
  legacy.resolveKnowledgeRuntimeGateway.mockImplementation(() => {throw reason;});
  releases.push(configureLiteratureServices(undefined));
  const gateway = getResearchKnowledgeGateway();
  await expect(gateway.searchConcepts("Concept")).rejects.toBe(reason);
  await expect(gateway.listReadingUnits()).rejects.toBe(reason);
});

it("binds the original reference getter to the selected owner and keeps its decoder without consulting static IPC", async () => {
  const owner = port(); releases.push(configureLiteratureServices(owner));
  legacy.resolveReferenceRecordRuntimeGateway.mockImplementation(() => {throw new Error("static references must not run");});
  const gateway = getReferenceRecordGateway();
  await expect(gateway.list(" paper\u0000 ")).resolves.toEqual([reference]);
  await expect(gateway.save(referenceDraft)).resolves.toEqual(reference);
  expect(owner.referenceRecords.list).toHaveBeenCalledExactlyOnceWith(" paper\u0000 ");
  expect(owner.referenceRecords.save).toHaveBeenCalledExactlyOnceWith(referenceDraft);
  expect(legacy.resolveReferenceRecordRuntimeGateway).not.toHaveBeenCalled();
});

it("keeps the original reference decoder's nullable omission and rejects incompatible fields or revisions", async () => {
  const owner = port(); releases.push(configureLiteratureServices(owner));
  vi.mocked(owner.referenceRecords.list)
    .mockResolvedValueOnce([{...reference, usageKind: null} as unknown as ReferenceRecord])
    .mockResolvedValueOnce([{...reference, fields: [{name: "title", value: "Original title", sourceKind: "unknown", confirmedByUser: false}]} as unknown as ReferenceRecord]);
  vi.mocked(owner.referenceRecords.save).mockResolvedValueOnce({...reference, revision: 0});
  const normalized = await getReferenceRecordGateway().list("paper");
  expect(normalized).toEqual([reference]);
  expect(normalized[0]).not.toHaveProperty("usageKind");
  await expect(getReferenceRecordGateway().list("paper")).rejects.toThrow("桌面核心返回了不兼容的参考条目列表");
  await expect(getReferenceRecordGateway().save(referenceDraft)).rejects.toThrow("桌面核心返回了不兼容的参考条目");
  expect(owner.referenceRecords.list).toHaveBeenCalledTimes(2);
  expect(owner.referenceRecords.list).toHaveBeenNthCalledWith(1, "paper");
  expect(owner.referenceRecords.list).toHaveBeenNthCalledWith(2, "paper");
  expect(owner.referenceRecords.save).toHaveBeenCalledExactlyOnceWith(referenceDraft);
});

it("keeps static resolution without activation but refuses both reference methods from an older runtime context", async () => {
  const original = port().referenceRecords;
  legacy.resolveReferenceRecordRuntimeGateway.mockReturnValue(original);
  expect(getReferenceRecordGateway()).toBe(original);
  releases.push(configureLiteratureServices(undefined));
  const gateway = getReferenceRecordGateway();
  await expect(gateway.list("paper")).rejects.toMatchObject({code: "literature_gateway_unavailable"});
  await expect(gateway.save(referenceDraft)).rejects.toMatchObject({code: "literature_gateway_unavailable"});
  expect(legacy.resolveReferenceRecordRuntimeGateway).toHaveBeenCalledOnce();
  expect(original.list).not.toHaveBeenCalled(); expect(original.save).not.toHaveBeenCalled();
});

it("refuses missing reference methods in an older supplied port while retaining its available methods", async () => {
  const owner = port(), save = owner.referenceRecords.save;
  Reflect.deleteProperty(owner.referenceRecords, "save");
  releases.push(configureLiteratureServices(owner));
  await expect(getReferenceRecordGateway().list("paper")).resolves.toEqual([reference]);
  await expect(getReferenceRecordGateway().save(referenceDraft)).rejects.toMatchObject({code: "literature_gateway_unavailable"});
  expect(save).not.toHaveBeenCalled();
  expect(legacy.resolveReferenceRecordRuntimeGateway).not.toHaveBeenCalled();
  Reflect.deleteProperty(owner, "referenceRecords");
  await expect(getReferenceRecordGateway().list("paper")).rejects.toMatchObject({code: "literature_gateway_unavailable"});
});

it("withdraws only the original reference owner, rejects its captured methods and preserves the replacement", async () => {
  const original = port(), stop = configureLiteratureServices(original); releases.push(stop);
  const captured = getReferenceRecordGateway(), current = port(); releases.push(configureLiteratureServices(current));
  stop();
  await expect(captured.list("paper")).rejects.toMatchObject({code: "literature_gateway_unavailable"});
  await expect(captured.save(referenceDraft)).rejects.toMatchObject({code: "literature_gateway_unavailable"});
  await expect(getReferenceRecordGateway().list("paper")).resolves.toEqual([reference]);
  await expect(getReferenceRecordGateway().save(referenceDraft)).resolves.toEqual(reference);
  expect(original.referenceRecords.list).not.toHaveBeenCalled(); expect(original.referenceRecords.save).not.toHaveBeenCalled();
  expect(current.referenceRecords.list).toHaveBeenCalledExactlyOnceWith("paper");
  expect(current.referenceRecords.save).toHaveBeenCalledExactlyOnceWith(referenceDraft);
  expect(legacy.resolveReferenceRecordRuntimeGateway).not.toHaveBeenCalled();
});

it("uses the injected owner for startup, DOI confirmation, rejection and task refresh without resolving static IPC", async () => {
  const owner = port(); releases.push(configureLiteratureServices(owner));
  legacy.resolveLiteratureRuntimeGateway.mockImplementation(() => {throw new Error("static gateway must not run");});
  const gateway = getLiteratureGateway();
  await expect(gateway.list()).resolves.toEqual([item]); await expect(gateway.get("paper")).resolves.toEqual(item);
  await gateway.listDuplicates(); await gateway.listMergeOperations();
  await expect(gateway.previewDoi("10.1000/test")).resolves.toBe(preview);
  await gateway.applyMetadataCandidate(preview.id, preview.draft);
  await gateway.applyMetadataCandidateFields(preview.id, [], "trusted");
  await gateway.rejectMetadataCandidate(preview.id);
  await expect(gateway.getImportJob("job")).resolves.toBe(job); await gateway.cancelImportJob("job");
  await expect(getNalGateway().read()).resolves.toEqual(emptyNalState());
  await expect(getNalQueryGateway().read()).resolves.toEqual(query);
  await getNalQueryGateway().save({definitions: [], cache: null, legacyImported: true}, 1);
  expect(owner.literature.previewDoi).toHaveBeenCalledExactlyOnceWith("10.1000/test");
  expect(owner.literature.applyMetadataCandidate).toHaveBeenCalledExactlyOnceWith("candidate", item);
  expect(owner.queries.save).toHaveBeenCalledExactlyOnceWith({definitions: [], cache: null, legacyImported: true}, 1);
  expect(legacy.resolveLiteratureRuntimeGateway).not.toHaveBeenCalled();
  expect(legacy.resolveNalRuntimeGateway).not.toHaveBeenCalled(); expect(legacy.resolveNalQueryRuntimeGateway).not.toHaveBeenCalled();
  await expect(gateway.setProjects(item.id, [])).rejects.toMatchObject({code: "literature_gateway_unavailable"});
});

it("uses the same owner for manual save, field editing, confirmation and BibTeX input without a static resolver", async () => {
  const owner = port(); releases.push(configureLiteratureServices(owner));
  legacy.resolveLiteratureRuntimeGateway.mockImplementation(() => {throw new Error("static gateway must not run");});
  const gateway = getLiteratureGateway(), patch = {fieldName: "issuedYear" as const, value: null};
  const fieldNames = ["title", "title"], drafts = [{...item, rawBibtex: "@article{original}", tags: ["a", "a"]}];
  await expect(gateway.save(item)).resolves.toBe(item);
  await expect(gateway.updateMetadataField(item.id, patch)).resolves.toBe(item);
  await expect(gateway.confirmMetadataFields(item.id, fieldNames)).resolves.toBe(item);
  await expect(gateway.importBibtex(drafts)).resolves.toBe(job);
  expect(owner.literature.save).toHaveBeenCalledExactlyOnceWith(item);
  expect(owner.literature.updateMetadataField).toHaveBeenCalledExactlyOnceWith(item.id, patch);
  expect(owner.literature.confirmMetadataFields).toHaveBeenCalledExactlyOnceWith(item.id, fieldNames);
  expect(owner.literature.importBibtex).toHaveBeenCalledExactlyOnceWith(drafts);
  expect(legacy.resolveLiteratureRuntimeGateway).not.toHaveBeenCalled();
});

it("uses the injected owner for all original duplicate and recycle actions without changing arguments or resolving static IPC", async () => {
  const owner = port(); releases.push(configureLiteratureServices(owner));
  legacy.resolveLiteratureRuntimeGateway.mockImplementation(() => {throw new Error("static gateway must not run");});
  const gateway = getLiteratureGateway(), ids = ["z", "a", "z"];
  await expect(gateway.listTrash(" query ")).resolves.toEqual([item]);
  await gateway.decideDuplicate("candidate", "keep_both");
  await expect(gateway.mergeDuplicate("candidate", "survivor")).resolves.toBe(operation);
  await gateway.undoMerge("merge-1");
  await gateway.archive("paper"); await gateway.restore("paper"); await gateway.trash("paper");
  await gateway.trashMany(ids); await gateway.restoreTrash("paper");
  expect(owner.literature.listTrash).toHaveBeenCalledExactlyOnceWith(" query ");
  expect(owner.literature.decideDuplicate).toHaveBeenCalledExactlyOnceWith("candidate", "keep_both");
  expect(owner.literature.mergeDuplicate).toHaveBeenCalledExactlyOnceWith("candidate", "survivor");
  expect(owner.literature.undoMerge).toHaveBeenCalledExactlyOnceWith("merge-1");
  for (const method of ["archive", "restore", "trash", "restoreTrash"] as const) expect(owner.literature[method]).toHaveBeenCalledExactlyOnceWith("paper");
  expect(owner.literature.trashMany).toHaveBeenCalledExactlyOnceWith(ids);
  expect(legacy.resolveLiteratureRuntimeGateway).not.toHaveBeenCalled();
  await expect(gateway.setProjects(item.id, [])).rejects.toMatchObject({code: "literature_gateway_unavailable"});
});

it("an older context keeps browsing available but finite input and management calls never fall back to old writes", async () => {
  const old = {list: vi.fn(async () => [item]), previewDoi: vi.fn(async () => preview), getImportJob: vi.fn(async () => job),
    save: vi.fn(), updateMetadataField: vi.fn(), confirmMetadataFields: vi.fn(), importBibtex: vi.fn(),
    listTrash: vi.fn(), archive: vi.fn()} as unknown as LiteratureGateway;
  legacy.resolveLiteratureRuntimeGateway.mockReturnValue(old);
  expect(getLiteratureGateway()).toBe(old);
  releases.push(configureLiteratureServices(undefined));
  const gateway = getLiteratureGateway();
  await expect(gateway.list()).resolves.toEqual([item]);
  await expect(gateway.previewDoi("doi")).rejects.toMatchObject({code: "literature_gateway_unavailable"});
  await expect(gateway.applyMetadataCandidate("candidate", item)).rejects.toMatchObject({code: "literature_gateway_unavailable"});
  await expect(gateway.applyMetadataCandidateFields("candidate", [], "trusted")).rejects.toMatchObject({code: "literature_gateway_unavailable"});
  await expect(gateway.rejectMetadataCandidate("candidate")).rejects.toMatchObject({code: "literature_gateway_unavailable"});
  await expect(gateway.getImportJob("job")).rejects.toMatchObject({code: "literature_gateway_unavailable"});
  await expect(gateway.cancelImportJob("job")).rejects.toMatchObject({code: "literature_gateway_unavailable"});
  await expect(gateway.save(item)).rejects.toMatchObject({code: "literature_gateway_unavailable"});
  await expect(gateway.updateMetadataField(item.id, {fieldName: "title", value: "Changed"})).rejects.toMatchObject({code: "literature_gateway_unavailable"});
  await expect(gateway.confirmMetadataFields(item.id, [])).rejects.toMatchObject({code: "literature_gateway_unavailable"});
  await expect(gateway.importBibtex([item])).rejects.toMatchObject({code: "literature_gateway_unavailable"});
  await expect(gateway.listTrash()).rejects.toMatchObject({code: "literature_gateway_unavailable"});
  await expect(gateway.decideDuplicate("candidate", "dismiss")).rejects.toMatchObject({code: "literature_gateway_unavailable"});
  await expect(gateway.mergeDuplicate("candidate", "survivor")).rejects.toMatchObject({code: "literature_gateway_unavailable"});
  await expect(gateway.undoMerge("merge-1")).rejects.toMatchObject({code: "literature_gateway_unavailable"});
  for (const method of ["archive", "restore", "trash", "restoreTrash"] as const)
    await expect(gateway[method]("paper")).rejects.toMatchObject({code: "literature_gateway_unavailable"});
  await expect(gateway.trashMany(["paper"])).rejects.toMatchObject({code: "literature_gateway_unavailable"});
  expect(old.previewDoi).not.toHaveBeenCalled(); expect(old.getImportJob).not.toHaveBeenCalled();
  expect(old.save).not.toHaveBeenCalled(); expect(old.updateMetadataField).not.toHaveBeenCalled();
  expect(old.confirmMetadataFields).not.toHaveBeenCalled(); expect(old.importBibtex).not.toHaveBeenCalled();
  expect(old.listTrash).not.toHaveBeenCalled(); expect(old.archive).not.toHaveBeenCalled();
});

it("stops new duplicate and recycle work, including expiry cleanup, when the original owner is withdrawn", async () => {
  const owner = port(), stop = configureLiteratureServices(owner); releases.push(stop);
  const gateway = getLiteratureGateway(); stop();
  await expect(gateway.listTrash()).rejects.toMatchObject({code: "literature_gateway_unavailable"});
  await expect(gateway.decideDuplicate("candidate", "dismiss")).rejects.toMatchObject({code: "literature_gateway_unavailable"});
  await expect(gateway.mergeDuplicate("candidate", "survivor")).rejects.toMatchObject({code: "literature_gateway_unavailable"});
  await expect(gateway.undoMerge("merge-1")).rejects.toMatchObject({code: "literature_gateway_unavailable"});
  for (const method of ["archive", "restore", "trash", "restoreTrash"] as const)
    await expect(gateway[method]("paper")).rejects.toMatchObject({code: "literature_gateway_unavailable"});
  await expect(gateway.trashMany(["paper"])).rejects.toMatchObject({code: "literature_gateway_unavailable"});
  for (const method of ["listTrash", "decideDuplicate", "mergeDuplicate", "undoMerge", "archive", "restore", "trash", "trashMany", "restoreTrash"] as const)
    expect(owner.literature[method]).not.toHaveBeenCalled();
});

it("withdraws only the same owner and does not revive old captured ports or clear a replacement", async () => {
  const old = port(), stopOld = configureLiteratureServices(old); releases.push(stopOld);
  const captured = getLiteratureGateway();
  const current = port(); releases.push(configureLiteratureServices(current));
  stopOld();
  await expect(captured.previewDoi("old")).rejects.toMatchObject({code: "literature_gateway_unavailable"});
  await expect(captured.save(item)).rejects.toMatchObject({code: "literature_gateway_unavailable"});
  await expect(captured.updateMetadataField(item.id, {fieldName: "title", value: "Changed"})).rejects.toMatchObject({code: "literature_gateway_unavailable"});
  await expect(captured.confirmMetadataFields(item.id, [])).rejects.toMatchObject({code: "literature_gateway_unavailable"});
  await expect(captured.importBibtex([item])).rejects.toMatchObject({code: "literature_gateway_unavailable"});
  await expect(getLiteratureGateway().previewDoi("current")).resolves.toBe(preview);
  expect(old.literature.previewDoi).not.toHaveBeenCalled();
  expect(old.literature.save).not.toHaveBeenCalled(); expect(old.literature.updateMetadataField).not.toHaveBeenCalled();
  expect(old.literature.confirmMetadataFields).not.toHaveBeenCalled(); expect(old.literature.importBibtex).not.toHaveBeenCalled();
  expect(current.literature.previewDoi).toHaveBeenCalledExactlyOnceWith("current");
});

it("rejects a new method missing from an older supplied port without breaking its original methods or falling back", async () => {
  const owner = port(), save = owner.literature.save;
  // Simulate the actual JavaScript shape supplied by an older host.
  Reflect.deleteProperty(owner.literature, "save");
  releases.push(configureLiteratureServices(owner));
  legacy.resolveLiteratureRuntimeGateway.mockImplementation(() => {throw new Error("static gateway must not run");});
  const gateway = getLiteratureGateway();
  await expect(gateway.save(item)).rejects.toMatchObject({code: "literature_gateway_unavailable"});
  await expect(gateway.list()).resolves.toEqual([item]);
  await expect(gateway.previewDoi("doi")).resolves.toBe(preview);
  expect(save).not.toHaveBeenCalled();
  expect(owner.literature.list).toHaveBeenCalledExactlyOnceWith();
  expect(owner.literature.previewDoi).toHaveBeenCalledExactlyOnceWith("doi");
  expect(legacy.resolveLiteratureRuntimeGateway).not.toHaveBeenCalled();
});

it("the original request rejects its late candidate once after owner disposal without reopening or dispatching new work", async () => {
  let resolve: (value: MetadataPreview) => void = () => {throw new Error("Fixture not initialized");};
  const pending = new Promise<MetadataPreview>(accept => {resolve = accept;});
  let enter: () => void = () => {throw new Error("Fixture not initialized");};
  const entered = new Promise<void>(accept => {enter = accept;});
  let clean: () => void = () => {throw new Error("Fixture not initialized");};
  const cleaned = new Promise<void>(accept => {clean = accept;});
  const owner = port();
  owner.literature.previewDoi = vi.fn(async () => {enter(); return pending;});
  owner.literature.rejectMetadataCandidate = vi.fn(async () => {clean();});
  const stop = configureLiteratureServices(owner); releases.push(stop);
  const gateway = getLiteratureGateway(), cleanupError = vi.fn(), request = new DoiPreviewRequest(gateway, vi.fn(), cleanupError);
  const result = request.load("doi"); await entered;
  request.cancel(); stop();
  expect(await result).toBeUndefined();
  await expect(gateway.previewDoi("new")).rejects.toMatchObject({code: "literature_gateway_unavailable"});
  resolve(preview); await cleaned;
  expect(owner.literature.rejectMetadataCandidate).toHaveBeenCalledExactlyOnceWith(preview.id);
  await expect(gateway.rejectMetadataCandidate(preview.id)).rejects.toMatchObject({code: "literature_gateway_unavailable"});
  await expect(gateway.rejectMetadataCandidate("unobserved")).rejects.toMatchObject({code: "literature_gateway_unavailable"});
  expect(cleanupError).not.toHaveBeenCalled();
  expect(owner.literature.previewDoi).toHaveBeenCalledExactlyOnceWith("doi", undefined);
});

it("keeps reflection and Promise resolution ordinary while unsupported business calls still reject", async () => {
  releases.push(configureLiteratureServices(port()));
  const gateway = getLiteratureGateway();
  expect(Reflect.get(gateway, "then")).toBeUndefined();
  expect(Reflect.get(gateway, "toJSON")).toBeUndefined();
  expect(Reflect.get(gateway, Symbol.toStringTag)).toBeUndefined();
  expect(await Promise.resolve(gateway)).toBe(gateway);
  expect(Object.prototype.toString.call(gateway)).toBe("[object Object]");
  await expect(gateway.setProjects(item.id, [])).rejects.toMatchObject({code: "literature_gateway_unavailable"});
});

it("binds human capture to the selected owner and decodes the original optional result fields", async () => {
  const draft = {termText: " Human Ω ", anchorId: "anchor", usageText: " Source usage ", resolution: {kind: "unresolved" as const}};
  const source = {paperId: "paper", paperTitle: "Synthetic capture", attachmentId: "pdf", contentSha256: "a".repeat(64), pageIndex: 0, quoteExact: "Source quote"};
  const result = {term, usage: {...source, id: "usage", term, anchorId: "anchor", usageText: "Source usage", provenanceKind: "human_original" as const, revision: 1, createdAt: "created", updatedAt: "updated"}};
  const capture = vi.fn(async () => result);
  const original = port();
  const owner = {...original, knowledge: {...original.knowledge, captureConceptUsage: capture}};
  const release = configureLiteratureServices(owner); releases.push(release);
  const gateway = getResearchKnowledgeGateway();
  await expect(gateway.captureConceptUsage(draft, source)).resolves.toEqual(result);
  expect(capture).toHaveBeenCalledExactlyOnceWith(draft, source);
  expect(legacy.resolveKnowledgeRuntimeGateway).not.toHaveBeenCalled();
  const failure = Object.assign(new Error("Original capture error"), {code: "storage_error", requestId: "capture-request"});
  capture.mockRejectedValueOnce(failure);
  await expect(gateway.captureConceptUsage(draft, source)).rejects.toBe(failure);
  capture.mockResolvedValueOnce({...result, usage: {...result.usage, revision: 0}});
  await expect(gateway.captureConceptUsage(draft, source)).rejects.toThrow("不兼容的研究知识数据");
  let finish: ((value: typeof result) => void) | undefined;
  capture.mockImplementationOnce(() => new Promise(resolve => {finish = resolve;}));
  const accepted = gateway.captureConceptUsage(draft, source);
  release();
  if (finish === undefined) throw new Error("capture was not accepted before disposal");
  finish(result);
  await expect(accepted).resolves.toEqual(result);
  await expect(gateway.captureConceptUsage(draft, source)).rejects.toMatchObject({code: "literature_gateway_unavailable"});
  expect(capture).toHaveBeenCalledTimes(4);
});


it("routes manual definitions and original history with strict decoding, errors and owner disposal", async () => {
  const draft = {id: "definition", expectedRevision: 1, conceptId: "old-concept", statement: " Definition Ω ", scopeNote: " Scope ", changeReason: " exact reason "};
  const definition = {id: "definition", conceptId: "old-concept", statement: "Definition Ω", scopeNote: "Scope", provenanceKind: "human_original" as const, epistemicRole: "definition" as const, revision: 2, evidenceCount: 1, createdAt: "created", updatedAt: "updated"};
  const history = [{id: "revision", objectKind: "definition_claim" as const, objectId: definition.id, revision: 2, snapshot: {statement: definition.statement}, editorKind: "human" as const, changeReason: " exact reason ", createdAt: "created"}];
  const save = vi.fn(async () => definition), list = vi.fn(async () => [definition]), revisions = vi.fn(async () => history);
  const original = port();
  const owner = {...original, knowledge: {...original.knowledge, saveDefinitionClaim: save, listDefinitionClaims: list, listRevisions: revisions}};
  const release = configureLiteratureServices(owner); releases.push(release);
  const gateway = getResearchKnowledgeGateway();
  await expect(gateway.saveDefinitionClaim(draft)).resolves.toEqual(definition);
  await expect(gateway.listDefinitionClaims(" old-concept ")).resolves.toEqual([definition]);
  await expect(gateway.listRevisions("definition_claim", " definition ")).resolves.toEqual(history);
  expect(save).toHaveBeenCalledExactlyOnceWith(draft);
  expect(list).toHaveBeenCalledExactlyOnceWith(" old-concept ");
  expect(revisions).toHaveBeenCalledExactlyOnceWith("definition_claim", " definition ");
  const error = Object.assign(new Error("Original definition conflict"), {code: "revision_conflict", currentRevision: 3, requestId: "definition-request"});
  save.mockRejectedValueOnce(error);
  await expect(gateway.saveDefinitionClaim(draft)).rejects.toBe(error);
  save.mockResolvedValueOnce({...definition, revision: 0});
  await expect(gateway.saveDefinitionClaim(draft)).rejects.toThrow("不兼容的研究知识数据");
  list.mockResolvedValueOnce([{...definition, evidenceCount: -1}]);
  await expect(gateway.listDefinitionClaims("old-concept")).rejects.toThrow("不兼容的研究知识数据");
  revisions.mockResolvedValueOnce([{...history[0]!, revision: 0}]);
  await expect(gateway.listRevisions("definition_claim", "definition")).rejects.toThrow("不兼容的研究知识数据");
  let finish: ((value: typeof definition) => void) | undefined;
  save.mockImplementationOnce(() => new Promise(resolve => {finish = resolve;}));
  const accepted = gateway.saveDefinitionClaim(draft);
  release();
  if (finish === undefined) throw new Error("definition was not accepted before disposal");
  finish(definition);
  await expect(accepted).resolves.toEqual(definition);
  await expect(gateway.saveDefinitionClaim(draft)).rejects.toMatchObject({code: "literature_gateway_unavailable"});
  await expect(gateway.listDefinitionClaims("old-concept")).rejects.toMatchObject({code: "literature_gateway_unavailable"});
  await expect(gateway.listRevisions("definition_claim", "definition")).rejects.toMatchObject({code: "literature_gateway_unavailable"});
  expect(legacy.resolveKnowledgeRuntimeGateway).not.toHaveBeenCalled();
});
