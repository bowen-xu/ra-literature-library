import assert from 'node:assert/strict';
import test from 'node:test';
import {decodePayload, encodePayload} from '../../../../ra-workbench-sdk/packages/workbench-backend-sdk/lib/paper-context-wire/codec.js';
import {WorkflowDecisionV1Serde, WorkflowInputV1Serde} from '../../../../ra-workbench-sdk/packages/workbench-backend-sdk/lib/analysis-workflow/wire.js';
import {decideAnalysisWorkflow, validateDraft, validateReuse, validateSources, validateStart} from './analysis-workflow.mts';

test('analysis workflow validation preserves original gates', () => {
  assert.deepEqual(validateStart(0n, false), {kind: 'invalidInput', message: '阅读框架尚未确认，无法启动论文分析'});
  assert.equal(validateStart(1n, false), null);
  assert.deepEqual(validateSources(['available', 'pending'], 0n), {kind: 'invalidInput', message: '部分 PDF 尚未完成 Docling 结构化解析'});
  assert.deepEqual(validateSources(['available'], 129n), {kind: 'invalidInput', message: '图片结构块数量为 129，超过本轮上限 128'});
  assert.deepEqual(validateDraft({paperId: '', contextSnapshotId: 's', providerId: 'p', modelId: 'm', reasoningEffort: null, promptSetVersion: 'v'}), {kind: 'invalidInput', message: '论文分析工作流参数不完整'});
});

test('analysis workflow wire round-trips finite status decisions', () => {
  const wireInput = {kind: 'runningStatus', turnKind: 'paper_overview'} as const;
  const encoded = encodePayload(wireInput, WorkflowInputV1Serde);
  const output = decideAnalysisWorkflow({cborBase64: encoded});
  const decision = decodePayload(output.decisionCborBase64, WorkflowDecisionV1Serde);
  assert.deepEqual(decision, {kind: 'status', status: 'overview_running'});
});

test('analysis workflow reuse rejects only an equivalent active workflow', () => {
  const existing = {id: 'w', activeClientRequestId: null, conversationId: null, paperId: 'p', contextSnapshotId: 's', status: 'running', providerId: 'provider', modelId: 'model', reasoningEffort: null, promptSetVersion: 'v', activeTurnKind: null, revision: 1n, supersedesWorkflowId: null, createdAt: '', updatedAt: '', completedAt: null, turns: [{id: 't', workflowId: 'w', ordinal: 0n, kind: 'paper_overview', status: 'running', candidateId: null, createdAt: '', finishedAt: null, attempts: [{id: 'a', turnId: 't', sharedConversationId: null, sharedTurnOutcome: null, sharedRequestId: null, sharedTurnId: null, sharedAiRunId: null, sharedCandidateId: null, sharedTerminalStatus: null, attempt: 0n, status: 'running', normalizedMessages: [{kind: 'task_prompt', content: 'template', sourceTurnId: null}], providerId: 'provider', modelId: 'model', reasoningEffort: null, aiRunId: null, candidateId: null, inputHash: null, outputHash: null, inputTokens: null, outputTokens: null, errorCode: null, errorMessage: null, createdAt: '', startedAt: null, finishedAt: null, recoveryReason: null, recoveryVersion: null, recoveredAt: null}]}]};
  assert.deepEqual(validateReuse(false, 'template', existing as any), {kind: 'invalidInput', message: '当前论文上下文已经存在分析工作流'});
  assert.equal(validateReuse(true, 'template', existing as any), null);
});
