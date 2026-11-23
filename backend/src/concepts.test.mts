import assert from 'node:assert/strict';
import test from 'node:test';
import {normalizeTerm, prepareConcept, prepareTerm, validateDetails} from './concepts.mts';

const draft = {label: '  Concept ` context  ', explanation: ' Explanation ', disambiguation: '  ', domain: ' Domain ', tradition: ' Tradition ', period: '  ', preferredTerm: '  Neural   Network ', language: ' en ', changeReason: null, id: null, expectedRevision: null};

test('concept preparation preserves names, normalized terms and provenance rules', () => {
  assert.equal(normalizeTerm('  Neural   Network '), 'neural network');
  const result = prepareConcept({kind: 'save', draft});
  assert.equal(result.status, 'ready');
  if (result.status === 'ready' && result.plan.kind === 'save') {
    assert.equal(result.plan.details.label, 'Concept ` context');
    assert.equal(result.plan.term.normalizedText, 'neural network');
    assert.equal(result.plan.rules.conceptReason, 'manual_create');
  }
});

test('concept validation keeps rejection order and new-record revision gate', () => {
  assert.equal(validateDetails({...draft, label: ' '}), 'invalidNameLength');
  assert.equal(validateDetails({...draft, label: 'bad`'}), 'emptyNameContext');
  assert.equal(validateDetails({...draft, disambiguation: 'x'.repeat(1_001)}), 'fieldsTooLong');
  assert.equal(prepareTerm(' ', 'en').rejection, 'emptyTerm');
  assert.equal(prepareTerm('x'.repeat(501), 'en').rejection, 'termTooLong');
  const result = prepareConcept({kind: 'save', draft: {...draft, id: null, expectedRevision: 3}});
  assert.equal(result.status, 'ready');
  if (result.status === 'ready' && result.plan.kind === 'save') assert.equal(result.plan.rules.newExpectedRejection, 'newExpectedRevision');
});

test('concept search preserves original query and wildcard pattern', () => {
  assert.deepEqual(prepareConcept({kind: 'search', query: '  Neural   Network '}), {status: 'ready', plan: {kind: 'search', query: '  Neural   Network ', normalized: 'neural network', pattern: '%neural network%'}});
});
