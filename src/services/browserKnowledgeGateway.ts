import { deletedBrowserConceptIds } from "./browserConceptDeletion";
import {
  browserActiveConcepts,
  listBrowserConceptIdentityEvents,
  mergeBrowserConcepts,
  previewBrowserConceptMerge,
  resolveBrowserConceptId,
  splitBrowserConcepts,
} from "./browserConceptIdentity";
import {
  RELATION_PREDICATE_KINDS,
  assertAvailableConceptName,
  type RelationAssertion,
  type RelationNodeSummary,
} from "@research-assistant/core/knowledge";
import type {
  Concept,
  ConceptCaptureResult,
  DefinitionClaim,
  ResearchObjectRevision,
  StructuredReadingUnit,
  Term,
  TermUsage,
} from "@research-assistant/core/knowledge";

import {
  appendBrowserResearchRevision,
  listBrowserResearchRevisions,
} from "./browserResearchRevisionStore";
import {
  browserKnowledgeStorage,
  type BrowserReadingUnitEvidence,
} from "./browserKnowledgeStorage";
import type { ResearchKnowledgeGateway } from "./knowledgeGateway";
import {
  browserReadingProfiles,
  getBrowserPaperProfileSelection,
  saveBrowserPaperProfileSelection,
} from "./browserReadingProfiles";

function normalizedTerm(value: string): string {
  return value.trim().replace(/\s+/gu, " ").toLocaleLowerCase();
}

function ensureTerm(text: string, language: string): Term {
  const normalizedText = normalizedTerm(text);
  if (normalizedText.length === 0) throw new Error("语词不能为空");
  const terms = browserKnowledgeStorage.readTerms();
  const existing = terms.find(
    (term) => term.normalizedText === normalizedText && term.language === language,
  );
  if (existing !== undefined) return existing;
  const now = new Date().toISOString();
  const term: Term = {
    id: crypto.randomUUID(),
    text: text.trim(),
    normalizedText,
    language,
    provenanceKind: "human_original",
    revision: 1,
    createdAt: now,
    updatedAt: now,
  };
  browserKnowledgeStorage.writeTerms([term, ...terms]);
  appendBrowserResearchRevision("term", term.id, 1, term, "manual_create");
  return term;
}

function storeConcept(concept: Concept): void {
  browserKnowledgeStorage.writeConcepts([
    concept,
    ...browserKnowledgeStorage.readConcepts().filter((value) => value.id !== concept.id),
  ]);
}

function addConceptTermAndSource(conceptId: string, term: Term): Concept {
  const activeConceptId = resolveBrowserConceptId(conceptId);
  const existing = browserKnowledgeStorage.readConcepts().find(
    (concept) => concept.id === activeConceptId,
  );
  if (existing === undefined) throw new Error("找不到已有概念");
  const terms = existing.terms.some((value) => value.id === term.id)
    ? existing.terms
    : [...existing.terms, term];
  const concept = { ...existing, terms, sourceCount: existing.sourceCount + 1 };
  storeConcept(concept);
  return concept;
}

function storeDefinition(definition: DefinitionClaim): void {
  browserKnowledgeStorage.writeDefinitions([
    definition,
    ...browserKnowledgeStorage.readDefinitions().filter((value) => value.id !== definition.id),
  ]);
}

function relationNodes(): readonly RelationNodeSummary[] {
  const concepts = browserActiveConcepts().map((concept) => ({
    kind: "concept" as const,
    id: concept.id,
    label: concept.label || concept.preferredTerm.text,
    detail: [concept.domain, concept.disambiguation].filter(Boolean).join(" · "),
  }));
  const definitions = browserKnowledgeStorage.readDefinitions().map((definition) => ({
    kind: "definition_claim" as const,
    id: definition.id,
    label: definition.statement.slice(0, 240),
    detail: definition.scopeNote,
  }));
  const readingUnits = browserKnowledgeStorage.readReadingUnits().map((unit) => ({
    kind: "reading_unit" as const,
    id: unit.id,
    label: unit.title || unit.body.slice(0, 240),
    detail: unit.unitKind,
  }));
  return [...concepts, ...definitions, ...readingUnits];
}

function validateRelationDraft(draft: Parameters<ResearchKnowledgeGateway["saveRelationAssertion"]>[0]): void {
  const hasValidPredicate = RELATION_PREDICATE_KINDS.some(
    (predicate) => predicate === draft.predicateKind,
  );
  const hasAnchor = draft.anchorId !== undefined;
  const hasStance = draft.evidenceStance !== undefined;
  const rationaleWithoutEvidence = !hasAnchor && !hasStance
    && (draft.evidenceRationale?.trim().length ?? 0) > 0;
  if (!hasValidPredicate || draft.scopeNote.length > 4_000
    || draft.changeReason !== undefined && draft.changeReason.length > 500
    || draft.evidenceRationale !== undefined && draft.evidenceRationale.length > 2_000) {
    throw new Error("关系断言参数无效");
  }
  if (hasAnchor !== hasStance || rationaleWithoutEvidence) {
    throw new Error("关系证据必须同时提供锚点和立场");
  }
}

export const browserKnowledgeGateway: ResearchKnowledgeGateway = {
  async listReadingProfiles() {
    return browserReadingProfiles;
  },

  async getPaperReadingProfileSelection(paperId) {
    return getBrowserPaperProfileSelection(paperId);
  },

  async savePaperReadingProfileSelection(draft) {
    return saveBrowserPaperProfileSelection(draft);
  },
  async listReadingUnits(projectId, paperId) {
    return browserKnowledgeStorage.readReadingUnits().filter(
      (unit) => (projectId === undefined || unit.projectId === projectId)
        && (paperId === undefined || unit.paperId === paperId),
    );
  },

  async saveReadingUnit(draft) {
    const body = draft.body.trim();
    if (body.length === 0) throw new Error("阅读单元内容不能为空");
    const units = browserKnowledgeStorage.readReadingUnits();
    const existing = draft.id === undefined ? undefined : units.find((unit) => unit.id === draft.id);
    if (existing === undefined && draft.expectedRevision !== undefined) {
      throw new Error("找不到要更新的阅读单元");
    }
    if (existing !== undefined && existing.revision !== draft.expectedRevision) {
      throw new Error(`对象版本冲突；当前版本为 ${existing.revision}`);
    }
    const now = new Date().toISOString();
    const links = browserKnowledgeStorage.readReadingUnitEvidence();
    const stance = draft.evidenceStance ?? "context";
    const nextLink = draft.anchorId === undefined ? undefined : {
      readingUnitId: draft.id ?? "",
      anchorId: draft.anchorId,
      stance,
      rationale: draft.evidenceRationale?.trim() ?? "",
    } satisfies BrowserReadingUnitEvidence;
    const unitId = draft.id ?? crypto.randomUUID();
    const linkKey = `${unitId}:${draft.anchorId ?? ""}:${stance}`;
    const alreadyLinked = draft.anchorId !== undefined && links.some(
      (link) => `${link.readingUnitId}:${link.anchorId}:${link.stance}` === linkKey,
    );
    const unit: StructuredReadingUnit = {
      id: unitId,
      ...(draft.projectId === undefined ? {} : { projectId: draft.projectId }),
      ...(draft.paperId === undefined ? {} : { paperId: draft.paperId }),
      ...(existing?.templateField === undefined ? {} : { templateField: existing.templateField }),
      unitKind: draft.unitKind,
      title: draft.title.trim(),
      body,
      provenanceKind: existing?.provenanceKind ?? "human_original",
      epistemicRole: draft.epistemicRole,
      revision: (existing?.revision ?? 0) + 1,
      evidenceCount: (existing?.evidenceCount ?? 0) + (nextLink === undefined || alreadyLinked ? 0 : 1),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    if (nextLink !== undefined) {
      browserKnowledgeStorage.writeReadingUnitEvidence([
        { ...nextLink, readingUnitId: unitId },
        ...links.filter((link) => `${link.readingUnitId}:${link.anchorId}:${link.stance}` !== linkKey),
      ]);
    }
    browserKnowledgeStorage.writeReadingUnits([unit, ...units.filter((value) => value.id !== unit.id)]);
    appendBrowserResearchRevision(
      "reading_unit",
      unit.id,
      unit.revision,
      unit,
      draft.changeReason ?? "manual_save",
    );
    return unit;
  },

  async searchConcepts(query) {
    const normalized = normalizedTerm(query);
    return browserActiveConcepts().filter((concept) => normalized.length === 0 || [
      concept.label,
      concept.explanation,
      concept.disambiguation,
      concept.domain,
      ...concept.terms.map((term) => term.text),
    ].some((value) => normalizedTerm(value).includes(normalized)));
  },

  async previewConceptMerge(draft) {
    return previewBrowserConceptMerge(draft);
  },

  async mergeConcepts(draft) {
    return mergeBrowserConcepts(draft);
  },

  async splitConcepts(draft) {
    return splitBrowserConcepts(draft);
  },

  async listConceptIdentityEvents() {
    return listBrowserConceptIdentityEvents();
  },

  async saveConcept(draft) {
    if (draft.id && deletedBrowserConceptIds().has(draft.id)) throw new Error("概念已删除，请刷新");
    const concepts = browserKnowledgeStorage.readConcepts();
    if (draft.id !== undefined && resolveBrowserConceptId(draft.id) !== draft.id) {
      throw new Error("旧概念 ID 已合并；请编辑当前保留节点或先拆回");
    }
    const existing = draft.id === undefined
      ? undefined
      : concepts.find((concept) => concept.id === draft.id);
    if (existing === undefined && draft.expectedRevision !== undefined) {
      throw new Error("找不到要更新的概念");
    }
    if (existing !== undefined && existing.revision !== draft.expectedRevision) {
      throw new Error(`对象版本冲突；当前版本为 ${existing.revision}`);
    }
    const label = assertAvailableConceptName(draft.label, concepts, existing);
    const term = ensureTerm(draft.preferredTerm, draft.language ?? "");
    const now = new Date().toISOString();
    const terms = existing?.terms.filter((value) => value.id !== term.id) ?? [];
    const concept: Concept = {
      id: draft.id ?? crypto.randomUUID(),
      preferredTerm: term,
      terms: [term, ...terms],
      label,
      explanation: draft.explanation.trim(),
      disambiguation: draft.disambiguation.trim(),
      domain: draft.domain.trim(),
      tradition: draft.tradition.trim(),
      period: draft.period.trim(),
      provenanceKind: existing?.provenanceKind ?? "human_original",
      revision: (existing?.revision ?? 0) + 1,
      definitionCount: existing?.definitionCount ?? 0,
      sourceCount: existing?.sourceCount ?? 0,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    storeConcept(concept);
    appendBrowserResearchRevision(
      "concept",
      concept.id,
      concept.revision,
      concept,
      draft.changeReason ?? "manual_save",
    );
    return concept;
  },

  async captureConceptUsage(draft, source) {
    const term = ensureTerm(draft.termText, draft.language ?? "");
    let concept: Concept | undefined;
    let definitionClaim: DefinitionClaim | undefined;
    if (draft.resolution.kind === "create_new") {
      concept = await this.saveConcept({
        preferredTerm: draft.termText,
        ...(draft.language === undefined ? {} : { language: draft.language }),
        ...draft.resolution.concept,
      });
      if (draft.resolution.definitionStatement?.trim()) {
        definitionClaim = await this.saveDefinitionClaim({
          conceptId: concept.id,
          statement: draft.resolution.definitionStatement,
          scopeNote: "",
          anchorId: draft.anchorId,
        });
      }
      concept = addConceptTermAndSource(concept.id, term);
    } else if (draft.resolution.kind === "link_existing") {
      concept = addConceptTermAndSource(draft.resolution.conceptId, term);
      if (draft.resolution.definitionStatement?.trim()) {
        definitionClaim = await this.saveDefinitionClaim({
          conceptId: concept.id,
          statement: draft.resolution.definitionStatement,
          scopeNote: "",
          anchorId: draft.anchorId,
        });
      }
    }
    const now = new Date().toISOString();
    const usage: TermUsage = {
      id: crypto.randomUUID(),
      term,
      ...(concept === undefined ? {} : { conceptId: concept.id }),
      anchorId: draft.anchorId,
      paperId: source.paperId,
      paperTitle: source.paperTitle,
      attachmentId: source.attachmentId,
      contentSha256: source.contentSha256,
      pageIndex: source.pageIndex,
      ...(source.pageLabel === undefined ? {} : { pageLabel: source.pageLabel }),
      quoteExact: source.quoteExact,
      usageText: draft.usageText.trim() || source.quoteExact,
      provenanceKind: "human_original",
      revision: 1,
      createdAt: now,
      updatedAt: now,
    };
    browserKnowledgeStorage.writeUsages([usage, ...browserKnowledgeStorage.readUsages()]);
    appendBrowserResearchRevision("term_usage", usage.id, 1, usage, "selection_capture");
    return {
      term,
      ...(concept === undefined ? {} : { concept }),
      usage,
      ...(definitionClaim === undefined ? {} : { definitionClaim }),
    } satisfies ConceptCaptureResult;
  },

  async listDefinitionClaims(conceptId) {
    const canonicalId = resolveBrowserConceptId(conceptId);
    const familyIds = new Set([
      canonicalId,
      ...browserKnowledgeStorage.readConceptIdentityMappings()
        .filter((mapping) => mapping.canonicalConceptId === canonicalId)
        .map((mapping) => mapping.sourceConceptId),
    ]);
    return browserKnowledgeStorage.readDefinitions().filter(
      (definition) => familyIds.has(definition.conceptId),
    );
  },

  async saveDefinitionClaim(draft) {
    const statement = draft.statement.trim();
    if (statement.length === 0) throw new Error("定义陈述不能为空");
    const definitions = browserKnowledgeStorage.readDefinitions();
    const existing = draft.id === undefined
      ? undefined
      : definitions.find((definition) => definition.id === draft.id);
    if (existing === undefined && draft.expectedRevision !== undefined) {
      throw new Error("找不到要更新的定义");
    }
    if (existing !== undefined && existing.revision !== draft.expectedRevision) {
      throw new Error(`对象版本冲突；当前版本为 ${existing.revision}`);
    }
    const now = new Date().toISOString();
    const conceptId = existing === undefined
      ? resolveBrowserConceptId(draft.conceptId)
      : draft.conceptId;
    const definition: DefinitionClaim = {
      id: draft.id ?? crypto.randomUUID(),
      conceptId,
      statement,
      scopeNote: draft.scopeNote.trim(),
      provenanceKind: existing?.provenanceKind ?? "human_original",
      epistemicRole: "definition",
      revision: (existing?.revision ?? 0) + 1,
      evidenceCount: (existing?.evidenceCount ?? 0) + (draft.anchorId === undefined ? 0 : 1),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    storeDefinition(definition);
    if (existing === undefined) {
      const concept = browserKnowledgeStorage.readConcepts().find(
        (value) => value.id === definition.conceptId,
      );
      if (concept !== undefined) {
        storeConcept({ ...concept, definitionCount: concept.definitionCount + 1 });
      }
    }
    appendBrowserResearchRevision(
      "definition_claim",
      definition.id,
      definition.revision,
      definition,
      draft.changeReason ?? "manual_save",
    );
    return definition;
  },

  async searchRelationNodes(query) {
    const normalized = normalizedTerm(query);
    return relationNodes().filter((node) => normalized.length === 0
      || normalizedTerm(`${node.label} ${node.detail}`).includes(normalized));
  },

  async saveRelationAssertion(draft) {
    validateRelationDraft(draft);
    const nodes = relationNodes();
    const subject = nodes.find((node) =>
      node.kind === draft.subject.kind && node.id === draft.subject.id);
    const object = nodes.find((node) =>
      node.kind === draft.object.kind && node.id === draft.object.id);
    if (subject === undefined || object === undefined) throw new Error("找不到关系端点");
    if (subject.kind === object.kind && subject.id === object.id) {
      throw new Error("关系的起点和终点不能是同一对象");
    }
    const relations = browserKnowledgeStorage.readRelations();
    const existing = draft.id === undefined
      ? undefined : relations.find((relation) => relation.id === draft.id);
    if (existing === undefined && draft.expectedRevision !== undefined) {
      throw new Error("找不到要更新的关系断言");
    }
    if (existing !== undefined && existing.revision !== draft.expectedRevision) {
      throw new Error(`对象版本冲突；当前版本为 ${existing.revision}`);
    }
    const id = existing?.id ?? crypto.randomUUID();
    const evidence = browserKnowledgeStorage.readRelationEvidence();
    const stance = draft.evidenceStance ?? "context";
    const evidenceKey = `${id}:${draft.anchorId ?? ""}:${stance}`;
    const hasEvidence = draft.anchorId !== undefined && evidence.some((item) =>
      `${item.relationAssertionId}:${item.anchorId}:${item.stance}` === evidenceKey);
    if (draft.anchorId !== undefined && !hasEvidence) {
      browserKnowledgeStorage.writeRelationEvidence([{
        relationAssertionId: id,
        anchorId: draft.anchorId,
        stance,
        rationale: draft.evidenceRationale?.trim() ?? "",
      }, ...evidence]);
    }
    const now = new Date().toISOString();
    const relation: RelationAssertion = {
      id,
      ...(draft.projectId === undefined ? {} : { projectId: draft.projectId }),
      subject,
      predicateKind: draft.predicateKind,
      object,
      scopeNote: draft.scopeNote.trim(),
      provenanceKind: existing?.provenanceKind ?? "human_original",
      epistemicRole: "assertion",
      revision: (existing?.revision ?? 0) + 1,
      evidenceCount: (existing?.evidenceCount ?? 0) + (draft.anchorId === undefined || hasEvidence ? 0 : 1),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    browserKnowledgeStorage.writeRelations([
      relation,
      ...relations.filter((item) => item.id !== relation.id),
    ]);
    appendBrowserResearchRevision(
      "relation_assertion",
      relation.id,
      relation.revision,
      relation,
      draft.changeReason ?? (existing === undefined ? "manual_create" : "manual_edit"),
    );
    return relation;
  },

  async listRelationAssertions(projectId) {
    return browserKnowledgeStorage.readRelations().filter(
      (relation) => projectId === undefined || relation.projectId === projectId,
    );
  },

  async listRevisions(objectKind, objectId): Promise<readonly ResearchObjectRevision[]> {
    return listBrowserResearchRevisions(objectKind, objectId);
  },

  async analyzeConceptEvolution() {
    throw new Error("概念演化分析只在桌面应用中可用");
  },

  async analyzeSharedFoundations() {
    throw new Error("共享理论基础分析只在桌面应用中可用");
  },

  async getConceptAlgorithmRun() {
    throw new Error("概念算法运行只在桌面应用中可用");
  },
};
