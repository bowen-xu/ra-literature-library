import assert from 'node:assert/strict';
import test from 'node:test';
import {prepareNalBootstrapProbes, type BootstrapSource} from './nal-bootstrap-probes.mts';

const available = <T,>(value: T) => ({state: 'available', value} as const);
const skipped = {state: 'skipped'} as const;
const source = (): BootstrapSource => ({legacyImported: available(false), collections: available([]), relationTypes: skipped, relatedFieldUsed: skipped, relations: skipped, memberships: skipped, assignments: skipped, repairVersion: available(1n), repairRecords: skipped, configuredEmbedding: skipped});

test('NAL bootstrap probes preserve empty completed and semantic-space branches', () => {
  const empty = prepareNalBootstrapProbes(source());
  assert.deepEqual(empty.concepts, []); assert.equal(empty.statementCount, 0n); assert.deepEqual(empty.semanticSpace, {state: 'skipped'});
  const configured = source();
  const value = {...configured, collections: available([{id: 'c', name: 'Collection', description: 'Description', conceptId: null}]), relationTypes: available([]), relatedFieldUsed: available(false), relations: available([]), memberships: available([]), assignments: available([]), configuredEmbedding: available({region: ' us ', modelId: ' model '})};
  const result = prepareNalBootstrapProbes(value);
  assert.equal(result.concepts.length, 3); assert.equal(result.termKeys.length, 3); assert.equal(result.semanticSpace.state, 'available');
  if (result.semanticSpace.state === 'available') assert.match(result.semanticSpace.value?.id ?? '', /^space-[0-9a-f]{32}$/u);
});

test('NAL bootstrap probes stop at the earliest deferred source and retain scheduled concepts', () => {
  const value = {...source(), collections: available([{id: 'bad', name: '', description: '', conceptId: null}]), relationTypes: {state: 'deferred'} as const};
  const result = prepareNalBootstrapProbes(value);
  assert.equal(result.concepts.length, 3); assert.equal(result.terminal?.phase, 'termValidation');
  const deferred = prepareNalBootstrapProbes({...source(), collections: {state: 'deferred'} as const});
  assert.equal(deferred.terminal?.phase, 'collections'); assert.equal(deferred.earliestUnavailable, 'collections');
});
