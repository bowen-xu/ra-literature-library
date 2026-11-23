import assert from 'node:assert/strict';
import test from 'node:test';
import {canonicalCandidateJson, confirmedFieldsUnchanged, fieldHash, quotesAndKind} from './candidate-revision.mts';

const payload = () => ({kind: 'paper_overview_unit_v1', schemaVersion: 1, profileId: 'generic_overview_v1', fields: [{field: 'research_question', status: 'not_found', statements: []}]});

test('candidate revisions preserve candidate kind, evidence quote membership and canonical JSON', () => {
  const value = payload(); assert.equal(quotesAndKind(value, value.kind, []), null); assert.equal(quotesAndKind(value, 'reference_record_candidate_v1', []), '候选修订不能改变候选类型');
  const quoted = {...value, fields: [{...value.fields[0]!, statements: [{id: 'statement', evidenceQuotes: [{evidenceItemId: 'source', quote: 'exact'}]}]}]};
  assert.equal(quotesAndKind(quoted, value.kind, [{citationKey: 'source', quoteExact: 'prefix exact suffix'}]), null); assert.match(quotesAndKind(quoted, value.kind, [{citationKey: 'source', quoteExact: 'other'}])!, /不是来源/); assert.equal(canonicalCandidateJson(value), JSON.stringify(value));
});

test('candidate revisions preserve last duplicate confirmed hash and reject changed fields', () => {
  const value = payload(), field = value.fields[0]!, hash = fieldHash(field); assert.equal(confirmedFieldsUnchanged(value, [['research_question', 'old'], ['research_question', hash]]), null); assert.match(confirmedFieldsUnchanged({...value, fields: [{...field, status: 'filled'}]}, [['research_question', hash]])!, /已确认/);
});
