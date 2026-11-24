import assert from 'node:assert/strict';
import test from 'node:test';
import {prepareNalBootstrap} from './nal-bootstrap.mts';
import {prepareNalBootstrapProbes} from './nal-bootstrap-probes.mts';
import type {BootstrapInputV1, BootstrapSourceV1} from '../../../../ra-workbench-sdk/packages/workbench-backend-sdk/src/nal-bootstrap.js';

const available = <T,>(value: T) => ({state: 'available', value} as const);
const skipped = {state: 'skipped'} as const;
const source = (): BootstrapSourceV1 => ({legacyImported: available(false), collections: available([]), relationTypes: skipped,
  relatedFieldUsed: skipped, relations: skipped, memberships: skipped, assignments: skipped, repairVersion: available(1n),
  repairRecords: skipped, cleanupExists: available(false), rawState: available({revision: 0n, concepts: [], statements: [], annotations: [], relationConceptIds: []}),
  occupiedNameKeys: available([]), configuredEmbedding: available(null)});
function input(value: BootstrapSourceV1): BootstrapInputV1 {
  const probes = prepareNalBootstrapProbes(value);
  return {source: value, probes, identities: {generationId: 'generation-slot', statementIds: Array.from({length: Number(probes.statementCount)}, (_, index) => `statement-${index}`), concepts: probes.concepts.map((intent, index) => ({key: intent.key,
    termId: `term-${index}`, termRevisionId: `term-revision-${index}`, conceptId: `concept-${index}`, conceptRevisionId: `concept-revision-${index}`,
    representationId: `representation-${index}`, recordId: `record-${index}`, jobId: `job-${index}`}))}, facts: {terms: probes.termKeys.map(key => ({key, result: available(null), failurePhase: null})), generation: skipped,
    nextGeneration: skipped, concepts: probes.concepts.map(intent => ({key: intent.key, representation: available(null), queueJob: skipped}))}};
}

test('NAL bootstrap keeps completed legacy imports independent of skipped legacy tables', () => {
  const value = {...source(), legacyImported: available(true), collections: {state: 'deferred'} as const};
  const plan = prepareNalBootstrap(input(value));
  assert.equal(plan.terminal, null); assert.deepEqual(plan.concepts, []); assert.deepEqual(plan.import, {kind: 'skipped'});
  assert.equal(plan.finalProjection.kind, 'prepared'); if (plan.finalProjection.kind === 'prepared') assert.equal(plan.finalProjection.rawState.revision, 0n);
});

test('NAL bootstrap preserves scheduled concepts and stops on the first invalid term', () => {
  const value = {...source(), collections: available([{id: 'bad', name: '', description: '', conceptId: null}]), relationTypes: {state: 'deferred'} as const};
  const plan = prepareNalBootstrap(input(value));
  assert.equal(plan.concepts.length, 3); assert.equal(plan.terminal?.phase, 'termValidation');
  assert.equal(plan.concepts[0]?.term.state, 'available'); assert.equal(plan.concepts[2]?.term.state, 'skipped');
});

test('NAL bootstrap creates import concepts and idempotent statements for a simple collection', () => {
  const value = {...source(), collections: available([{id: 'collection', name: 'Collection', description: 'Synthetic', conceptId: null}]), relationTypes: available([]), relations: available([]), memberships: available([]), assignments: available([])};
  const plan = prepareNalBootstrap(input(value));
  assert.equal(plan.terminal, null); assert.equal(plan.concepts.length, 3); assert.equal(plan.import.kind, 'prepared');
  assert.equal(plan.finalProjection.kind, 'prepared'); if (plan.finalProjection.kind === 'prepared') assert.equal(plan.finalProjection.rawState.concepts.length, 3);
});
