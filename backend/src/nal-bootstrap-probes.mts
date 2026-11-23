/** NAL bootstrap probe planning migrated from native/nal_bootstrap/{policy,probes}.rs. */

import {createHash} from 'node:crypto';

export type SourceProbe<T> = {readonly state: 'available'; readonly value: T} | {readonly state: 'deferred'} | {readonly state: 'skipped'};
export type ConceptCallKey =
  | {readonly kind: 'membership'} | {readonly kind: 'tagged'} | {readonly kind: 'collection'; readonly sourceId: string}
  | {readonly kind: 'linkedPredicate'} | {readonly kind: 'typePredicate'; readonly sourceId: string}
  | {readonly kind: 'subFieldPredicate'} | {readonly kind: 'repairPredicate'};
export interface LegacyCollection {readonly id: string; readonly name: string; readonly description: string; readonly conceptId: string | null}
export interface LegacyRelationType {readonly id: string; readonly name: string; readonly inverseName: string; readonly directed: boolean}
export interface LegacyRelation {readonly id: string; readonly sourceId: string; readonly targetId: string; readonly typeId: string}
export interface LegacyMembership {readonly itemId: string; readonly collectionId: string}
export interface LegacyAssignment {readonly itemId: string; readonly relationId: string}
export interface RepairRecord {readonly id: string; readonly subjectJson: string; readonly predicateJson: string}
export interface ConfiguredEmbedding {readonly region: string; readonly modelId: string}
export interface BootstrapSource {
  readonly legacyImported: SourceProbe<boolean>; readonly collections: SourceProbe<readonly LegacyCollection[]>;
  readonly relationTypes: SourceProbe<readonly LegacyRelationType[]>; readonly relatedFieldUsed: SourceProbe<boolean>;
  readonly relations: SourceProbe<readonly LegacyRelation[]>; readonly memberships: SourceProbe<readonly LegacyMembership[]>;
  readonly assignments: SourceProbe<readonly LegacyAssignment[]>; readonly repairVersion: SourceProbe<bigint>;
  readonly repairRecords: SourceProbe<readonly RepairRecord[]>; readonly configuredEmbedding: SourceProbe<ConfiguredEmbedding | null>;
}
export type BootstrapPhase = 'legacyHeader' | 'collections' | 'termValidation' | 'relationTypes' | 'relatedFieldExistence' | 'relations' | 'memberships' | 'assignments' | 'repairVersion' | 'repairRecords';
export type BootstrapRejection = 'emptyTerm' | 'termTooLong';
export interface BootstrapStop {readonly phase: BootstrapPhase; readonly conceptKey: ConceptCallKey | null; readonly statementId: string | null; readonly reason: {readonly kind: 'deferred'} | {readonly kind: 'invalidBinding'} | {readonly kind: 'rejected'; readonly reason: BootstrapRejection}}
export type TermValidation = {readonly kind: 'prepared'; readonly trimmedText: string; readonly normalizedText: string; readonly language: string} | {readonly kind: 'rejected'; readonly reason: BootstrapRejection};
export interface ConceptIntent {readonly key: ConceptCallKey; readonly label: string; readonly explanation: string; readonly term: TermValidation}
export interface PreparedSemanticSpace {readonly id: string; readonly region: string; readonly modelId: string; readonly dimension: bigint; readonly instructionSetVersion: string}
export interface BootstrapProbePreparation {
  readonly concepts: readonly ConceptIntent[]; readonly termKeys: readonly {readonly normalizedText: string; readonly language: string}[];
  readonly statementCount: bigint; readonly representationRenderVersion: string; readonly semanticNamespace: string;
  readonly semanticSpace: SourceProbe<PreparedSemanticSpace | null>; readonly earliestUnavailable: BootstrapPhase | null; readonly terminal: BootstrapStop | null;
}

const RENDER_VERSION = 'concept-identity-v1';
const available = <T,>(value: T): SourceProbe<T> => ({state: 'available', value});
function normalizeTerm(value: string): string {return value.trim().split(/\s+/u).join(' ').toLowerCase();}
function phaseStop(phase: BootstrapPhase, source: SourceProbe<unknown>): BootstrapStop {
  return {phase, conceptKey: null, statementId: null, reason: source.state === 'deferred' ? {kind: 'deferred'} : {kind: 'invalidBinding'}};
}
function requireProbe<T>(source: SourceProbe<T>, phase: BootstrapPhase): T | BootstrapStop {
  return source.state === 'available' ? source.value : phaseStop(phase, source);
}
function isStop(value: unknown): value is BootstrapStop {return typeof value === 'object' && value !== null && 'phase' in value && 'reason' in value;}
function termValidation(label: string): TermValidation {
  const trimmedText = label.trim(), normalizedText = normalizeTerm(label), language = '';
  if (normalizedText.length === 0) return {kind: 'rejected', reason: 'emptyTerm'};
  if ([...trimmedText].length > 500 || language.length > 32) return {kind: 'rejected', reason: 'termTooLong'};
  return {kind: 'prepared', trimmedText, normalizedText, language};
}
function keyString(value: {readonly normalizedText: string; readonly language: string}): string {return `${value.normalizedText}\u0000${value.language}`;}
function intent(out: {concepts: ConceptIntent[]; termKeys: {readonly normalizedText: string; readonly language: string}[]}, key: ConceptCallKey, label: string, explanation: string): BootstrapStop | null {
  const term = termValidation(label);
  if (term.kind === 'prepared' && !out.termKeys.some(value => keyString(value) === keyString(term))) out.termKeys.push({normalizedText: term.normalizedText, language: term.language});
  out.concepts.push({key, label, explanation, term});
  return term.kind === 'rejected' ? {phase: 'termValidation', conceptKey: key, statementId: null, reason: {kind: 'rejected', reason: term.reason}} : null;
}

function semanticSpace(source: SourceProbe<ConfiguredEmbedding | null>): SourceProbe<PreparedSemanticSpace | null> {
  if (source.state !== 'available') return source;
  if (source.value === null) return available(null);
  const region = source.value.region.trim(), modelId = source.value.modelId.trim();
  const fingerprint = `qwen-embedding|${region}|${modelId}|1024|float32|cosine|l2|document|query|${RENDER_VERSION}`;
  return available({id: `space-${createHash('sha256').update(fingerprint).digest('hex').slice(0, 32)}`, region, modelId, dimension: 1024n, instructionSetVersion: RENDER_VERSION});
}

export function prepareNalBootstrapProbes(source: BootstrapSource): BootstrapProbePreparation {
  const out = {concepts: [] as ConceptIntent[], termKeys: [] as {readonly normalizedText: string; readonly language: string}[], statementCount: 0n, representationRenderVersion: RENDER_VERSION, semanticNamespace: 'accepted_concepts', semanticSpace: {state: 'skipped'} as SourceProbe<PreparedSemanticSpace | null>, earliestUnavailable: null as BootstrapPhase | null, terminal: null as BootstrapStop | null};
  const legacyImported = requireProbe(source.legacyImported, 'legacyHeader');
  if (typeof legacyImported !== 'boolean') {out.terminal = legacyImported; out.earliestUnavailable = legacyImported.reason.kind === 'deferred' ? legacyImported.phase : null; return out;}
  if (!legacyImported) {
    const collections = requireProbe(source.collections, 'collections');
    if (isStop(collections)) {out.terminal = collections; out.earliestUnavailable = collections.reason.kind === 'deferred' ? collections.phase : null; return out;}
    if (collections.length !== 0) {
      for (const entry of [{key: {kind: 'membership'} as ConceptCallKey, label: '原归类', explanation: '从旧集合成员归属迁移；仅表示原有归类，不自动解释为所属领域。'}, {key: {kind: 'tagged'} as ConceptCallKey, label: '旧关系标注', explanation: '有序参数：文献、旧集合端点乘积、关系词项。保留原标签含义，不推断文献间关系。'}]) {const stop = intent(out, entry.key, entry.label, entry.explanation); if (stop !== null) {out.terminal = stop; return out;}}
      for (const collection of collections) {const stop = intent(out, {kind: 'collection', sourceId: collection.id}, collection.name, `从原集合迁移。${collection.description}`); if (stop !== null) {out.terminal = stop; return out;}}
      const linked = collections.filter(value => value.conceptId !== null).length;
      if (linked !== 0) {const stop = intent(out, {kind: 'linkedPredicate'}, '旧概念关联', '旧集合对既有知识概念的可选引用；不合并两者身份。'); if (stop !== null) {out.terminal = stop; return out;} out.statementCount += BigInt(linked);}
      const relationTypes = requireProbe(source.relationTypes, 'relationTypes');
      if (isStop(relationTypes)) {out.terminal = relationTypes; out.earliestUnavailable = relationTypes.reason.kind === 'deferred' ? relationTypes.phase : null; return out;}
      for (const relation of relationTypes) {
        if (relation.id === 'related-field') {const used = requireProbe(source.relatedFieldUsed, 'relatedFieldExistence'); if (typeof used !== 'boolean') {out.terminal = used; out.earliestUnavailable = used.reason.kind === 'deferred' ? used.phase : null; return out;} if (!used) continue;}
        if (relation.id !== 'sub-field') {const stop = intent(out, {kind: 'typePredicate', sourceId: relation.id}, relation.name, `从旧集合关系迁移。反向显示：${relation.inverseName}；有向：${relation.directed}。`); if (stop !== null) {out.terminal = stop; return out;}}
      }
      const relations = requireProbe(source.relations, 'relations');
      if (isStop(relations)) {out.terminal = relations; out.earliestUnavailable = relations.reason.kind === 'deferred' ? relations.phase : null; return out;}
      if (relations.some(value => value.typeId === 'sub-field')) {const stop = intent(out, {kind: 'subFieldPredicate'}, '旧上下位关系', '从旧集合 sub-field 迁移的有向二元关系；不作为继承，传递性需显式定义。'); if (stop !== null) {out.terminal = stop; return out;}}
      for (const relation of relations) out.statementCount += relation.typeId === 'sub-field' ? 1n : relationTypes.some(kind => kind.id === relation.typeId && !kind.directed) ? 2n : 1n;
      const memberships = requireProbe(source.memberships, 'memberships'); if (isStop(memberships)) {out.terminal = memberships; out.earliestUnavailable = memberships.reason.kind === 'deferred' ? memberships.phase : null; return out;} out.statementCount += BigInt(memberships.length);
      const assignments = requireProbe(source.assignments, 'assignments'); if (isStop(assignments)) {out.terminal = assignments; out.earliestUnavailable = assignments.reason.kind === 'deferred' ? assignments.phase : null; return out;} out.statementCount += BigInt(assignments.length);
    }
  }
  const repairVersion = requireProbe(source.repairVersion, 'repairVersion');
  if (typeof repairVersion !== 'bigint') {out.terminal = repairVersion; out.earliestUnavailable = repairVersion.reason.kind === 'deferred' ? repairVersion.phase : null; return out;}
  if (repairVersion !== 1n) {const records = requireProbe(source.repairRecords, 'repairRecords'); if (isStop(records)) {out.terminal = records; out.earliestUnavailable = records.reason.kind === 'deferred' ? records.phase : null; return out;} if (records.length !== 0) {const stop = intent(out, {kind: 'repairPredicate'}, '旧上下位关系', '从旧集合 sub-field 迁移的有向二元关系；不作为继承，传递性需显式定义。'); if (stop !== null) {out.terminal = stop; return out;}}}
  if (out.concepts.length !== 0) out.semanticSpace = semanticSpace(source.configuredEmbedding);
  return out;
}
