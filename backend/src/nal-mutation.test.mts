import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mutationMessage, prepareConceptKind, prepareTransitivity, requireConceptDeleted, requireKindUsage, requireRelationKind, requireStatementDeleted, validateStatementCount, validateStatementIdentity, validateTermNode} from './nal-mutation.mts';

const statement = {id: 's', origin: 'human', subject: {kind: 'concept' as const, id: 'a'}, predicate: {kind: 'concept' as const, id: 'b'}};
test('NAL mutation guards preserve term, identity, usage and deletion boundaries', () => {
  validateTermNode({kind: 'product', terms: [{kind: 'concept', id: 'a'}, {kind: 'paper', id: 'p'}]});
  assert.throws(() => validateTermNode({kind: 'product', terms: []}), /乘积/u);
  assert.throws(() => validateStatementIdentity({...statement, origin: 'system'}), /来源/u); validateStatementCount(500);
  assert.throws(() => requireKindUsage('ordinary', true), /已用作关系/u); assert.throws(() => requireRelationKind(true, false), /关系概念/u);
  requireConceptDeleted(1); requireStatementDeleted(1); assert.equal(mutationMessage('missing_statement'), '语句已不存在');
});

test('NAL mutation action preparation is finite', () => {
  assert.deepEqual(prepareConceptKind('relation'), {conceptKind: 'relation', onUsed: 'continue'});
  assert.deepEqual(prepareTransitivity(true), {action: 'enable', missing: 'not_relation'});
});
