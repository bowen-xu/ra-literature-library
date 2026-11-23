import assert from 'node:assert/strict';
import test from 'node:test';
import {
  EVIDENCE_READ_RESOURCE_FILES,
  decideEvidenceWrite,
  evidenceWriteMatchesDecision,
  evidenceWriteRejectionMessage,
} from './evidence-write.mts';

test('evidence write preserves claim role and stance validation', () => {
  const empty = decideEvidenceWrite({kind: 'claim', statement: '', epistemicRole: 'assertion'});
  assert.deepEqual(empty, {rejection: {kind: 'emptyStatement'}});
  assert.equal(evidenceWriteRejectionMessage(empty.rejection!), '观点内容不能为空');
  const role = decideEvidenceWrite({kind: 'claim', statement: 'claim', epistemicRole: 'other'});
  assert.deepEqual(role, {rejection: {kind: 'invalidEpistemicRole', value: 'other'}});
  assert.deepEqual(decideEvidenceWrite({kind: 'stance', stance: 'supports'}), {rejection: null});
  assert.deepEqual(decideEvidenceWrite({kind: 'stance', stance: 'rejects'}), {rejection: {kind: 'invalidStance', value: 'rejects'}});
});

test('evidence write decision matching keeps the original rejection identity', () => {
  const input = {kind: 'claim', statement: 'claim', epistemicRole: 'other'} as const;
  const decision = decideEvidenceWrite(input);
  assert.equal(evidenceWriteMatchesDecision(input, decision), true);
  assert.equal(evidenceWriteMatchesDecision({...input, epistemicRole: 'assertion'}, decision), false);
});

test('evidence read resource list preserves the four fixed SQL files', () => {
  assert.deepEqual(EVIDENCE_READ_RESOURCE_FILES, [
    'evidence-read-claims.v1.sql', 'evidence-read-source.v1.sql',
    'evidence-read-sources.v1.sql', 'evidence-read-links.v1.sql',
  ]);
});
