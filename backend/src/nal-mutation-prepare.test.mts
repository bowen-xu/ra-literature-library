import assert from 'node:assert/strict';
import test from 'node:test';
import {prepareNalMutation} from './nal-mutation-prepare.mts';
import {prepareNalBootstrapProbes} from './nal-bootstrap-probes.mts';
import type {BootstrapInputV1, BootstrapSourceV1} from '../../../../ra-workbench-sdk/packages/workbench-backend-sdk/src/nal-bootstrap.js';

const available = <T,>(value: T) => ({state: 'available', value} as const);
function input(mutation: unknown, sourcePatch: Partial<BootstrapSourceV1> = {}): Parameters<typeof prepareNalMutation>[0] {
  const source: BootstrapSourceV1 = {...{legacyImported: available(true), collections: {state: 'skipped'}, relationTypes: {state: 'skipped'}, relatedFieldUsed: {state: 'skipped'}, relations: {state: 'skipped'}, memberships: {state: 'skipped'}, assignments: {state: 'skipped'}, repairVersion: available(1n), repairRecords: {state: 'skipped'}, cleanupExists: available(false), rawState: available({revision: 7n, concepts: [], statements: [], annotations: [], relationConceptIds: ['a', 'z']}), occupiedNameKeys: available([]), configuredEmbedding: available(null)}, ...sourcePatch};
  const probes = prepareNalBootstrapProbes(source);
  const bootstrap: BootstrapInputV1 = {source, probes, facts: {terms: [], generation: {state: 'skipped'}, nextGeneration: {state: 'skipped'}, concepts: []}, identities: {concepts: [], generationId: null, statementIds: []}};
  return {bootstrap, mutationJson: JSON.stringify(mutation)};
}

test('NAL mutation returns a prepared rejection for an empty statement batch', () => {
  const result = prepareNalMutation(input({kind: 'add_statements', statements: []}));
  assert.equal(result.decision.kind, 'prepared');
  if (result.decision.kind === 'prepared') assert.deepEqual(result.decision.mutation, {kind: 'addStatements', batch: {kind: 'rejected', reason: 'invalidStatementCount'}});
});

test('NAL mutation preserves the global statement prefix and human origin guard', () => {
  const result = prepareNalMutation(input({kind: 'add_statements', statements: [
    {id: ' first ', origin: 'human', subject: {kind: 'concept', id: ' raw c '}, predicate: {kind: 'paper', id: ' raw p '}},
    {id: 'second', origin: 'legacy', subject: {kind: 'concept', id: 'c'}, predicate: {kind: 'paper', id: 'p'}},
  ]}));
  assert.equal(result.decision.kind, 'prepared');
  if (result.decision.kind === 'prepared') {
    const batch = result.decision.mutation.kind === 'addStatements' ? result.decision.mutation.batch : null;
    assert.deepEqual(batch, {kind: 'prepared', statements: [
      {kind: 'ready', id: ' first ', origin: 'human', subject: {kind: 'concept', id: ' raw c ', missingRejection: 'missingTerm'}, predicate: {kind: 'paper', id: ' raw p ', missingRejection: 'missingTerm'}, subjectJson: '{"kind":"concept","id":" raw c "}', predicateJson: '{"kind":"paper","id":" raw p "}'},
      {kind: 'rejectedIdentity', id: 'second', origin: 'legacy', reason: 'invalidStatementIdentityOrOrigin'},
    ]});
  }
});

test('NAL mutation defers when bootstrap has not reached a stable projection and appends requested rules only to the projection', () => {
  const deferred = prepareNalMutation(input({kind: 'delete_concept', id: 'c'}, {legacyImported: {state: 'deferred'}}));
  assert.deepEqual(deferred.decision, {kind: 'deferredAfterBootstrap'}); assert.deepEqual(deferred.ruleProjection, []);
  const rules = prepareNalMutation(input({kind: 'set_transitivity', relationConceptId: 'middle', enabled: false}));
  assert.deepEqual(rules.ruleProjection.map(value => value.relationConceptId), ['a', 'z', 'middle']);
  assert.equal(rules.bootstrap.finalProjection.kind, 'prepared');
  if (rules.decision.kind === 'prepared' && rules.decision.mutation.kind === 'setTransitivity') assert.deepEqual(rules.decision.mutation.action, {kind: 'disable'});
});
