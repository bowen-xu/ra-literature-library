import assert from 'node:assert/strict';
import {test} from 'node:test';
import {prepareNalQuerySave, projectNalQueryRow, rejectionMessage, validateNalQueryContent} from './nal-query.mts';

const statement = {kind: 'statement' as const, subject: {kind: 'variable' as const, name: 'x'}, predicate: {kind: 'concept' as const, id: 'domain'}};
const content = () => ({definitions: [{id: 'q', name: '查询', conditions: [statement], outputVariables: ['x']}], cache: null, legacyImported: true});

test('NAL query validation preserves recursive structure and save serialization', () => {
  const value = content(); assert.equal(validateNalQueryContent(value), null);
  const plan = prepareNalQuerySave(value); assert.equal('definitionsJson' in plan, true);
  value.definitions[0]!.outputVariables = ['missing']; assert.equal(validateNalQueryContent(value), 'invalid_output_variables');
  assert.equal(rejectionMessage('invalid_definition'), '查询集合格式无效');
});

test('NAL query validation preserves parent and structural read boundaries', () => {
  const value = content() as any; value.definitions[0]!.parentId = 'absent'; assert.equal(validateNalQueryContent(value), 'missing_parent');
  assert.deepEqual(projectNalQueryRow({revision: 1, definitionsJson: ' [] ', cacheJson: null, legacyImported: false}), {row: {revision: 1, definitionsJson: ' [] ', cacheJson: null, legacyImported: false}});
  assert.deepEqual(projectNalQueryRow({revision: 1, definitionsJson: '[', cacheJson: null, legacyImported: false}), {rejected: 'invalid_structure'});
});
