import assert from 'node:assert/strict';
import test from 'node:test';
import {projectAnalysisHistory} from './analysis-history.mts';

const capture = {row: {id: 'workflow', conversationId: 'not-uuid', paperId: 'paper', contextSnapshotId: null, status: 'succeeded', providerId: 'provider', modelId: 'model', reasoningEffort: null, promptSetVersion: 'v1', activeTurnKind: null, revision: 2, supersedesWorkflowId: null, createdAt: 'created', updatedAt: 'updated', completedAt: 'done'}, turns: [{row: {id: 'turn', workflowId: 'workflow', ordinal: 0, kind: 'paper_overview', status: 'succeeded', candidateId: null, createdAt: 'created', finishedAt: 'done'}, attempts: [{id: 'attempt', turnId: 'turn', sharedConversationId: 'not-uuid', attempt: 1, status: 'succeeded', providerId: 'provider', modelId: 'model', createdAt: 'created'}]}]};

test('analysis history projects rows and keeps invalid UUID-like values absent', () => {
  const result = projectAnalysisHistory({request: {kind: 'get'}, workflow: capture});
  assert.equal(result.status, 'ready');
  if (result.status === 'ready') {assert.equal((result.workflow as any).conversationId, null); assert.equal((result.workflow as any).turns[0].attempts[0].sharedConversationId, null);}
});

test('analysis history preserves get-not-found versus list absence', () => {
  assert.deepEqual(projectAnalysisHistory({request: {kind: 'get'}, workflow: null}), {status: 'rejected', error: 'not_found'});
  assert.deepEqual(projectAnalysisHistory({request: {kind: 'list'}, workflow: null}), {status: 'ready', workflow: null});
});
