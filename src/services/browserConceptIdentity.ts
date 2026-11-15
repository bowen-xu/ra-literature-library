import type {
  Concept,
  ConceptIdentityEvent,
  ConceptIdentitySummary,
  ConceptMergeDraft,
  ConceptMergeImpact,
  ConceptSplitDraft,
} from "@research-assistant/core/knowledge";

import { browserKnowledgeStorage } from "./browserKnowledgeStorage";

export function resolveBrowserConceptId(conceptId: string): string {
  return browserKnowledgeStorage.readConceptIdentityMappings().find(
    (mapping) => mapping.sourceConceptId === conceptId,
  )?.canonicalConceptId ?? conceptId;
}

export function browserActiveConcepts(): readonly Concept[] {
  const concepts = browserKnowledgeStorage.readConcepts();
  const mappings = browserKnowledgeStorage.readConceptIdentityMappings();
  const definitions = browserKnowledgeStorage.readDefinitions();
  const usages = browserKnowledgeStorage.readUsages();
  const sourceIds = new Set(mappings.map((mapping) => mapping.sourceConceptId));
  return concepts.filter((concept) => !sourceIds.has(concept.id)).map((concept) => {
    const familyIds = new Set([
      concept.id,
      ...mappings.filter((mapping) => mapping.canonicalConceptId === concept.id)
        .map((mapping) => mapping.sourceConceptId),
    ]);
    const family = concepts.filter((candidate) => familyIds.has(candidate.id));
    const terms = [...new Map(family.flatMap((candidate) => candidate.terms)
      .map((term) => [term.id, term])).values()];
    return {
      ...concept,
      terms,
      definitionCount: definitions.filter((definition) => familyIds.has(definition.conceptId)).length,
      sourceCount: new Set(usages.filter((usage) =>
        usage.conceptId !== undefined && familyIds.has(usage.conceptId))
        .map((usage) => usage.anchorId)).size,
    };
  });
}

export function previewBrowserConceptMerge(draft: ConceptMergeDraft): ConceptMergeImpact {
  validateMergeDraft(draft);
  const concepts = browserKnowledgeStorage.readConcepts();
  const mappings = browserKnowledgeStorage.readConceptIdentityMappings();
  const survivor = conceptSummary(concepts, draft.survivorId);
  if (survivor.revision !== draft.survivorExpectedRevision) {
    throw new Error(`对象版本冲突；当前版本为 ${survivor.revision}`);
  }
  if (mappings.some((mapping) => mapping.sourceConceptId === survivor.id)) {
    throw new Error("保留节点已是其他概念的旧 ID");
  }
  const sources = draft.sources.map((source) => {
    const summary = conceptSummary(concepts, source.id);
    if (summary.revision !== source.expectedRevision) {
      throw new Error(`对象版本冲突；当前版本为 ${summary.revision}`);
    }
    if (mappings.some((mapping) => mapping.sourceConceptId === source.id
      || mapping.canonicalConceptId === source.id)) {
      throw new Error("概念已参与其他活动映射，请先拆回再合并");
    }
    return summary;
  });
  const sourceIds = new Set(sources.map((source) => source.id));
  const affectedRelationIds = browserKnowledgeStorage.readRelations()
    .filter((relation) => (
      relation.subject.kind === "concept" && sourceIds.has(relation.subject.id)
    ) || (
      relation.object.kind === "concept" && sourceIds.has(relation.object.id)
    ))
    .map((relation) => relation.id);
  return { survivor, sources, affectedRelationIds: [...new Set(affectedRelationIds)] };
}

export function mergeBrowserConcepts(draft: ConceptMergeDraft): ConceptIdentityEvent {
  if ([...draft.rationale].length > 2_000) throw new Error("概念合并说明过长");
  const impact = previewBrowserConceptMerge(draft);
  const eventId = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const activeSourceIds = impact.sources.map((source) => source.id);
  const event: ConceptIdentityEvent = {
    id: eventId, operation: "merge", ...impact, activeSourceIds,
    rationale: draft.rationale.trim(), createdAt,
  };
  browserKnowledgeStorage.writeConceptIdentityEvents([
    event, ...browserKnowledgeStorage.readConceptIdentityEvents(),
  ]);
  browserKnowledgeStorage.writeConceptIdentityMappings([
    ...activeSourceIds.map((sourceConceptId) => ({
      sourceConceptId,
      canonicalConceptId: impact.survivor.id,
      mergeEventId: eventId,
      createdAt,
    })),
    ...browserKnowledgeStorage.readConceptIdentityMappings(),
  ]);
  return event;
}

export function splitBrowserConcepts(draft: ConceptSplitDraft): ConceptIdentityEvent {
  if (draft.sourceConceptIds.length === 0 || draft.sourceConceptIds.length > 10
    || new Set(draft.sourceConceptIds).size !== draft.sourceConceptIds.length
    || [...draft.rationale].length > 2_000) throw new Error("概念拆回参数无效");
  const events = browserKnowledgeStorage.readConceptIdentityEvents();
  const mergeEvent = listBrowserConceptIdentityEvents().find(
    (event) => event.id === draft.mergeEventId && event.operation === "merge",
  );
  if (mergeEvent === undefined || draft.sourceConceptIds.some((id) =>
    !mergeEvent.activeSourceIds.includes(id))) {
    throw new Error("只能拆回仍属于该合并事件的旧概念 ID");
  }
  const sourceIds = new Set(draft.sourceConceptIds);
  const selectedSources = mergeEvent.sources.filter((source) => sourceIds.has(source.id));
  const event: ConceptIdentityEvent = {
    id: crypto.randomUUID(), operation: "split", survivor: mergeEvent.survivor,
    sources: selectedSources,
    affectedRelationIds: [...new Set(browserKnowledgeStorage.readRelations()
      .filter((relation) => (
        relation.subject.kind === "concept" && sourceIds.has(relation.subject.id)
      ) || (
        relation.object.kind === "concept" && sourceIds.has(relation.object.id)
      ))
      .map((relation) => relation.id))],
    activeSourceIds: [], rationale: draft.rationale.trim(), createdAt: new Date().toISOString(),
  };
  browserKnowledgeStorage.writeConceptIdentityEvents([event, ...events]);
  browserKnowledgeStorage.writeConceptIdentityMappings(
    browserKnowledgeStorage.readConceptIdentityMappings().filter((mapping) =>
      mapping.mergeEventId !== draft.mergeEventId || !sourceIds.has(mapping.sourceConceptId)),
  );
  return event;
}

export function listBrowserConceptIdentityEvents(): readonly ConceptIdentityEvent[] {
  const mappings = browserKnowledgeStorage.readConceptIdentityMappings();
  return browserKnowledgeStorage.readConceptIdentityEvents().map((event) => ({
    ...event,
    activeSourceIds: event.operation === "merge" ? mappings
      .filter((mapping) => mapping.mergeEventId === event.id)
      .map((mapping) => mapping.sourceConceptId) : [],
  }));
}

function validateMergeDraft(draft: ConceptMergeDraft): void {
  const ids = draft.sources.map((source) => source.id);
  if (ids.length === 0 || ids.length > 10 || ids.includes(draft.survivorId)
    || new Set(ids).size !== ids.length) throw new Error("概念合并参数无效");
}

function conceptSummary(
  concepts: readonly Concept[],
  conceptId: string,
): ConceptIdentitySummary {
  const concept = concepts.find((candidate) => candidate.id === conceptId);
  if (concept === undefined) throw new Error("找不到概念");
  return {
    id: concept.id,
    label: concept.label || concept.preferredTerm.text,
    revision: concept.revision,
    termCount: concept.terms.length,
    definitionCount: browserKnowledgeStorage.readDefinitions().filter(
      (definition) => definition.conceptId === concept.id,
    ).length,
    sourceCount: new Set(browserKnowledgeStorage.readUsages().filter(
      (usage) => usage.conceptId === concept.id,
    ).map((usage) => usage.anchorId)).size,
  };
}
