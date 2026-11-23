import assert from 'node:assert/strict';
import test from 'node:test';
import {projectContextMetadata, type ContextMetadataInput} from './context-metadata.mts';

test('context metadata projection preserves base shape, compact JSON and duplicate pairs', () => {
  const input: ContextMetadataInput = {paperId: ' unchanged paper ', base: {title: '题录 Ω', nested: {value: '原文'}, creators: ['overwrite'], identifiers: null},
    creators: [['  机构', 'author'], ['B Given ', 'editor']], identifiers: [['doi', 'first'], ['doi', 'second'], ['url', 'url']]};
  const before = structuredClone(input);
  assert.deepEqual(projectContextMetadata(input), {status: 'projected', bodyJson: JSON.stringify({title: '题录 Ω', nested: {value: '原文'}, creators: [['  机构', 'author'], ['B Given ', 'editor']], identifiers: [['doi', 'first'], ['doi', 'second'], ['url', 'url']]})});
  assert.deepEqual(input, before);
  assert.deepEqual(projectContextMetadata({...input, base: null}), {status: 'projected', bodyJson: JSON.stringify({creators: input.creators, identifiers: input.identifiers})});
});

test('context metadata projection rejects non-object non-null bases without leaking body content', () => {
  for (const base of [true, 7, 'PRIVATE_BODY_901', []]) {
    assert.deepEqual(projectContextMetadata({paperId: 'paper', base, creators: [], identifiers: []}), {status: 'rejected', reason: 'invalidBase'});
  }
});
