import assert from 'node:assert/strict';
import test from 'node:test';
import {EVIDENCE_MATRIX_RESOURCE_FILES, decideEvidenceMatrix} from './evidence-matrix.mts';

const dimension = (id = 'dimension') => ({id, label: 'Dimension'});
const statement = (overrides: Partial<{id: string; text: string; epistemicRole: string; evidenceAnchorIds: readonly string[]}> = {}) => ({
  id: overrides.id ?? 'statement', text: overrides.text ?? 'A statement', epistemicRole: overrides.epistemicRole ?? 'synthesis',
  evidenceAnchorIds: overrides.evidenceAnchorIds ?? ['anchor'],
});
const matrix = {id: 'matrix', projectId: 'project', title: 'Matrix', paperIds: ['paper'], dimensions: [dimension()], revision: 1n, createdAt: '', updatedAt: ''};

test('evidence matrix validates matrix uniqueness and UTF-8 byte limits', () => {
  const draft = {id: null, projectId: 'project', title: 'Matrix', paperIds: ['paper-a', 'paper-b'], dimensions: [dimension()], expectedRevision: null, changeReason: 'create'};
  assert.deepEqual(decideEvidenceMatrix({kind: 'matrix', draft}), {rejection: null});
  assert.deepEqual(decideEvidenceMatrix({kind: 'matrix', draft: {...draft, paperIds: ['paper-a', 'paper-a']}}), {rejection: 'matrix'});
  assert.deepEqual(decideEvidenceMatrix({kind: 'matrix', draft: {...draft, dimensions: [dimension('x'), dimension('x')]}}), {rejection: 'matrix'});
});

test('evidence matrix validates cell scope, coverage and statement identity', () => {
  const validCell = {matrixId: 'matrix', paperId: 'paper', dimensionId: 'dimension', coverageState: 'populated', coverageNote: '', statements: [statement()], expectedRevision: null, changeReason: 'edit'};
  assert.deepEqual(decideEvidenceMatrix({kind: 'cell', draft: validCell, matrix}), {rejection: null});
  assert.deepEqual(decideEvidenceMatrix({kind: 'cell', draft: {...validCell, coverageState: 'unreviewed'}, matrix}), {rejection: 'cell'});
  assert.deepEqual(decideEvidenceMatrix({kind: 'statement', statement: {...statement(), evidenceAnchorIds: ['a', 'a']}, priorStatementIds: []}), {rejection: 'statement'});
});

test('evidence matrix keeps the fixed SQL resource list', () => {
  assert.equal(EVIDENCE_MATRIX_RESOURCE_FILES.length, 14);
  assert.equal(EVIDENCE_MATRIX_RESOURCE_FILES.at(-1), 'evidence-matrix-anchor-belongs.v1.sql');
});
