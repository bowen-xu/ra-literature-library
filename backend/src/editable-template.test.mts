import assert from 'node:assert/strict';
import test from 'node:test';
import {validateEditableTemplate} from './editable-template.mts';

const value = {kind: 'reading_template_v1', schemaVersion: 1, name: 'Template', fields: [{id: 'method', title: 'Method', question: 'How?', color: '#abcdef'}]};

test('editable template validation preserves canonical success and field rules', () => {
  assert.equal(validateEditableTemplate({candidateJson: JSON.stringify(value)}).status, 'validated');
  assert.equal(validateEditableTemplate({candidateJson: JSON.stringify({...value, fields: [{...value.fields[0], id: 'Method'}]})}).status, 'rejected');
  assert.equal(validateEditableTemplate({candidateJson: JSON.stringify({...value, fields: [{...value.fields[0], claimIds: ['paper-only']}]})}).status, 'rejected');
});
