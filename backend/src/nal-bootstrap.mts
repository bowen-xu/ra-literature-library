/** Pure NAL bootstrap preparation migrated from the archived native implementation. */
import {createHash} from 'node:crypto';
import type {KnowledgeTerm} from '../../../../ra-workbench-sdk/packages/workbench-backend-sdk/src/knowledge-snapshot.js';
import type {NalConcept, NalRule, NalState, NalTerm} from '../../../../ra-workbench-sdk/packages/workbench-backend-sdk/src/nal-state.js';
import type {NalAnnotation} from '../../../../ra-workbench-sdk/packages/workbench-backend-sdk/src/nal-annotation.js';
import type {
  BootstrapInputV1, BootstrapPhaseV1, BootstrapRejectionV1, BootstrapStopReasonV1, BootstrapStopV1,
  SourceProbe, TermResolutionV1, PreparedConceptV1, PreparedConceptDetailsV1, PreparedGenerationV1,
  PreparedImportV1, ImportPreparationV1, PreparedNalStatementV1, PreparedRepresentationV1, PreparedSemanticQueueV1,
  QueueResolutionV1, RepairPreparationV1, CleanupPreparationV1, StateProjectionV1, BootstrapPreparationV1,
} from '../../../../ra-workbench-sdk/packages/workbench-backend-sdk/src/nal-bootstrap.js';
import {prepareNalBootstrapProbes} from './nal-bootstrap-probes.mts';
import type {
  BootstrapSourceV1, ConceptCallKeyV1, ConceptIdentitySlotsV1, ConceptIntentV1, ConceptSemanticFactV1,
  ExistingGenerationV1, LegacyAssignmentV1, LegacyCollectionV1, LegacyRelationTypeV1, LegacyRelationV1,
  RepairRecordV1, TermLookupFactV1, TermLookupKeyV1, TermValidationV1, PreparedSemanticSpaceV1, RawNalStateV1,
} from '../../../../ra-workbench-sdk/packages/workbench-backend-sdk/src/nal-bootstrap.js';

const RENDER_VERSION = 'concept-identity-v1';
const MIN_I64 = -(1n << 63n);
const MAX_I64 = (1n << 63n) - 1n;

const ready = <T,>(value: T): SourceProbe<T> => ({state: 'available', value});
const skipped = <T,>(): SourceProbe<T> => ({state: 'skipped'});
const deferred = <T,>(): SourceProbe<T> => ({state: 'deferred'});

function stop(phase: BootstrapPhaseV1, reason: BootstrapStopReasonV1): BootstrapStopV1 {
  return {phase, conceptKey: null, statementId: null, reason};
}
function requireProbe<T>(probe: SourceProbe<T>, phase: BootstrapPhaseV1): T | BootstrapStopV1 {
  return probe.state === 'available' ? probe.value : stop(phase, probe.state === 'deferred' ? {kind: 'deferred'} : {kind: 'invalidBinding'});
}
function isStop(value: unknown): value is BootstrapStopV1 {
  return value !== null && typeof value === 'object' && 'phase' in value && 'reason' in value;
}
function keyOf(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => typeof item === 'bigint' ? `${item}n` : item);
}
function conceptKeyOf(key: ConceptCallKeyV1): string {return keyOf(key);}
function nameKey(value: string): string {return [...new TextEncoder().encode(value)].map(byte => byte.toString(16).padStart(2, '0').toUpperCase()).join('');}
function normalizeTerm(value: string): string {return value.trim().split(/\s+/u).filter(Boolean).join(' ').toLowerCase();}
function validateName(value: string): BootstrapRejectionV1 | null {
  const name = value.trim();
  if (name.length === 0 || [...name].length > 500) return 'invalidNameLength';
  if (name.split('`').some(part => part.trim().length === 0)) return 'emptyNameContext';
  return null;
}
function renderPrepared(details: PreparedConceptDetailsV1, text: string): string {
  return JSON.stringify({kind: 'concept_identity_v1', preferred_term: text, aliases: [], label: details.label,
    explanation: details.explanation, disambiguation: details.disambiguation, domain: details.domain,
    tradition: details.tradition, period: details.period});
}
function embeddingSpaceId(region: string, modelId: string): string {
  const fingerprint = `qwen-embedding|${region.trim()}|${modelId.trim()}|1024|float32|cosine|l2|document|query|${RENDER_VERSION}`;
  return `space-${createHash('sha256').update(fingerprint).digest('hex').slice(0, 32)}`;
}
function stableRowId(representationId: string, spaceId: string, generation: bigint): string {
  return `row-${createHash('sha256').update(`${representationId}|${spaceId}|${generation}`).digest('hex').slice(0, 32)}`;
}
function termValidation(text: string, language: string): TermValidationV1 {
  const trimmedText = text.trim(), normalizedText = normalizeTerm(trimmedText), trimmedLanguage = language.trim();
  const reason: BootstrapRejectionV1 | null = normalizedText.length === 0 ? 'emptyTerm'
    : ([...trimmedText].length > 500 || [...trimmedLanguage].length > 32 ? 'termTooLong' : null);
  return reason === null ? {kind: 'prepared', trimmedText, normalizedText, language: trimmedLanguage} : {kind: 'rejected', reason};
}
function sourceConcept(source: string): NalTerm {return {kind: 'concept', id: source};}
function sourceProduct(terms: NalTerm[]): NalTerm {return {kind: 'product', terms};}
function decodeTerm(value: unknown): NalTerm {
  if (value === null || typeof value !== 'object' || Array.isArray(value) || !('kind' in value)) throw new Error('invalid structure');
  const row = value as Record<string, unknown>;
  if (row.kind === 'concept' || row.kind === 'paper') {
    if (typeof row.id !== 'string') throw new Error('invalid structure');
    return {kind: row.kind, id: row.id};
  }
  if (row.kind === 'product' && Array.isArray(row.terms)) return {kind: 'product', terms: row.terms.map(decodeTerm)};
  throw new Error('invalid structure');
}
function decodeTermJson(value: string): NalTerm {return decodeTerm(JSON.parse(value) as unknown);}
function encodeTerm(value: NalTerm): string {return JSON.stringify(value);}

class Planner {
  readonly input: BootstrapInputV1;
  readonly concepts: PreparedConceptV1[] = [];
  private statementCursor = 0;
  private readonly terms: {key: TermLookupKeyV1; value: TermResolutionV1}[] = [];
  private occupied: Set<string> | undefined;
  private generation: PreparedGenerationV1 | undefined;
  constructor(input: BootstrapInputV1) {this.input = input;}

  id(key: ConceptCallKeyV1, phase: BootstrapPhaseV1 = 'termValidation'): string | BootstrapStopV1 {
    const value = this.input.identities.concepts.find(candidate => conceptKeyOf(candidate.key) === conceptKeyOf(key));
    return value?.conceptId ?? stop(phase, {kind: 'invalidBinding'});
  }

  concept(key: ConceptCallKeyV1): string | BootstrapStopV1 {
    const intent = this.input.probes.concepts.find(candidate => conceptKeyOf(candidate.key) === conceptKeyOf(key));
    const slots = this.input.identities.concepts.find(candidate => conceptKeyOf(candidate.key) === conceptKeyOf(key));
    if (!intent || !slots) return stop('termValidation', {kind: 'invalidBinding'});
    const output: MutablePreparedConcept = {key, term: skipped(), conceptId: slots.conceptId, conceptRevisionId: slots.conceptRevisionId,
      nameChecks: [], details: skipped(), representation: skipped(), semanticGeneration: skipped(), semanticQueue: skipped()};
    try {this.prepare(intent, slots, output);}
    catch (cause) {
      if (!isStop(cause)) throw cause;
      this.concepts.push(output);
      return {...cause, conceptKey: key};
    }
    this.concepts.push(output);
    return slots.conceptId;
  }

  private prepare(intent: ConceptIntentV1, slots: ConceptIdentitySlotsV1, output: MutablePreparedConcept): void {
    const term = this.resolveTerm(intent.term, slots);
    const text = term.kind === 'existing' ? term.term.text : term.text;
    const language = term.kind === 'existing' ? term.term.language : term.language;
    output.term = ready(term);
    if (!this.occupied) {
      const names = requireProbe(this.input.source.occupiedNameKeys, 'conceptNameCollision');
      if (isStop(names)) throw names;
      this.occupied = new Set(names);
    }
    let name = intent.label.trim(), index = 2;
    while (true) {
      const exists = this.occupied.has(nameKey(name)); output.nameChecks.push({candidate: name, exists});
      if (!exists) break;
      const suffix = `\`旧归类-${index}`;
      name = `${[...intent.label].slice(0, Math.max(0, 500 - [...suffix].length)).join('').replace(/`+$/u, '')}${suffix}`; index++;
    }
    const rejection = validateName(name) ?? ([...name].length > 500 ? 'conceptFieldsTooLong' : null);
    const available = !this.occupied.has(nameKey(name.trim()));
    const details: PreparedConceptDetailsV1 = {label: name.trim(), explanation: intent.explanation.trim(),
      disambiguation: '从旧文献归类迁移，保持原身份区分', domain: '', tradition: '', period: '', rejection, available};
    output.details = ready(details);
    if (rejection) throw stop('conceptValidation', {kind: 'rejected', reason: rejection});
    if (!available) throw stop('conceptNameAvailability', {kind: 'rejected', reason: 'nameUnavailable'});
    this.occupied.add(nameKey(details.label));
    let renderedText: string;
    try {renderedText = renderPrepared(details, text);} catch {throw stop('semanticRender', {kind: 'rejected', reason: 'invalidStructure'});}
    const fact = this.input.facts.concepts.find(candidate => conceptKeyOf(candidate.key) === conceptKeyOf(intent.key));
    if (!fact) throw stop('representationLookup', {kind: 'invalidBinding'});
    const existing = requireProbe(fact.representation, 'representationLookup'); if (isStop(existing)) throw existing;
    const representation: PreparedRepresentationV1 = {id: existing ?? slots.representationId, existing: existing !== null,
      inputSha256: createHash('sha256').update(renderedText).digest('hex'), renderedText, renderVersion: RENDER_VERSION, language};
    output.representation = ready(representation);
    const semantic = requireProbe(this.input.probes.semanticSpace, 'embeddingSettings'); if (isStop(semantic)) throw semantic;
    if (semantic === null) {output.semanticQueue = ready(null); return;}
    const generation = this.resolveGeneration(semantic); output.semanticGeneration = ready(generation);
    const existingJob = requireProbe(fact.queueJob, 'queueLookup'); if (isStop(existingJob)) throw existingJob;
    const job: QueueResolutionV1 = existingJob === null ? {kind: 'create', recordId: slots.recordId, jobId: slots.jobId,
      rowId: stableRowId(representation.id, semantic.id, generation.generation), idempotencyKey: `embedding:${slots.recordId}:1`}
      : {kind: 'existing', jobId: existingJob};
    const queue: PreparedSemanticQueueV1 = {space: semantic, generation, job}; output.semanticQueue = ready(queue);
  }

  private resolveTerm(validation: TermValidationV1, slots: ConceptIdentitySlotsV1): TermResolutionV1 {
    if (validation.kind === 'rejected') throw stop('termValidation', {kind: 'rejected', reason: validation.reason});
    const key: TermLookupKeyV1 = {normalizedText: validation.normalizedText, language: validation.language};
    const previous = this.terms.find(entry => keyOf(entry.key) === keyOf(key));
    if (previous) return previous.value.kind === 'existing' ? {kind: 'existing', term: previous.value.term} : {kind: 'planned', id: previous.value.id,
      text: previous.value.text, normalizedText: previous.value.normalizedText, language: previous.value.language};
    const fact: TermLookupFactV1 | undefined = this.input.facts.terms.find(candidate => keyOf(candidate.key) === keyOf(key));
    if (!fact) throw stop('termLookup', {kind: 'invalidBinding'});
    const phase: BootstrapPhaseV1 = fact.failurePhase === null || fact.failurePhase === 'termLookup' ? 'termLookup' : fact.failurePhase === 'termReadback' ? 'termReadback' : (() => {throw stop('termLookup', {kind: 'invalidBinding'});})();
    const existing = requireProbe(fact.result, phase); if (isStop(existing)) throw existing;
    const value: TermResolutionV1 = existing === null ? {kind: 'create', id: slots.termId, text: validation.trimmedText,
      normalizedText: validation.normalizedText, language: validation.language, revisionId: slots.termRevisionId}
      : {kind: 'existing', term: existing};
    this.terms.push({key, value}); return value;
  }

  private resolveGeneration(space: PreparedSemanticSpaceV1): PreparedGenerationV1 {
    if (this.generation) return {...this.generation, create: false};
    const current = requireProbe(this.input.facts.generation, 'activeGeneration'); if (isStop(current)) throw current;
    let result: PreparedGenerationV1;
    if (current) result = {id: current.id, embeddingSpaceId: current.embeddingSpaceId, generation: current.generation, create: false,
      relativeDatabasePath: `${space.id}/generation-${current.generation.toString().padStart(6, '0')}`};
    else {
      const generation = requireProbe(this.input.facts.nextGeneration, 'nextGeneration'); if (isStop(generation)) throw generation;
      if (this.input.identities.generationId === null) throw stop('generationInsert', {kind: 'invalidBinding'});
      result = {id: this.input.identities.generationId, embeddingSpaceId: space.id, generation, create: true,
        relativeDatabasePath: `${space.id}/generation-${generation.toString().padStart(6, '0')}`};
    }
    this.generation = result; return result;
  }

  statement(phase: BootstrapPhaseV1, subject: NalTerm, predicate: string): PreparedNalStatementV1 | BootstrapStopV1 {
    const id = this.input.identities.statementIds[this.statementCursor++];
    if (id === undefined) return stop(phase, {kind: 'invalidBinding'});
    try {return {relationConceptId: subject.kind === 'product' ? predicate : null,
      statement: {id, subjectJson: encodeTerm(subject), predicateJson: encodeTerm(sourceConcept(predicate)), origin: 'legacy'}};}
    catch {return stop(phase, {kind: 'rejected', reason: 'invalidStructure'});}
  }
}

type MutablePreparedConcept = {
  key: ConceptCallKeyV1;
  term: SourceProbe<TermResolutionV1>;
  conceptId: string;
  conceptRevisionId: string;
  nameChecks: {candidate: string; exists: boolean}[];
  details: SourceProbe<PreparedConceptDetailsV1>;
  representation: SourceProbe<PreparedRepresentationV1>;
  semanticGeneration: SourceProbe<PreparedGenerationV1>;
  semanticQueue: SourceProbe<PreparedSemanticQueueV1 | null>;
};

interface ImportFields {
  active: boolean; membership: string | null; tagged: string | null; collections: {sourceId: string; conceptId: string}[];
  linkedPredicate: string | null; typePredicates: {sourceId: string; conceptId: string; directed: boolean}[];
  relatedFieldProbe: {sourceId: string; result: SourceProbe<boolean>} | null; subfieldPredicate: string | null;
  linkedStatements: PreparedNalStatementV1[]; relationStatements: PreparedNalStatementV1[];
  membershipStatements: PreparedNalStatementV1[]; assignmentStatements: PreparedNalStatementV1[];
}
function importFields(): ImportFields {return {active: false, membership: null, tagged: null, collections: [], linkedPredicate: null, typePredicates: [], relatedFieldProbe: null,
  subfieldPredicate: null, linkedStatements: [], relationStatements: [], membershipStatements: [], assignmentStatements: []};}
function statementsOf(value: ImportFields): PreparedNalStatementV1[] {return [...value.linkedStatements, ...value.relationStatements, ...value.membershipStatements, ...value.assignmentStatements];}
function binding<T>(value: T | undefined, phase: BootstrapPhaseV1): T | BootstrapStopV1 {return value === undefined ? stop(phase, {kind: 'invalidBinding'}) : value;}
function call(planner: Planner, key: ConceptCallKeyV1, target: {value: string | null}): BootstrapStopV1 | null {
  const id = planner.id(key); if (isStop(id)) return id; target.value = id; const created = planner.concept(key); return isStop(created) ? created : null;
}

function importLegacy(planner: Planner, output: ImportFields): BootstrapStopV1 | null {
  const legacy = requireProbe(planner.input.source.legacyImported, 'legacyHeader'); if (isStop(legacy)) return legacy;
  if (legacy) return null;
  output.active = true;
  const collections = requireProbe(planner.input.source.collections, 'collections'); if (isStop(collections)) return collections;
  if (collections.length === 0) return null;
  let terminal = call(planner, {kind: 'membership'}, {get value() {return output.membership;}, set value(value: string | null) {output.membership = value;}});
  if (terminal) return terminal;
  terminal = call(planner, {kind: 'tagged'}, {get value() {return output.tagged;}, set value(value: string | null) {output.tagged = value;}}); if (terminal) return terminal;
  const ids = new Map<string, string>(), linked: [string, string][] = [];
  for (const collection of collections) {
    const key: ConceptCallKeyV1 = {kind: 'collection', sourceId: collection.id}; const id = planner.id(key); if (isStop(id)) return id;
    output.collections.push({sourceId: collection.id, conceptId: id}); const created = planner.concept(key); if (isStop(created)) return created;
    if (collection.conceptId !== null) linked.push([id, collection.conceptId]); ids.set(collection.id, id);
  }
  if (linked.length) {
    const holder = {value: output.linkedPredicate}; terminal = call(planner, {kind: 'linkedPredicate'}, holder); if (terminal) return terminal; output.linkedPredicate = holder.value;
    const predicate = binding(output.linkedPredicate ?? undefined, 'collections'); if (isStop(predicate)) return predicate;
    for (const [collection, existing] of linked) {const row = planner.statement('collections', sourceProduct([sourceConcept(collection), sourceConcept(existing)]), predicate); if (isStop(row)) return row; output.linkedStatements.push(row);}
  }
  const types = requireProbe(planner.input.source.relationTypes, 'relationTypes'); if (isStop(types)) return types;
  const predicates = new Map<string, {id: string; directed: boolean}>();
  for (const type of types) {
    if (type.id === 'related-field') {
      output.relatedFieldProbe = {sourceId: type.id, result: planner.input.source.relatedFieldUsed};
      const used = requireProbe(planner.input.source.relatedFieldUsed, 'relatedFieldExistence'); if (isStop(used)) return used; if (!used) continue;
    }
    if (type.id === 'sub-field') continue;
    const key: ConceptCallKeyV1 = {kind: 'typePredicate', sourceId: type.id}; const id = planner.id(key); if (isStop(id)) return id;
    output.typePredicates.push({sourceId: type.id, conceptId: id, directed: type.directed}); const created = planner.concept(key); if (isStop(created)) return created;
    predicates.set(type.id, {id, directed: type.directed});
  }
  const relations = requireProbe(planner.input.source.relations, 'relations'); if (isStop(relations)) return relations;
  if (relations.some(value => value.typeId === 'sub-field')) {const holder = {value: output.subfieldPredicate}; terminal = call(planner, {kind: 'subFieldPredicate'}, holder); if (terminal) return terminal; output.subfieldPredicate = holder.value;}
  const relationTerms = new Map<string, {term: NalTerm; predicate: string}>();
  for (const relation of relations) {
    const source = binding(ids.get(relation.sourceId), 'relations'); if (isStop(source)) return source;
    const target = binding(ids.get(relation.targetId), 'relations'); if (isStop(target)) return target;
    const predicate = relation.typeId === 'sub-field' ? binding(output.subfieldPredicate ?? undefined, 'relations') : binding(predicates.get(relation.typeId), 'relations'); if (isStop(predicate)) return predicate;
    const relationId = typeof predicate === 'string' ? predicate : predicate.id, directed = typeof predicate === 'string' ? true : predicate.directed;
    const first = sourceProduct([sourceConcept(source), sourceConcept(target)]); let row = planner.statement('relations', first, relationId); if (isStop(row)) return row; output.relationStatements.push(row);
    if (!directed) {row = planner.statement('relations', sourceProduct([sourceConcept(target), sourceConcept(source)]), relationId); if (isStop(row)) return row; output.relationStatements.push(row);}
    relationTerms.set(relation.id, {term: first, predicate: relationId});
  }
  const memberships = requireProbe(planner.input.source.memberships, 'memberships'); if (isStop(memberships)) return memberships;
  for (const member of memberships) {const target = binding(ids.get(member.collectionId), 'memberships'); if (isStop(target)) return target; const predicate = binding(output.membership ?? undefined, 'memberships'); if (isStop(predicate)) return predicate; const row = planner.statement('memberships', sourceProduct([{kind: 'paper', id: member.itemId}, sourceConcept(target)]), predicate); if (isStop(row)) return row; output.membershipStatements.push(row);}
  const assignments = requireProbe(planner.input.source.assignments, 'assignments'); if (isStop(assignments)) return assignments;
  for (const assignment of assignments) {const pair = binding(relationTerms.get(assignment.relationId), 'assignments'); if (isStop(pair)) return pair; const predicate = binding(output.tagged ?? undefined, 'assignments'); if (isStop(predicate)) return predicate; const row = planner.statement('assignments', sourceProduct([{kind: 'paper', id: assignment.itemId}, pair.term, sourceConcept(pair.predicate)]), predicate); if (isStop(row)) return row; output.assignmentStatements.push(row);}
  return null;
}

function repairLegacy(planner: Planner, active: {value: boolean}, relation: {value: string | null}, rewrites: RawNalStatement[]): BootstrapStopV1 | null {
  const version = requireProbe(planner.input.source.repairVersion, 'repairVersion'); if (isStop(version)) return version; if (version === 1n) return null; active.value = true;
  const records = requireProbe(planner.input.source.repairRecords, 'repairRecords'); if (isStop(records)) return records; if (records.length === 0) return null;
  const holder = {value: relation.value}; const terminal = call(planner, {kind: 'repairPredicate'}, holder); if (terminal) return terminal; relation.value = holder.value;
  const predicate = binding(relation.value ?? undefined, 'repairRole'); if (isStop(predicate)) return predicate;
  for (const record of records) {
    let subject: NalTerm, predicateTerm: NalTerm;
    try {subject = decodeTermJson(record.subjectJson); predicateTerm = decodeTermJson(record.predicateJson);} catch {return {...stop('repairTermDecode', {kind: 'rejected', reason: 'invalidStructure'}), statementId: record.id};}
    rewrites.push({id: record.id, subjectJson: encodeTerm(sourceProduct([subject, predicateTerm])), predicateJson: encodeTerm(sourceConcept(predicate)), origin: 'legacy'});
  }
  return null;
}

export function projectRules(ids: readonly string[]): NalRule[] {return ids.map(id => ({id: `transitive:${id}`, kind: 'transitive', relationConceptId: id}));}
function references(term: NalTerm, concept: string): boolean {return term.kind === 'concept' ? term.id === concept : term.kind === 'product' ? term.terms.some(item => references(item, concept)) : false;}
function obsolete(concept: NalConcept): boolean {return concept.label === 'related-field' && ['旧集合关系。反向显示：related-field；有向：false。', '从旧集合关系迁移。反向显示：related-field；有向：false。'].includes(concept.explanation);}
function decodeState(raw: MutableRawNalState): NalState {
  return {revision: raw.revision, concepts: raw.concepts, statements: raw.statements.map(row => ({id: row.id, subject: decodeTermJson(row.subjectJson), predicate: decodeTermJson(row.predicateJson), origin: row.origin})), annotations: raw.annotations, rules: projectRules(raw.relationConceptIds)};
}
function overflow(value: bigint): boolean {return value < MIN_I64 || value > MAX_I64;}

function finishProjection(source: BootstrapSourceV1, concepts: readonly PreparedConceptV1[], statements: readonly PreparedNalStatementV1[], rewrites: readonly RawNalStatement[], imported: boolean, repaired: boolean): [CleanupPreparationV1, StateProjectionV1, BootstrapStopV1 | null] {
  const cleanupExists = requireProbe(source.cleanupExists, 'cleanupExistence'); if (isStop(cleanupExists)) return [{kind: 'deferred'}, {kind: 'deferred'}, cleanupExists];
  const rawProbe = requireProbe(source.rawState, 'finalLoad'); if (isStop(rawProbe)) return [{kind: 'deferred'}, {kind: 'deferred'}, rawProbe];
  const raw = structuredClone(rawProbe) as unknown as MutableRawNalState; const fresh = new Set<string>(concepts.map(concept => concept.conceptId));
  for (const concept of concepts) {if (concept.details.state !== 'available') return [{kind: 'deferred'}, {kind: 'deferred'}, stop('conceptReadback', {kind: 'invalidBinding'})]; raw.concepts.push({id: concept.conceptId, label: concept.details.value.label, explanation: concept.details.value.explanation, revision: 1n, conceptKind: 'ordinary'});}
  let revision = raw.revision + BigInt(concepts.length) + BigInt(imported ? 1 : 0) + BigInt(repaired ? 1 : 0);
  if (overflow(revision)) return [raw.concepts.some(obsolete) ? {kind: 'decodeAtOriginalPoint'} : {kind: 'skipped'}, {kind: 'decodeAtOriginalPoint'}, null];
  raw.revision = revision; const rules = projectRules(raw.relationConceptIds);
  for (const prepared of statements) {if (prepared.relationConceptId !== null && fresh.has(prepared.relationConceptId)) {const concept = raw.concepts.find(value => value.id === prepared.relationConceptId); if (concept) concept.conceptKind = 'relation';} if (!raw.statements.some(value => value.subjectJson === prepared.statement.subjectJson && value.predicateJson === prepared.statement.predicateJson)) raw.statements.push(prepared.statement);}
  for (const rewrite of rewrites) {const existing = raw.statements.find(value => value.id === rewrite.id); if (existing) Object.assign(existing, rewrite);}
  if (repaired) {const relation = concepts.find(value => value.key.kind === 'repairPredicate'); const concept = relation ? raw.concepts.find(value => value.id === relation.conceptId) : undefined; if (concept) concept.conceptKind = 'relation';}
  raw.concepts = [...raw.concepts].sort((a, b) => a.label.localeCompare(b.label) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const needsCleanup = raw.concepts.some(obsolete); let decoded: NalState;
  try {decoded = decodeState(raw);} catch {return [needsCleanup ? {kind: 'decodeAtOriginalPoint'} : {kind: 'skipped'}, {kind: 'decodeAtOriginalPoint'}, stop(needsCleanup ? 'cleanupLoad' : 'finalLoad', {kind: 'rejected', reason: 'invalidStructure'})];}
  const deleteIds = needsCleanup ? decoded.concepts.filter(concept => obsolete(concept) && !decoded.statements.some(statement => references(statement.subject, concept.id) || references(statement.predicate, concept.id)) && !decoded.annotations.some(annotation => annotation.targetKind === 'concept' && annotation.targetId === concept.id) && !decoded.rules.some(rule => rule.relationConceptId === concept.id)).map(concept => concept.id) : [];
  const cleanup: CleanupPreparationV1 = needsCleanup ? {kind: 'prepared', deleteIds, expectedPostRepair: structuredClone(raw)} : {kind: 'skipped'};
  raw.concepts = raw.concepts.filter(concept => !deleteIds.includes(concept.id)); revision = raw.revision + BigInt(deleteIds.length); if (overflow(revision)) return [cleanup, {kind: 'decodeAtOriginalPoint'}, null]; raw.revision = revision;
  return [cleanup, {kind: 'prepared', rawState: raw, rules}, null];
}

export function prepareNalBootstrap(input: BootstrapInputV1): BootstrapPreparationV1 {
  const planner = new Planner(input), imported = importFields(), repairActive = {value: false}, relation = {value: null as string | null}, rewrites: RawNalStatement[] = [];
  const expected = prepareNalBootstrapProbes(input.source);
  let terminal: BootstrapStopV1 | null = keyOf(expected) !== keyOf(input.probes) || BigInt(input.identities.statementIds.length) !== input.probes.statementCount
    ? stop('legacyHeader', {kind: 'invalidBinding'}) : null;
  if (!terminal) terminal = importLegacy(planner, imported);
  if (!terminal) terminal = repairLegacy(planner, repairActive, relation, rewrites);
  let cleanup: CleanupPreparationV1, projection: StateProjectionV1;
  if (terminal) [cleanup, projection] = [{kind: 'deferred'}, {kind: 'deferred'}];
  else [cleanup, projection, terminal] = finishProjection(input.source, planner.concepts, statementsOf(imported), rewrites, imported.active, repairActive.value);
  const importPlan: ImportPreparationV1 = imported.active ? {kind: 'prepared', membership: imported.membership, tagged: imported.tagged, collections: imported.collections, linkedPredicate: imported.linkedPredicate, typePredicates: imported.typePredicates, relatedFieldProbe: imported.relatedFieldProbe, subfieldPredicate: imported.subfieldPredicate, linkedStatements: imported.linkedStatements, relationStatements: imported.relationStatements, membershipStatements: imported.membershipStatements, assignmentStatements: imported.assignmentStatements} : {kind: 'skipped'};
  const repairPlan: RepairPreparationV1 = repairActive.value ? {kind: 'prepared', relation: relation.value, rewrites} : {kind: 'skipped'};
  return {concepts: planner.concepts, import: importPlan, repair: repairPlan, cleanup, finalProjection: projection, terminal};
}

export type RawNalStatement = {id: string; subjectJson: string; predicateJson: string; origin: string};
export type RawNalState = {revision: bigint; concepts: NalConcept[]; statements: RawNalStatement[]; annotations: NalAnnotation[]; relationConceptIds: string[]};
type MutableNalConcept = {id: string; label: string; explanation: string; revision: bigint; conceptKind: string};
type MutableRawNalState = {revision: bigint; concepts: MutableNalConcept[]; statements: RawNalStatement[]; annotations: NalAnnotation[]; relationConceptIds: string[]};
export type BootstrapSource = BootstrapSourceV1;
