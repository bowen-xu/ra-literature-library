import assert from 'node:assert/strict';
import test from 'node:test';
import {bootstrapOptions, debugRecord, projectReadingHistory, unavailableForSources, unavailableForWorkflow, workflowHasOverview} from './reading-history.mts';
import type {ReadingSessionRow} from './paper-context-prepare.mts';

const row = {id: 'session', paperId: 'paper', contextSnapshotId: null, attachmentIdsJson: '["a"]', parseRunIdsJson: '["run"]', providerId: 'p', modelId: 'm', reasoningEffort: null, bootstrapKind: 'fresh_paper', sourceWorkflowId: null, sourceWorkflowRevision: null, bootstrapHash: null, conceptRetrievalDefault: false, title: 'Title', status: 'active', createdAt: 'created', updatedAt: 'updated'};
const workflow = {id: 'workflow', contextSnapshotId: 'snapshot', revision: 2, status: 'succeeded', providerId: 'p', modelId: 'm', turns: [{kind: 'paper_overview', status: 'succeeded'}], updatedAt: 'updated'};
const status = {attachmentId: 'a', contentSha256: 'hash', parseRunId: 'run', parseStatus: 'available'};

test('reading history preserves identity trimming and raw JSON failure order', () => {
  assert.deepEqual(projectReadingHistory({kind: 'debugIdentity', turnId: '  turn '}), {kind: 'debugIdentity', turnId: 'turn'});
  assert.deepEqual(projectReadingHistory({kind: 'debugIdentity', turnId: ' '}), {kind: 'rejected', message: 'AI 阅读 turn ID 不能为空'});
  assert.deepEqual(debugRecord({turnId: 'turn', rawRequestJson: '{', rawResponseJson: 'bad'}), 'AI 阅读原始请求记录损坏');
  assert.deepEqual(debugRecord({turnId: 'turn', rawRequestJson: '{}', rawResponseJson: '{'}), 'AI 阅读原始返回记录损坏');
});

test('bootstrap qualification rejects unavailable sources or history before snapshot reuse', () => {
  assert.equal(unavailableForSources([{...status, parseStatus: 'pending'}])?.unavailableReason, '当前 PDF 尚未完成结构化解析');
  assert.equal(unavailableForWorkflow({...workflow, turns: []})?.unavailableReason, '最近的结构化阅读尚未生成概要候选');
  assert.equal(unavailableForWorkflow(workflow), undefined);
  assert.equal(workflowHasOverview(workflow), true);
  assert.deepEqual(bootstrapOptions(workflow, [status], [['a', 'hash', 'run']]), {defaultKind: 'structured_history', structuredHistory: {workflowId: 'workflow', workflowRevision: 2, workflowStatus: 'succeeded', providerId: 'p', modelId: 'm', completedTurns: ['paper_overview'], attachmentCount: 1, updatedAt: 'updated'}, unavailableReason: null});
  assert.equal(bootstrapOptions(workflow, [status], []).unavailableReason, '当前 PDF 或 Docling 解析版本已变化，请重新运行结构化阅读');
});

test('reading history projects sessions and bootstrap decisions', () => {
  const sessionRow = row as unknown as ReadingSessionRow;
  assert.equal(projectReadingHistory({kind: 'list', rows: [sessionRow]}).kind, 'list');
  assert.equal(projectReadingHistory({kind: 'session', summary: sessionRow, turns: []}).kind, 'session');
  assert.deepEqual(projectReadingHistory({kind: 'bootstrapSources', statuses: [status]}), {kind: 'historyRequired'});
  assert.deepEqual(projectReadingHistory({kind: 'bootstrapHistory', workflow}), {kind: 'snapshotRequired', contextSnapshotId: 'snapshot'});
  assert.deepEqual(projectReadingHistory({kind: 'archive', sessionId: ' session '}), {kind: 'archive', sessionId: 'session'});
});
