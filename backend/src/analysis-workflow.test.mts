import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {CandidatePayloadSerde} from '../../../../ra-workbench-sdk/packages/workbench-backend-sdk/lib/candidate-contracts/payloads.js';
import {AiTaskSpecDraftSerde} from '../../../../ra-workbench-sdk/packages/workbench-backend-sdk/lib/generation.js';
import {PaperTaskPromptSerde} from '../../../../ra-workbench-sdk/packages/workbench-backend-sdk/lib/analysis-workflow/prompt.js';
import {decideCandidate} from './analysis-workflow.mts';
import {decodePayload, encodePayload} from '../../../../ra-workbench-sdk/packages/workbench-backend-sdk/lib/paper-context-wire/codec.js';
import {WorkflowDecisionV1Serde, WorkflowInputV1Serde} from '../../../../ra-workbench-sdk/packages/workbench-backend-sdk/lib/analysis-workflow/wire.js';
import {candidateRecovery, decideAnalysisWorkflow, decideTemplate, legacyPrompt, overviewTask, planAttempt, selectPages, selectionPreview, submissionScope, validateAttemptMessages, validateAttemptTurn, validateDoclingImages, validateDoclingSources, validateDraft, validateGeneration, validatePortraitEvidence, validatePortraitPaper, validatePortraitSources, validateReuse, validateSources, validateStart, validateTaskScope} from './analysis-workflow.mts';

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

test('analysis workflow preserves Docling and explicit submission scope gates', () => {
  assert.deepEqual(validateDoclingImages(['a', 'b'], ['a']), {kind: 'invalidInput', message: '请求的图片不在当前文献上下文中'});
  assert.deepEqual(validateDoclingSources(['available'], 129n), {kind: 'invalidInput', message: '图片结构块数量为 129，超过本轮上限 128；请等待分批发送能力接入'});
  assert.equal(validateTaskScope('matrix_synthesis', ['anchor', 'anchor']), null);
  assert.deepEqual(submissionScope('reference_extraction', [], []), {error: {kind: 'invalidInput', message: '生成任务没有文献原文依据'}});
  const scope = submissionScope('paper_profile_classification', ['paper'], ['attachment']);
  assert.equal('result' in scope ? scope.result.kind : '', 'portrait');
});

test('analysis workflow preserves portrait, recovery and running-generation semantics', () => {
  assert.deepEqual(validatePortraitSources([], 0n), {kind: 'invalidInput', message: '来源文件尚无可读取的解析内容'});
  assert.deepEqual(validatePortraitEvidence('partial', 1n), {kind: 'invalidInput', message: '来源文件没有可用依据'});
  assert.deepEqual(validatePortraitPaper('Ω'.repeat(257)), {kind: 'invalidInput', message: '文献身份无效'});
  assert.deepEqual(validateGeneration(true, false), {kind: 'invalidInput', message: '本文生成任务仍在运行，请先等待结束或取消。'});
  const payload = '{"kind":"paper_overview_unit_v1","schemaVersion":1}';
  const hash = createHash('sha256').update(payload).digest('hex');
  assert.deepEqual(candidateRecovery({taskKind: 'paper_overview', candidateKind: 'paper_overview_unit_v1', originalPayloadHash: hash, revisionPayloadHash: hash, payloadJson: payload}), {expectedWorkflowStatus: 'failed', runningWorkflowStatus: 'overview_running', completionWithConcept: 'overview_ready', completionWithoutConcept: 'needs_review', recoveryReasons: ['validated_candidate_committed_without_matching_workflow', 'validated_candidate_committed_before_post_commit_read_failed', 'validated_candidate_committed_with_ambiguous_workflow']});
});

test('analysis workflow decodes candidate JSON and retains candidate wire policy', () => {
  const payload = {kind: 'paper_overview_unit_v1', schemaVersion: 1, profileId: 'generic_overview_v1', fields: [
    {field: 'research_question', status: 'not_found', statements: []}, {field: 'approach', status: 'not_found', statements: []}, {field: 'key_result', status: 'not_found', statements: []}, {field: 'conclusion', status: 'not_found', statements: []}, {field: 'limitation', status: 'not_found', statements: []}, {field: 'open_question', status: 'not_found', statements: []},
  ]};
  const fence = String.fromCharCode(96).repeat(3);
  const decoded = decideCandidate({kind: 'decode', content: `before\n${fence}json\n${JSON.stringify(payload)}\n${fence}`, evidenceKeys: []});
  assert.equal(decoded.kind, 'decoded');
  if (decoded.kind !== 'decoded') return;
  const wire = decodePayload(decoded.payloadCborBase64, CandidatePayloadSerde);
  assert.equal((wire as any).PaperOverview.kind, 'paper_overview_unit_v1');
  assert.deepEqual(decideCandidate({kind: 'kindAndQuotes', payloadCborBase64: decoded.payloadCborBase64, taskKind: 'paper_overview', suggestionKind: null, evidence: []}), {kind: 'validated'});
  assert.deepEqual(decideCandidate({kind: 'kindAndQuotes', payloadCborBase64: decoded.payloadCborBase64, taskKind: 'paper_concept_map', suggestionKind: null, evidence: []}), {kind: 'rejected', error: {kind: 'invalidInput', detail: 'provider 候选类型与冻结的任务输出类型不一致'}});
  const prepared = decideCandidate({kind: 'finalize', payloadCborBase64: decoded.payloadCborBase64, matrix: null});
  assert.equal(prepared.kind, 'prepared');
  if (prepared.kind === 'prepared') assert.equal(JSON.parse(prepared.canonicalJson).kind, 'paper_overview_unit_v1');
});

test('analysis workflow preserves template availability and binding gates', () => {
  assert.deepEqual(decideTemplate({kind: 'legacyAvailability', managedResources: true}), {kind: 'rejected', error: {kind: 'invalidInput', message: '旧画像模板标识仅用于历史读取；请先确认或采用已发布的资源模板，再开始新提取'}});
  const reference = {templateResourceId: 'resource', templateResourceRevision: 2n} as const;
  assert.deepEqual(decideTemplate({kind: 'resourceBinding', reference, selectionRevision: 3n, binding: ['resource', 2n]}), {kind: 'verified'});
  assert.deepEqual(decideTemplate({kind: 'resourceBinding', reference, selectionRevision: 3n, binding: ['resource', 1n]}), {kind: 'rejected', error: {kind: 'invalidInput', message: '本文采用的模板版本已变化，请重新载入'}});
  const resolved = decideTemplate({kind: 'resourceContent', paperId: 'paper', reference, selectionRevision: 3n, raw: JSON.stringify({fields: [{id: 'question', title: 'Question', question: 'What?', color: null, claimIds: ['old']}]} )});
  assert.equal(resolved.kind, 'resolved');
  if (resolved.kind === 'resolved') assert.deepEqual(resolved.profile.fieldKinds, ['question']);
});

test('analysis workflow ranks page evidence and preserves selected-anchor limits', () => {
  const attachment = {paperId: 'paper', paperTitle: 'Paper', contentSha256: 'sha', indexState: 'completed'} as const;
  const selected = selectPages(attachment, 'attachment', [[2n, 'ordinary'], [0n, 'Abstract and research question'], [1n, 'Methods and results']]);
  assert.equal(selected.ok, true);
  if (selected.ok) {assert.deepEqual(selected.sources.map(source => source.pageIndex), [0n, 1n, 2n]); assert.equal(selected.sources[0]!.anchorId.startsWith('ai-overview-'), true);}
  assert.deepEqual(selectionPreview(null), {Err: {kind: 'invalidInput', message: '原文锚点或对应附件版本已不可用'}});
  const source = {anchorId: 'a', paperId: 'paper', paperTitle: 'Paper', attachmentId: 'attachment', contentSha256: 'sha', pageIndex: 0n, pageLabel: '1', quoteExact: 'Quote', quotePrefix: 'before ', quoteSuffix: ' after'} as const;
  const preview = selectionPreview(source);
  assert.equal('Ok' in preview ? preview.Ok.length : 0, 2);
  assert.equal('Ok' in preview ? preview.Ok[1]!.contextText : '', 'before Quote after');
});

test('analysis workflow builds the original overview task draft', () => {
  const encoded = overviewTask({paperId: 'paper', attachmentIds: ['second', 'first'], selectionRevision: 7n, template: null, modelSelection: {providerId: 'provider', modelId: 'model', reasoningEffort: 'high'}});
  const draft = decodePayload(encoded, AiTaskSpecDraftSerde) as any;
  assert.equal(draft.taskKind, 'paper_overview'); assert.equal(draft.promptVersion, 'paper-overview-docling-context-v3'); assert.equal(draft.overviewProfileSelectionRevision, 7n); assert.deepEqual(draft.scopeItems.map((item: any) => item.objectId), ['second', 'first']);
});

test('analysis workflow preserves attempt eligibility and legacy prompt filtering', () => {
  assert.equal(validateAttemptTurn('paper_overview'), null);
  assert.deepEqual(validateAttemptTurn('other'), {kind: 'invalidInput', message: '未知论文分析阶段'});
  assert.deepEqual(validateAttemptMessages([' ', 'x']), {kind: 'invalidInput', message: '论文分析规范化消息为空或超过上限'});
  const workflow = {status: 'running', turns: [{id: 'turn', kind: 'paper_overview', status: 'pending', attemptNumbers: [0n]}]};
  assert.deepEqual(planAttempt('paper_overview', workflow), {Ok: {turnId: 'turn', nextAttempt: 1n}});
  const encoded = legacyPrompt([{kind: 'system_context', content: 'system', sourceTurnId: null}, {kind: 'task_prompt', content: 'first', sourceTurnId: null}, {kind: 'task_prompt', content: 'second', sourceTurnId: null}]);
  assert.equal(decodePayload(encoded, PaperTaskPromptSerde).text, 'first\n\nsecond');
});
