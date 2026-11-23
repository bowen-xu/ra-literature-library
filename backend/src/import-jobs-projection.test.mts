import assert from 'node:assert/strict';
import test from 'node:test';
import {projectImportJobs, type ImportJobRows} from './import-jobs.mts';

const text = (value: string) => ({kind: 'text', value} as const);
const integer = (value: bigint | number) => ({kind: 'integer', value: BigInt(value)} as const);
const nullValue = () => ({kind: 'null', value: null} as const);
const job = (id: string): ImportJobRows => ({
  header: {rows: [[text(id), text('running'), text('bibtex'), integer(2), integer(1), integer(0), text('created'), text('updated')]]},
  results: {rows: [[text('label'), text('raw'), text('imported'), nullValue(), nullValue()]]},
});

test('import-job projection preserves job/list/cancel branches and nullable result fields', () => {
  assert.deepEqual(projectImportJobs({kind: 'job', expectedId: 'job', rows: job('job')}), {status: 'success', result: {kind: 'job', job: {id: 'job', state: 'running', sourceKind: 'bibtex', totalCount: 2n, completedCount: 1n, cancellationRequested: false, results: [{inputLabel: 'label', rawInput: 'raw', state: 'imported', itemId: null, errorMessage: null}], createdAt: 'created', updatedAt: 'updated'}}});
  assert.deepEqual(projectImportJobs({kind: 'jobs', expectedIds: ['a', 'b'], rows: [job('a'), job('b')]}).status, 'success');
  assert.deepEqual(projectImportJobs({kind: 'cancel', affectedRows: 0n}), {status: 'notFound', message: '找不到文献或附件'});
  assert.deepEqual(projectImportJobs({kind: 'cancel', affectedRows: 1n}), {status: 'success', result: {kind: 'done'}});
  assert.throws(() => projectImportJobs({kind: 'job', expectedId: 'expected', rows: job('other')}), /another requested identity/);
});
