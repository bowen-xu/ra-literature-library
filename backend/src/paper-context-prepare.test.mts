import assert from 'node:assert/strict';
import test from 'node:test';
import {evaluatePaperPreparation, sessionSummary, validateAnalysisSources, type ReadingSessionRow} from './paper-context-prepare.mts';

const row = (): ReadingSessionRow => ({id: 'session', paperId: 'paper', contextSnapshotId: null, attachmentIds: [], parseRunIds: [], providerId: 'provider', modelId: 'model', reasoningEffort: null, bootstrapKind: 'manual', sourceWorkflowId: null, sourceWorkflowRevision: null, bootstrapHash: null, conceptRetrievalDefault: false, title: 'Title', status: 'ready', createdAt: '', updatedAt: '', attachmentIdsJson: '["a"]', parseRunIdsJson: 'bad'});

test('paper context preparation preserves Docling source limits and session defaults', () => {
  assert.equal(validateAnalysisSources(['available'], 128), null); assert.equal(validateAnalysisSources(['pending'], 0), '部分 PDF 尚未完成 Docling 结构化解析'); assert.match(validateAnalysisSources(['available'], 129)!, /超过本轮上限 128/);
  const summary = sessionSummary(row()); assert.equal(typeof summary, 'object'); if (typeof summary === 'object') {assert.deepEqual(summary.attachmentIds, ['a']); assert.deepEqual(summary.parseRunIds, []);}
  assert.equal(sessionSummary(null), '找不到 AI 阅读会话');
});

test('paper context preparation keeps screenshot and snapshot decisions', () => {
  assert.deepEqual(evaluatePaperPreparation({kind: 'snapshotReady', attachmentStatuses: [{attachmentId: 'a', displayName: 'a', contentSha256: 'a'.repeat(64), parseRunId: 'p', parseStatus: 'available'}]}), {kind: 'ready', available: true});
  assert.deepEqual(evaluatePaperPreparation({kind: 'imageIdentity', contextItemId: 'a', existingIds: ['a']}), {kind: 'rejected', message: '图片截图包含重复结构化块 ID'});
  assert.deepEqual(evaluatePaperPreparation({kind: 'imageSet', requestedIds: ['a'], availableIds: []}), {kind: 'rejected', message: '图片截图数量与 Docling picture 结构块不一致'});
});
