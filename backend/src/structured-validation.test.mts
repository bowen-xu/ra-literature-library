import assert from 'node:assert/strict';
import test from 'node:test';
import {validateStructured} from './structured-validation.mts';

const overview = {kind: 'paper_overview_unit_v1', schemaVersion: 1, profileId: 'generic_overview_v1', fields: [
  {field: 'research_question', status: 'filled', statements: [{id: 's', text: 'Question', epistemicRole: 'source_paraphrase', evidenceItemIds: ['ev'], evidenceQuotes: [{evidenceItemId: 'ev', quote: 'Exact'}]}]},
  {field: 'approach', status: 'not_found', statements: []}, {field: 'key_result', status: 'not_found', statements: []}, {field: 'conclusion', status: 'not_found', statements: []}, {field: 'limitation', status: 'not_found', statements: []}, {field: 'open_question', status: 'not_found', statements: []},
]};
const evidence = [{citationKey: 'ev', quoteExact: 'Before Exact after'}];

test('structured validation returns canonical payload and target mismatch', () => {
  const input = {target: 'overview' as const, candidateJson: JSON.stringify(overview), evidence};
  const result = validateStructured(input);
  assert.equal(result.status, 'validated');
  if (result.status === 'validated') assert.equal(JSON.parse(result.canonicalJson).kind, 'paper_overview_unit_v1');
  assert.equal(validateStructured({...input, target: 'portrait'}).status, 'rejected');
});

test('structured validation preserves quote membership errors', () => {
  const result = validateStructured({target: 'overview', candidateJson: JSON.stringify({...overview, fields: [{...overview.fields[0], statements: [{...overview.fields[0]!.statements[0], evidenceQuotes: [{evidenceItemId: 'ev', quote: 'Absent'}]}]}, ...overview.fields.slice(1)]}), evidence});
  assert.equal(result.status, 'rejected');
  if (result.status === 'rejected') assert.match(result.error.message, /不是来源/);
});
