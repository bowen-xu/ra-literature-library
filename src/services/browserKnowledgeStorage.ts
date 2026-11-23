import { deletedBrowserConceptIds } from "./browserConceptDeletion";
import { getAppStorage } from "@research-assistant/workbench-sdk/storage";
import { assertAvailableConceptName } from "@research-assistant/core/knowledge";
import type {
  Concept,
  ConceptIdentityEvent,
  DefinitionClaim,
  PaperReadingProfileSelection,
  RelationAssertion,
  StructuredReadingUnit,
  Term,
  TermUsage,
} from "@research-assistant/core/knowledge";

import {
  decodeConcept,
  decodeConceptIdentityEvent,
  decodeDefinitionClaim,
  decodeList,
  decodePaperReadingProfileSelection,
  decodeReadingUnit,
  decodeRelationAssertion,
  decodeTerm,
  decodeTermUsage,
} from "./knowledgeDecoders";

export interface BrowserReadingUnitEvidence {
  readonly readingUnitId: string;
  readonly anchorId: string;
  readonly stance: "supports" | "opposes" | "context";
  readonly rationale: string;
}

export interface BrowserRelationEvidence {
  readonly relationAssertionId: string;
  readonly anchorId: string;
  readonly stance: "supports" | "opposes" | "context";
  readonly rationale: string;
}

export interface BrowserConceptIdentityMapping {
  readonly sourceConceptId: string;
  readonly canonicalConceptId: string;
  readonly mergeEventId: string;
  readonly createdAt: string;
}

const UNIT_KEY = "research-assistant.reading-units.v1";
const CONCEPT_KEY = "research-assistant.concepts.v1";
const TERM_KEY = "research-assistant.terms.v1";
const USAGE_KEY = "research-assistant.term-usages.v1";
const DEFINITION_KEY = "research-assistant.definition-claims.v1";
const UNIT_EVIDENCE_KEY = "research-assistant.reading-unit-evidence.v1";
const RELATION_KEY = "research-assistant.relation-assertions.v1";
const RELATION_EVIDENCE_KEY = "research-assistant.relation-evidence.v1";
const PROFILE_SELECTION_KEY = "research-assistant.paper-reading-profile-selections.v1";
const CONCEPT_IDENTITY_EVENT_KEY = "research-assistant.concept-identity-events.v1";
const CONCEPT_IDENTITY_MAPPING_KEY = "research-assistant.concept-identity-mappings.v1";
const EVIDENCE_STANCES: readonly BrowserReadingUnitEvidence["stance"][] = [
  "supports", "opposes", "context",
];

function decodeReadingUnitEvidence(value: unknown): BrowserReadingUnitEvidence | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const item = value as Readonly<Record<string, unknown>>;
  const stance = EVIDENCE_STANCES.find((entry) => entry === item.stance);
  return typeof item.readingUnitId !== "string" || typeof item.anchorId !== "string"
    || typeof item.rationale !== "string" || stance === undefined
    ? undefined
    : { readingUnitId: item.readingUnitId, anchorId: item.anchorId, rationale: item.rationale, stance };
}

function decodeRelationEvidence(value: unknown): BrowserRelationEvidence | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const item = value as Readonly<Record<string, unknown>>;
  const stance = EVIDENCE_STANCES.find((entry) => entry === item.stance);
  return typeof item.relationAssertionId !== "string" || typeof item.anchorId !== "string"
    || typeof item.rationale !== "string" || stance === undefined ? undefined : {
      relationAssertionId: item.relationAssertionId,
      anchorId: item.anchorId,
      rationale: item.rationale,
      stance,
    };
}

function decodeConceptIdentityMapping(value: unknown): BrowserConceptIdentityMapping | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const item = value as Readonly<Record<string, unknown>>;
  return typeof item.sourceConceptId !== "string" || item.sourceConceptId.length === 0
    || typeof item.canonicalConceptId !== "string" || item.canonicalConceptId.length === 0
    || typeof item.mergeEventId !== "string" || typeof item.createdAt !== "string"
    || item.sourceConceptId === item.canonicalConceptId ? undefined : {
      sourceConceptId: item.sourceConceptId,
      canonicalConceptId: item.canonicalConceptId,
      mergeEventId: item.mergeEventId,
      createdAt: item.createdAt,
    };
}

function readConceptIdentityMappings(): readonly BrowserConceptIdentityMapping[] {
  const mappings = readDecoded(
    CONCEPT_IDENTITY_MAPPING_KEY,
    "概念身份映射",
    decodeConceptIdentityMapping,
  );
  const sourceIds = new Set(mappings.map((mapping) => mapping.sourceConceptId));
  if (sourceIds.size !== mappings.length
    || mappings.some((mapping) => sourceIds.has(mapping.canonicalConceptId))) {
    throw new Error("本地概念身份映射存在冲突；原始记录未被修改。");
  }
  return mappings;
}

function readDecoded<T>(
  key: string,
  label: string,
  decode: (value: unknown) => T | undefined,
): readonly T[] {
  const raw = getAppStorage().getItem(key);
  if (raw === null) return [];
  try {
    const values = decodeList(JSON.parse(raw) as unknown, decode);
    if (values === undefined) throw new Error("invalid stored records");
    return values;
  } catch {
    throw new Error(`本地${label}数据无法读取；原始记录未被修改。`);
  }
}

function writeValues<T>(key: string, values: readonly T[]): void {
  getAppStorage().setItem(key, JSON.stringify(values));
}

export const browserKnowledgeStorage = {
  readConceptIdentityEvents: () => readDecoded(
    CONCEPT_IDENTITY_EVENT_KEY,
    "概念身份事件",
    decodeConceptIdentityEvent,
  ),
  writeConceptIdentityEvents: (values: readonly ConceptIdentityEvent[]) => {
    writeValues(CONCEPT_IDENTITY_EVENT_KEY, values);
  },
  readConceptIdentityMappings,
  writeConceptIdentityMappings: (values: readonly BrowserConceptIdentityMapping[]) => {
    writeValues(CONCEPT_IDENTITY_MAPPING_KEY, values);
  },
  readProfileSelections: () => readDecoded(
    PROFILE_SELECTION_KEY,
    "阅读画像选择",
    decodePaperReadingProfileSelection,
  ),
  writeProfileSelections: (values: readonly PaperReadingProfileSelection[]) => {
    writeValues(PROFILE_SELECTION_KEY, values);
  },
  readTerms: () => readDecoded(TERM_KEY, "语词", decodeTerm),
  writeTerms: (values: readonly Term[]) => writeValues(TERM_KEY, values),
  readReadingUnits: () => readDecoded(UNIT_KEY, "阅读单元", decodeReadingUnit),
  writeReadingUnits: (values: readonly StructuredReadingUnit[]) => writeValues(UNIT_KEY, values),
  readConcepts: () => {const deleted=deletedBrowserConceptIds();return readDecoded(CONCEPT_KEY, "概念", decodeConcept).filter(c=>!deleted.has(c.id));},
  writeConcepts: (values: readonly Concept[]) => {
    const previous = new Map(readDecoded(CONCEPT_KEY, "概念", decodeConcept).map(value=>[value.id,value]));
    const deleted=deletedBrowserConceptIds();
    if(values.some(value=>deleted.has(value.id)))throw new Error("概念已删除，请刷新");
    for (const concept of values) {
      const current=previous.get(concept.id);
      if (current?.label === concept.label) continue;
      assertAvailableConceptName(concept.label, values.filter(value=>value.id !== concept.id), current);
    }
    const preserved=[...previous.values()].filter(c=>deleted.has(c.id));
    writeValues(CONCEPT_KEY, [...values,...preserved]);
  },
  readUsages: () => readDecoded(USAGE_KEY, "语词用法", decodeTermUsage),
  writeUsages: (values: readonly TermUsage[]) => writeValues(USAGE_KEY, values),
  readDefinitions: () => readDecoded(DEFINITION_KEY, "定义陈述", decodeDefinitionClaim),
  writeDefinitions: (values: readonly DefinitionClaim[]) => writeValues(DEFINITION_KEY, values),
  readRelations: () => readDecoded(RELATION_KEY, "关系断言", decodeRelationAssertion),
  writeRelations: (values: readonly RelationAssertion[]) => writeValues(RELATION_KEY, values),
  readReadingUnitEvidence: () => readDecoded(
    UNIT_EVIDENCE_KEY,
    "阅读单元证据",
    decodeReadingUnitEvidence,
  ),
  writeReadingUnitEvidence: (values: readonly BrowserReadingUnitEvidence[]) => {
    writeValues(UNIT_EVIDENCE_KEY, values);
  },
  readRelationEvidence: () => readDecoded(
    RELATION_EVIDENCE_KEY,
    "关系证据",
    decodeRelationEvidence,
  ),
  writeRelationEvidence: (values: readonly BrowserRelationEvidence[]) => {
    writeValues(RELATION_EVIDENCE_KEY, values);
  },
};
