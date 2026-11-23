import {createResearchExportGateway} from "./researchExportTransport";
import type {DerivedResearchViewGateway, EvidenceGateway, EvidenceMatrixGateway, LiteratureGateway, ReferenceRecordGateway, ResearchKnowledgeGateway, ResearchExportGateway} from "@research-assistant/data/literature";
import type {NalGateway, NalQueryGateway} from "@research-assistant/data/nal";
import type {RuntimeLiteraturePort} from "@research-assistant/workbench-sdk/literature-runtime";
import {decodeEvidenceList, decodeClaim, decodeSourceAnchorSummary, decodeEvidenceLink} from "./evidenceDecoders";
import {decodeEvidenceMatrix, decodeEvidenceMatrices, decodeEvidenceMatrixCell, decodeEvidenceMatrixCells} from "./evidenceMatrixDecoders";
import {decodeReferenceRecord, decodeReferenceRecords} from "./referenceRecordDecoders";
import {decodeConcept, decodeConceptMergeImpact, decodeConceptIdentityEvent, decodeConceptCaptureResult, decodeDefinitionClaim, decodeRelationNode, decodeRelationAssertion, decodeResearchObjectRevision, decodeList, decodeReadingUnit} from "./knowledgeDecoders";
import {decodeNalAnnotationResponse, validateNalAnnotationRequest} from "./transportValidation";

import {decodeConceptAlgorithmRun} from "./conceptAlgorithmDecoders";
import {decodeDerivedResearchView, decodeDerivedResearchViews} from "./derivedViewDecoders";

interface RuntimeBinding {
  active: boolean;
  readonly configured: boolean;
  legacy?: () => LiteratureGateway;
  readonly literature: LiteratureGateway;
  readonly researchExport: ResearchExportGateway;
  readonly evidence: EvidenceGateway;
  readonly evidenceMatrix: EvidenceMatrixGateway;
  readonly derivedViews: DerivedResearchViewGateway;
  readonly referenceRecords: ReferenceRecordGateway;
  readonly nal: NalGateway;
  readonly knowledge: ResearchKnowledgeGateway;
  readonly queries: NalQueryGateway;
}
let selected: RuntimeBinding | undefined;
const ownedMethods = new Set<PropertyKey>(["save", "updateMetadataField", "confirmMetadataFields", "importBibtex",
  "decideDuplicate", "mergeDuplicate", "undoMerge", "archive", "restore", "trash", "trashMany", "restoreTrash", "listTrash",
  "previewDoi", "applyMetadataCandidate", "applyMetadataCandidateFields",
  "rejectMetadataCandidate", "getImportJob", "cancelImportJob", "importPdfs", "attachPdf", "renameAttachment",
  "removeAttachment", "readAttachment", "revealAttachments", "saveReadingState", "getReadingState",
  "isAttachmentIndexed", "indexAttachment"]);
const reflectionKeys = new Set(["then", "toJSON", "toString", "valueOf", "inspect"]);

function unavailable(method: string): never {
  throw Object.assign(new Error(`literature_gateway_unavailable：当前文献运行时尚未接入 ${method}。`), {code: "literature_gateway_unavailable"});
}

/** One activating package owns this binding. Missing calls never use static IPC.
 * Other workspaces and the ordinary static composition retain their original ports. */
export function configureLiteratureServices(port: RuntimeLiteraturePort | undefined): () => void {
  const unsettledPreviews = new Set<string>();
  function invoke<K extends keyof RuntimeLiteraturePort["literature"]>(method: K,
    args: Parameters<RuntimeLiteraturePort["literature"][K]>): ReturnType<RuntimeLiteraturePort["literature"][K]> {
    if (!binding.active || !port || typeof port.literature[method] !== "function")
      return Promise.resolve().then(() => unavailable(method)) as ReturnType<RuntimeLiteraturePort["literature"][K]>;
    // Each fixed member retains its original argument/return declaration. The
    // proxy only dispatches those names and exposes no transport selector.
    return Reflect.apply(port.literature[method], port.literature, args) as ReturnType<RuntimeLiteraturePort["literature"][K]>;
  }
  const methods: RuntimeLiteraturePort["literature"] = {
    list: (...args) => invoke("list", args), get: (...args) => invoke("get", args),
    save: (...args) => invoke("save", args), updateMetadataField: (...args) => invoke("updateMetadataField", args),
    confirmMetadataFields: (...args) => invoke("confirmMetadataFields", args), importBibtex: (...args) => invoke("importBibtex", args),
    importPdfs: (...args) => invoke("importPdfs", args), attachPdf: (...args) => invoke("attachPdf", args),
    renameAttachment: (...args) => invoke("renameAttachment", args), removeAttachment: (...args) => invoke("removeAttachment", args),
    readAttachment: (...args) => invoke("readAttachment", args), revealAttachments: (...args) => invoke("revealAttachments", args),
    saveReadingState: (...args) => invoke("saveReadingState", args), getReadingState: (...args) => invoke("getReadingState", args),
    isAttachmentIndexed: (...args) => invoke("isAttachmentIndexed", args), indexAttachment: (...args) => invoke("indexAttachment", args),
    listDuplicates: (...args) => invoke("listDuplicates", args), listMergeOperations: (...args) => invoke("listMergeOperations", args),
    decideDuplicate: (...args) => invoke("decideDuplicate", args), mergeDuplicate: (...args) => invoke("mergeDuplicate", args),
    undoMerge: (...args) => invoke("undoMerge", args), archive: (...args) => invoke("archive", args), restore: (...args) => invoke("restore", args),
    trash: (...args) => invoke("trash", args), trashMany: (...args) => invoke("trashMany", args),
    restoreTrash: (...args) => invoke("restoreTrash", args), listTrash: (...args) => invoke("listTrash", args),
    previewDoi: async (...args) => {
      const preview = await invoke("previewDoi", args);
      unsettledPreviews.add(preview.id); return preview;
    },
    applyMetadataCandidate: async (...args) => {
      const item = await invoke("applyMetadataCandidate", args);
      unsettledPreviews.delete(args[0]); return item;
    },
    applyMetadataCandidateFields: async (...args) => {
      const item = await invoke("applyMetadataCandidateFields", args);
      unsettledPreviews.delete(args[0]); return item;
    },
    rejectMetadataCandidate: candidateId => {
      const accepted = unsettledPreviews.delete(candidateId);
      return !binding.active && accepted && port ? port.literature.rejectMetadataCandidate(candidateId)
        : invoke("rejectMetadataCandidate", [candidateId]);
    },
    getImportJob: (...args) => invoke("getImportJob", args), cancelImportJob: (...args) => invoke("cancelImportJob", args),
  };
  const literature = new Proxy(methods as LiteratureGateway, {get(target, key) {
    if (typeof key !== "string" || reflectionKeys.has(key)) return Reflect.get(target, key);
    if (!port && !ownedMethods.has(key) && binding.legacy) {
      const original = binding.legacy(), value: unknown = Reflect.get(original, key);
      return typeof value === "function" ? value.bind(original) : value;
    }
    if (Object.hasOwn(target, key)) return Reflect.get(target, key);
    return async () => unavailable(String(key));
  }});
  const evidence: EvidenceGateway = {
    async listClaims(projectId) {
      if (!binding.active || typeof port?.evidence?.listClaims !== "function") unavailable("evidence.listClaims");
      const result = decodeEvidenceList(await port.evidence.listClaims(projectId), decodeClaim);
      if (result === undefined) throw new Error("桌面核心返回了不兼容的观点列表"); return result;
    },
    async listSources(projectId) {
      if (!binding.active || typeof port?.evidence?.listSources !== "function") unavailable("evidence.listSources");
      const result = decodeEvidenceList(await port.evidence.listSources(projectId), decodeSourceAnchorSummary);
      if (result === undefined) throw new Error("桌面核心返回了不兼容的原文来源列表"); return result;
    },
    async listClaimEvidence(claimId) {
      if (!binding.active || typeof port?.evidence?.listClaimEvidence !== "function") unavailable("evidence.listClaimEvidence");
      const result = decodeEvidenceList(await port.evidence.listClaimEvidence(claimId), decodeEvidenceLink);
      if (result === undefined) throw new Error("桌面核心返回了不兼容的观点证据列表"); return result;
    },
    async saveClaim(draft) {
      if (!binding.active || typeof port?.evidence?.saveClaim !== "function") unavailable("evidence.saveClaim");
      const result = decodeClaim(await port.evidence.saveClaim(draft));
      if (result === undefined) throw new Error("桌面核心返回了不兼容的观点"); return result;
    },
    async linkEvidence(draft) {
      if (!binding.active || typeof port?.evidence?.linkEvidence !== "function") unavailable("evidence.linkEvidence");
      const result = decodeEvidenceLink(await port.evidence.linkEvidence(draft));
      if (result === undefined) throw new Error("桌面核心返回了不兼容的证据关联"); return result;
    },
    async createClaimWithEvidence(claim, evidence) {
      if (!binding.active || typeof port?.evidence?.createClaimWithEvidence !== "function") unavailable("evidence.createClaimWithEvidence");
      const result = decodeClaim(await port.evidence.createClaimWithEvidence(claim, evidence));
      if (result === undefined) throw new Error("桌面核心返回了不兼容的观点"); return result;
    },
  };
  const evidenceMatrix: EvidenceMatrixGateway = {
    async list(projectId) {
      if (!binding.active || typeof port?.evidenceMatrix?.list !== "function") unavailable("evidenceMatrix.list");
      const result = decodeEvidenceMatrices(await port.evidenceMatrix.list(projectId));
      if (result === undefined) throw new Error("桌面核心返回了不兼容的证据矩阵列表"); return result;
    },
    async save(draft) {
      if (!binding.active || typeof port?.evidenceMatrix?.save !== "function") unavailable("evidenceMatrix.save");
      const result = decodeEvidenceMatrix(await port.evidenceMatrix.save(draft));
      if (result === undefined) throw new Error("桌面核心返回了不兼容的证据矩阵"); return result;
    },
    async listCells(matrixId) {
      if (!binding.active || typeof port?.evidenceMatrix?.listCells !== "function") unavailable("evidenceMatrix.listCells");
      const result = decodeEvidenceMatrixCells(await port.evidenceMatrix.listCells(matrixId));
      if (result === undefined) throw new Error("桌面核心返回了不兼容的矩阵单元列表"); return result;
    },
    async saveCell(draft) {
      if (!binding.active || typeof port?.evidenceMatrix?.saveCell !== "function") unavailable("evidenceMatrix.saveCell");
      const result = decodeEvidenceMatrixCell(await port.evidenceMatrix.saveCell(draft));
      if (result === undefined) throw new Error("桌面核心返回了不兼容的矩阵单元"); return result;
    },
  };
  const derivedViews: DerivedResearchViewGateway = {
    async list(projectId) {
      if (!binding.active || typeof port?.derivedViews?.list !== "function") unavailable("derivedViews.list");
      const result = decodeDerivedResearchViews(await port.derivedViews.list(projectId));
      if (result === undefined) throw new Error("桌面核心返回了不兼容的派生视图列表"); return result;
    },
    async save(draft) {
      if (!binding.active || typeof port?.derivedViews?.save !== "function") unavailable("derivedViews.save");
      const result = decodeDerivedResearchView(await port.derivedViews.save(draft));
      if (result === undefined) throw new Error("桌面核心返回了不兼容的派生视图"); return result;
    },
  };
  const referenceRecords: ReferenceRecordGateway = {
    async list(paperId) {
      if (!binding.active || !port || typeof port.referenceRecords?.list !== "function") unavailable("referenceRecords.list");
      const decoded = decodeReferenceRecords(await port.referenceRecords.list(paperId));
      if (decoded === undefined) throw new Error("桌面核心返回了不兼容的参考条目列表");
      return decoded;
    },
    async save(draft) {
      if (!binding.active || !port || typeof port.referenceRecords?.save !== "function") unavailable("referenceRecords.save");
      const decoded = decodeReferenceRecord(await port.referenceRecords.save(draft));
      if (decoded === undefined) throw new Error("桌面核心返回了不兼容的参考条目");
      return decoded;
    },
  };
  const knowledgeMethods: RuntimeLiteraturePort["knowledge"] = {
    async analyzeSharedFoundations(draft) {
      if (!binding.active || !port || typeof port.knowledge?.analyzeSharedFoundations !== "function") unavailable("knowledge.analyzeSharedFoundations");
      const decoded = decodeConceptAlgorithmRun(await port.knowledge.analyzeSharedFoundations(draft));
      if (decoded === undefined) throw new Error("桌面核心返回了不兼容的概念算法数据");
      return decoded;
    },
    async analyzeConceptEvolution(conceptId) {
      if (!binding.active || !port || typeof port.knowledge?.analyzeConceptEvolution !== "function") unavailable("knowledge.analyzeConceptEvolution");
      const decoded = decodeConceptAlgorithmRun(await port.knowledge.analyzeConceptEvolution(conceptId));
      if (decoded === undefined) throw new Error("桌面核心返回了不兼容的概念算法数据");
      return decoded;
    },
    async getConceptAlgorithmRun(runId) {
      if (!binding.active || !port || typeof port.knowledge?.getConceptAlgorithmRun !== "function") unavailable("knowledge.getConceptAlgorithmRun");
      const decoded = decodeConceptAlgorithmRun(await port.knowledge.getConceptAlgorithmRun(runId));
      if (decoded === undefined) throw new Error("桌面核心返回了不兼容的概念算法数据");
      return decoded;
    },
    async previewConceptMerge(draft) {
      if (!binding.active || !port || typeof port.knowledge?.previewConceptMerge !== "function") unavailable("knowledge.previewConceptMerge");
      const decoded = decodeConceptMergeImpact(await port.knowledge.previewConceptMerge(draft));
      if (decoded === undefined) throw new Error("桌面核心返回了不兼容的研究知识数据；本次结果未被采用。");
      return decoded;
    },
    async mergeConcepts(draft) {
      if (!binding.active || !port || typeof port.knowledge?.mergeConcepts !== "function") unavailable("knowledge.mergeConcepts");
      const decoded = decodeConceptIdentityEvent(await port.knowledge.mergeConcepts(draft));
      if (decoded === undefined) throw new Error("桌面核心返回了不兼容的研究知识数据；本次结果未被采用。");
      return decoded;
    },
    async splitConcepts(draft) {
      if (!binding.active || !port || typeof port.knowledge?.splitConcepts !== "function") unavailable("knowledge.splitConcepts");
      const decoded = decodeConceptIdentityEvent(await port.knowledge.splitConcepts(draft));
      if (decoded === undefined) throw new Error("桌面核心返回了不兼容的研究知识数据；本次结果未被采用。");
      return decoded;
    },
    async listConceptIdentityEvents() {
      if (!binding.active || !port || typeof port.knowledge?.listConceptIdentityEvents !== "function") unavailable("knowledge.listConceptIdentityEvents");
      const decoded = decodeList(await port.knowledge.listConceptIdentityEvents(), decodeConceptIdentityEvent);
      if (decoded === undefined) throw new Error("桌面核心返回了不兼容的研究知识数据；本次结果未被采用。");
      return decoded;
    },
    async searchConcepts(query) {
      if (!binding.active || !port || typeof port.knowledge?.searchConcepts !== "function") unavailable("knowledge.searchConcepts");
      const decoded = decodeList(await port.knowledge.searchConcepts(query), decodeConcept);
      if (decoded === undefined) throw new Error("桌面核心返回了不兼容的研究知识数据；本次结果未被采用。");
      return decoded;
    },
    async saveConcept(draft) {
      if (!binding.active || !port || typeof port.knowledge?.saveConcept !== "function") unavailable("knowledge.saveConcept");
      const decoded = decodeConcept(await port.knowledge.saveConcept(draft));
      if (decoded === undefined) throw new Error("桌面核心返回了不兼容的研究知识数据；本次结果未被采用。");
      return decoded;
    },
    async captureConceptUsage(draft, source) {
      if (!binding.active || !port || typeof port.knowledge?.captureConceptUsage !== "function") unavailable("knowledge.captureConceptUsage");
      const decoded = decodeConceptCaptureResult(await port.knowledge.captureConceptUsage(draft, source));
      if (decoded === undefined) throw new Error("桌面核心返回了不兼容的研究知识数据；本次结果未被采用。");
      return decoded;
    },
    async saveDefinitionClaim(draft) {
      if (!binding.active || !port || typeof port.knowledge?.saveDefinitionClaim !== "function") unavailable("knowledge.saveDefinitionClaim");
      const decoded = decodeDefinitionClaim(await port.knowledge.saveDefinitionClaim(draft));
      if (decoded === undefined) throw new Error("桌面核心返回了不兼容的研究知识数据；本次结果未被采用。");
      return decoded;
    },
    async listDefinitionClaims(conceptId) {
      if (!binding.active || !port || typeof port.knowledge?.listDefinitionClaims !== "function") unavailable("knowledge.listDefinitionClaims");
      const decoded = decodeList(await port.knowledge.listDefinitionClaims(conceptId), decodeDefinitionClaim);
      if (decoded === undefined) throw new Error("桌面核心返回了不兼容的研究知识数据；本次结果未被采用。");
      return decoded;
    },
    async searchRelationNodes(query) {
      if (!binding.active || !port || typeof port.knowledge?.searchRelationNodes !== "function") unavailable("knowledge.searchRelationNodes");
      const decoded = decodeList(await port.knowledge.searchRelationNodes(query), decodeRelationNode);
      if (decoded === undefined) throw new Error("桌面核心返回了不兼容的研究知识数据；本次结果未被采用。");
      return decoded;
    },
    async saveRelationAssertion(draft) {
      if (!binding.active || !port || typeof port.knowledge?.saveRelationAssertion !== "function") unavailable("knowledge.saveRelationAssertion");
      const decoded = decodeRelationAssertion(await port.knowledge.saveRelationAssertion(draft));
      if (decoded === undefined) throw new Error("桌面核心返回了不兼容的研究知识数据；本次结果未被采用。");
      return decoded;
    },
    async listRelationAssertions(projectId) {
      if (!binding.active || !port || typeof port.knowledge?.listRelationAssertions !== "function") unavailable("knowledge.listRelationAssertions");
      const decoded = decodeList(await port.knowledge.listRelationAssertions(projectId), decodeRelationAssertion);
      if (decoded === undefined) throw new Error("桌面核心返回了不兼容的研究知识数据；本次结果未被采用。");
      return decoded;
    },
    async listRevisions(objectKind, objectId) {
      if (!binding.active || !port || typeof port.knowledge?.listRevisions !== "function") unavailable("knowledge.listRevisions");
      const decoded = decodeList(await port.knowledge.listRevisions(objectKind, objectId), decodeResearchObjectRevision);
      if (decoded === undefined) throw new Error("桌面核心返回了不兼容的研究知识数据；本次结果未被采用。");
      return decoded;
    },
    async listReadingUnits(projectId, paperId) {
      if (!binding.active || !port || typeof port.knowledge?.listReadingUnits !== "function") unavailable("knowledge.listReadingUnits");
      const decoded = decodeList(await port.knowledge.listReadingUnits(projectId, paperId), decodeReadingUnit);
      if (decoded === undefined) throw new Error("桌面核心返回了不兼容的研究知识数据；本次结果未被采用。");
      return decoded;
    },
    async saveReadingUnit(draft) {
      if (!binding.active || !port || typeof port.knowledge?.saveReadingUnit !== "function") unavailable("knowledge.saveReadingUnit");
      const decoded = decodeReadingUnit(await port.knowledge.saveReadingUnit(draft));
      if (decoded === undefined) throw new Error("桌面核心返回了不兼容的研究知识数据；本次结果未被采用。");
      return decoded;
    },
  };
  const knowledge = new Proxy(knowledgeMethods as ResearchKnowledgeGateway, {get(target, key) {
    if (typeof key !== "string" || reflectionKeys.has(key) || Object.hasOwn(target, key)) return Reflect.get(target, key);
    return async () => unavailable(`knowledge.${key}`);
  }});
  const researchExport = createResearchExportGateway({
    exportAll: async targetDirectory => {
      if (!binding.active || typeof port?.researchExport?.exportAll !== "function") unavailable("researchExport.exportAll");
      return port.researchExport.exportAll(targetDirectory);
    },
    cancel: async () => {
      if (!binding.active || typeof port?.researchExport?.cancel !== "function") unavailable("researchExport.cancel");
      return port.researchExport.cancel();
    },
  });
  const binding: RuntimeBinding = {
    active: true, configured: port !== undefined, literature, researchExport, referenceRecords, evidence, evidenceMatrix, derivedViews, knowledge,
    nal: {read: async () => {
      if (!binding.active || !port) unavailable("nal.read");
      return port.nal.read();
    }, mutate: async (mutation, expectedRevision) => {
      if (!binding.active || !port || typeof port.nal?.mutate !== "function") unavailable("nal.mutate");
      return port.nal.mutate(mutation, expectedRevision);
    }, ensureAnnotation: async request => {
      if (!binding.active || !port || typeof port.nal?.ensureAnnotation !== "function") unavailable("nal.ensureAnnotation");
      validateNalAnnotationRequest(request);
      return decodeNalAnnotationResponse(await port.nal.ensureAnnotation(request), request);
    }},
    queries: {read: async () => {
      if (!binding.active || !port) unavailable("queries.read");
      return port.queries.read();
    }, save: async (...args) => {
      if (!binding.active || !port) unavailable("queries.save");
      return port.queries.save(...args);
    }},
  };
  selected = binding;
  return () => {binding.active = false; if (selected === binding) selected = undefined;};
}

export function runtimeLiteratureGateway(legacy?: () => LiteratureGateway): LiteratureGateway | undefined {
  if (selected && legacy) selected.legacy = legacy;
  return selected?.literature;
}
export function runtimeNalGateway(): NalGateway | undefined {return selected?.configured ? selected.nal : undefined;}
export function runtimeNalQueryGateway(): NalQueryGateway | undefined {return selected?.configured ? selected.queries : undefined;}
export function runtimeKnowledgeGateway(): ResearchKnowledgeGateway | undefined {return selected?.configured ? selected.knowledge : undefined;}
export function runtimeReferenceRecordGateway(): ReferenceRecordGateway | undefined {return selected?.referenceRecords;}

export function runtimeEvidenceMatrixGateway(): EvidenceMatrixGateway | undefined {return selected?.configured ? selected.evidenceMatrix : undefined;}

export function runtimeEvidenceGateway(): EvidenceGateway | undefined {return selected?.configured ? selected.evidence : undefined;}

export function runtimeDerivedViewGateway(): DerivedResearchViewGateway | undefined {return selected?.configured ? selected.derivedViews : undefined;}

export function runtimeResearchExportGateway(): ResearchExportGateway | undefined {return selected?.configured ? selected.researchExport : undefined;}
