/** NAL mutation plan preparation migrated from the archived native adapter. */
import {prepareNalAnnotationLink, type NalAnnotation} from './nal-annotation.mts';
import {prepareNalBootstrap, projectRules} from './nal-bootstrap.mts';
import type {BootstrapInputV1} from '../../../../ra-workbench-sdk/packages/workbench-backend-sdk/src/nal-bootstrap.js';
import type {NalMutationPrepareInput, NalMutationPreparation, NalMutationPlan, NalTermPreparation, NalStatementPreparation, NalStatementBatchPreparation, NalConceptKindPreparation, NalTransitivityAction, NalMutationRejection} from '../../../../ra-workbench-sdk/packages/workbench-backend-sdk/src/nal-mutation/plans.js';
import type {NalMutation} from '../../../../ra-workbench-sdk/packages/workbench-backend-sdk/src/nal-mutation.js';
import type {NalStatement, NalTerm} from '../../../../ra-workbench-sdk/packages/workbench-backend-sdk/src/nal-state.js';

type RawMutation = NalMutation;
const reject = (reason: NalMutationRejection): {kind: 'rejected'; reason: NalMutationRejection} => ({kind: 'rejected', reason});
const failure = (reason: NalMutationRejection): never => {throw new Error(`literature_nal_mutation_invalid:${reason}`);};

function termPreparation(value: NalTerm, depth: number, budget: {value: number}): [NalTermPreparation, boolean] {
  if (depth > 12 || budget.value === 0) return [reject('termStructureTooLarge'), true];
  budget.value--;
  if (value.kind === 'product') {
    if (value.terms.length < 2 || value.terms.length > 16) return [reject('productArity'), true];
    const terms: NalTermPreparation[] = [];
    for (const child of value.terms) {const [prepared, stopped] = termPreparation(child, depth + 1, budget); terms.push(prepared); if (stopped) return [{kind: 'product', terms}, true];}
    return [{kind: 'product', terms}, false];
  }
  const valid = value.id.trim().length !== 0 && new TextEncoder().encode(value.id).byteLength <= 200;
  if (!valid) return [reject('invalidTermIdentity'), true];
  return [value.kind === 'concept' ? {kind: 'concept', id: value.id, missingRejection: 'missingTerm'} : {kind: 'paper', id: value.id, missingRejection: 'missingTerm'}, false];
}

function statementIdentity(value: NalStatement): NalMutationRejection | null {
  return value.origin === 'human' && value.id.trim().length !== 0 && new TextEncoder().encode(value.id).byteLength <= 200 ? null : 'invalidStatementIdentityOrOrigin';
}
function statementsPlan(values: readonly NalStatement[]): NalStatementBatchPreparation {
  if (values.length < 1 || values.length > 500) return {kind: 'rejected', reason: 'invalidStatementCount'};
  const budget = {value: 16_000}; const statements: NalStatementPreparation[] = [];
  for (const value of values) {
    const identity = statementIdentity(value);
    if (identity !== null) {statements.push({kind: 'rejectedIdentity', id: value.id, origin: value.origin, reason: identity}); break;}
    const [subject, subjectStopped] = termPreparation(value.subject, 0, budget);
    if (subjectStopped) {statements.push({kind: 'subjectRejected', id: value.id, origin: value.origin, subject}); break;}
    const [predicate, predicateStopped] = termPreparation(value.predicate, 0, budget);
    if (predicateStopped) {statements.push({kind: 'predicateRejected', id: value.id, origin: value.origin, subject, predicate}); break;}
    statements.push({kind: 'ready', id: value.id, origin: value.origin, subject, predicate, subjectJson: JSON.stringify(value.subject), predicateJson: JSON.stringify(value.predicate)});
  }
  return {kind: 'prepared', statements};
}
function conceptKind(value: string): NalConceptKindPreparation {
  if (value !== 'ordinary' && value !== 'relation') return {kind: 'rejected', reason: 'invalidConceptKind'};
  return {kind: 'readUsage', conceptKind: value, onUsed: value === 'ordinary' ? {kind: 'reject', reason: 'conceptUsedAsRelation'} : {kind: 'continue'}};
}
function transitivity(enabled: boolean): NalTransitivityAction {return enabled ? {kind: 'enable', missingRejection: 'notRelation'} : {kind: 'disable'};}
function parseMutation(value: string): RawMutation {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed) || !('kind' in parsed)) return failure('invalidTermIdentity');
    return parsed as RawMutation;
  } catch {throw new Error('literature_nal_mutation_invalid_json');}
}

export function prepareNalMutation(input: NalMutationPrepareInput): NalMutationPreparation {
  const mutation = parseMutation(input.mutationJson);
  const bootstrap = prepareNalBootstrap(input.bootstrap as BootstrapInputV1);
  if (bootstrap.terminal !== null || bootstrap.finalProjection.kind !== 'prepared') return {bootstrap, decision: {kind: 'deferredAfterBootstrap'}, ruleProjection: []};
  const raw = bootstrap.finalProjection.rawState;
  const relationIds = [...raw.relationConceptIds];
  if (mutation.kind === 'set_transitivity' && !relationIds.includes(mutation.relationConceptId)) relationIds.push(mutation.relationConceptId);
  let plan: NalMutationPlan;
  switch (mutation.kind) {
    case 'delete_concept': plan = {kind: 'deleteConcept', id: mutation.id, missingRejection: 'missingConcept'}; break;
    case 'set_concept_kind': {const [term] = termPreparation({kind: 'concept', id: mutation.conceptId}, 0, {value: 1}); plan = {kind: 'setConceptKind', conceptId: mutation.conceptId, term, afterTerm: conceptKind(mutation.conceptKind)}; break;}
    case 'set_transitivity': {const [term] = termPreparation({kind: 'concept', id: mutation.relationConceptId}, 0, {value: 1}); plan = {kind: 'setTransitivity', relationConceptId: mutation.relationConceptId, term, action: transitivity(mutation.enabled)}; break;}
    case 'add_statements': plan = {kind: 'addStatements', batch: statementsPlan(mutation.statements)}; break;
    case 'delete_statement': plan = {kind: 'deleteStatement', id: mutation.id, missingRejection: 'missingStatement'}; break;
    case 'link_annotation': plan = {kind: 'linkAnnotation', annotation: mutation.annotation, link: prepareNalAnnotationLink(mutation.annotation as NalAnnotation, raw.annotations)}; break;
    case 'unlink_annotation': plan = {kind: 'unlinkAnnotation', id: mutation.id}; break;
    default: return failure('invalidTermIdentity');
  }
  return {bootstrap, decision: {kind: 'prepared', mutation: plan}, ruleProjection: projectRules(relationIds)};
}
