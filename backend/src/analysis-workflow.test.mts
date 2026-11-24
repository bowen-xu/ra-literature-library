import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {CandidatePayloadSerde} from '../../../../ra-workbench-sdk/packages/workbench-backend-sdk/lib/candidate-contracts/payloads.js';
import {AiTaskSpecDraftSerde} from '../../../../ra-workbench-sdk/packages/workbench-backend-sdk/lib/generation.js';
import {PaperTaskPromptSerde, TaskPromptInputV1Serde} from '../../../../ra-workbench-sdk/packages/workbench-backend-sdk/lib/analysis-workflow/prompt.js';
import {AnalysisWorkflowErrorSerde} from '../../../../ra-workbench-sdk/packages/workbench-backend-sdk/lib/analysis-workflow.js';
import {defineSerde} from '../../../../ra-workbench-sdk/packages/workbench-backend-sdk/lib/serde.js';
import {decideCandidate} from './analysis-workflow.mts';
import {decodePayload, encodePayload} from '../../../../ra-workbench-sdk/packages/workbench-backend-sdk/lib/paper-context-wire/codec.js';
import {WorkflowDecisionV1Serde, WorkflowInputV1Serde} from '../../../../ra-workbench-sdk/packages/workbench-backend-sdk/lib/analysis-workflow/wire.js';
import {buildDoclingPrompt, candidateRecovery, completionProjection, decideAnalysisWorkflow, decideTemplate, doclingRowDecision, genericReview, legacyPrompt, matrixContext, matrixEvidence, overviewTask, packSources, planAttempt, researchMessages, selectPages, selectionPreview, submissionScope, suggestionMessages, validateAttemptMessages, validateAttemptTurn, validateDoclingImages, validateDoclingSources, validateDraft, validateGeneration, validatePortraitEvidence, validatePortraitPaper, validatePortraitSources, validateResearchBundle, validateReuse, validateSources, validateStart, validateTaskScope} from './analysis-workflow.mts';

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

test('analysis workflow preserves task shape and prompt source bindings', () => {
  const draft = decodePayload(overviewTask({paperId: 'paper', attachmentIds: ['attachment'], selectionRevision: 1n, template: null, modelSelection: null}), AiTaskSpecDraftSerde);
  assert.deepEqual((draft as any).taskKind, 'paper_overview');
  const taskShape = {kind: 'taskShape' as const, draftCborBase64: encodePayload(draft, AiTaskSpecDraftSerde)};
  const shapeDecision = decodePayload(decideAnalysisWorkflow({cborBase64: encodePayload(taskShape, WorkflowInputV1Serde)}).decisionCborBase64, WorkflowDecisionV1Serde);
  assert.deepEqual(shapeDecision, {kind: 'validated', rejection: null});
  const promptInput = {taskTemplate: '{{ task }}\n{{ contract }}\n{{ preferences }}', readingContract: 'Schema: {{ schema }}', sources: [
    {source: {sourceId: 'source', kind: 'userResource', resourceId: 'paper', revision: 'frozen', anchor: JSON.stringify({resourceKind: 'paper', sourceUrl: 'ignored'}), text: JSON.stringify({label: 'Paper Ω'})}, resource: {paper: {resourceId: 'paper', attachmentId: 'pdf'}}},
    {source: {sourceId: 'target', kind: 'userResource', resourceId: 'reading', revision: 'frozen', anchor: JSON.stringify({resourceKind: 'structuredReading', contextAccess: 'readWrite', sourceUrl: 'source://library/paper/reading'}), text: JSON.stringify({label: 'Reading'})}, resource: 'other'},
  ], kind: 'structuredReading', profile: null, preferences: '{"language":"zh"}'} as const;
  const promptInputCbor = encodePayload(promptInput, TaskPromptInputV1Serde);
  const promptDecision = decodePayload(decideAnalysisWorkflow({cborBase64: encodePayload({kind: 'renderPrompt', inputCborBase64: promptInputCbor}, WorkflowInputV1Serde)}).decisionCborBase64, WorkflowDecisionV1Serde);
  assert.equal(promptDecision.kind, 'prompt');
  if (promptDecision.kind !== 'prompt') return;
  const result = decodePayload(promptDecision.resultCborBase64, defineSerde({kind: 'enum', variants: [{name: 'Ok', shape: {kind: 'ref', resolve: () => PaperTaskPromptSerde.shape}}, {name: 'Err', shape: {kind: 'ref', resolve: () => AnalysisWorkflowErrorSerde.shape}}]}));
  assert.equal((result as any).Ok.text.includes('Paper Ω'), true);
  assert.equal((result as any).Ok.userInput[0].textElements.length, 2);
  assert.equal((result as any).Ok.userInput[1].target.revision, 'frozen');
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

test('analysis workflow builds a bounded Docling provider prompt', () => {
  const result = buildDoclingPrompt({items: [{id: 'item', paperId: 'paper', attachmentId: 'attachment', contentSha256: 'sha', parseRunId: 'run', rawRef: 'ref', kind: 'text', label: null, pageIndex: 0, regions: [], charspan: null, sourceTextHash: null, text: 'Context text', tableJson: null}], assets: {}, profile: {paperTemplate: null, paperId: 'paper', selectionRevision: 1n, profileRefs: [], fieldKinds: ['question']}, evidence: [{citationKey: 'item', quoteExact: 'Context text'}]});
  assert.equal('Ok' in result, true);
  if ('Ok' in result) {assert.match(result.Ok.auditText, /paper_overview_unit_v1/); assert.match(result.Ok.auditText, /Context text/); assert.equal(result.Ok.messages[0]!.images.length, 0);}
});

test('analysis workflow preserves research and suggestion prompt contracts', () => {
  const item = {citationKey: 'ev', paperId: 'paper', paperTitle: 'Paper', quoteExact: 'Quote', contextText: 'Context', contentSha256: 'a'.repeat(64), pageIndex: 1n, validationStatus: 'valid'};
  const research = {taskKind: 'reference_extraction', userGoal: 'Goal', matrixContext: null, validationStatus: 'valid', items: [item, {...item, citationKey: 'ev2'}]};
  assert.equal(validateResearchBundle(research), null);
  const messages = researchMessages(research); assert.equal('Ok' in messages, true); if ('Ok' in messages) {assert.match(messages.Ok.systemText, /reference_record_candidate_v1/); assert.equal(JSON.parse(messages.Ok.userText).evidence.length, 2);}
  const suggestions = suggestionMessages([{citationKey: 'ev', anchorId: 'a', paperTitle: 'Paper', attachmentId: 'att', contentSha256: 'a'.repeat(64), pageIndex: 1n, pageLabel: '2', quoteExact: 'Quote', contextText: 'Context', relationKind: 'direct_quote'}], 'Goal', 'concept_suggestion_v1');
  assert.equal('Ok' in suggestions, true); assert.deepEqual(suggestionMessages([], 'Goal', 'unknown'), {Err: {kind: 'invalidInput', message: '建议候选类型不受支持'}});
});

test('analysis workflow preserves matrix scope and context gates', () => {
  const draft = {projectId: 'project', matrixId: 'matrix', matrixRevision: 2n, viewKind: 'taxonomy', title: 'Title', scopeNote: 'Scope', inputs: []};
  assert.deepEqual(matrixContext({kind: 'header', draft}), {kind: 'validated', rejection: null});
  assert.deepEqual(matrixContext({kind: 'revision', matches: false}), {kind: 'validated', rejection: {kind: 'invalidInput', message: '证据矩阵版本已变化，请重新预览综合范围'}});
  assert.deepEqual(matrixContext({kind: 'input', input: {objectKind: 'matrix_cell', objectId: 'cell', objectRevision: 1n, selectionReason: 'reason'}, priorCellIds: ['cell']}), {kind: 'validated', rejection: {kind: 'invalidInput', message: '多文献综合输入单元无效或重复'}});
});

test('analysis workflow preserves matrix anchor evidence limits', () => {
  assert.deepEqual(matrixEvidence({kind: 'anchor', source: null}), {kind: 'validated', rejection: {kind: 'invalidInput', message: '多文献综合原文锚点或附件版本不可用'}});
  assert.deepEqual(matrixEvidence({kind: 'frozenHash', expected: 'a', actual: 'b'}), {kind: 'validated', rejection: {kind: 'invalidInput', message: '多文献综合来源附件版本已变化'}});
});

test('analysis workflow freezes same-paper source bundles only', () => {
  const sources = [{sourceId: 'a', kind: 'paper' as const, resourceId: 'paper', revision: '1', anchor: null, text: 'A'}, {sourceId: 'b', kind: 'paper' as const, resourceId: 'paper', revision: '1', anchor: null, text: 'B'}];
  const packed = packSources(sources); assert.equal('Ok' in packed, true); if ('Ok' in packed) {assert.equal(packed.Ok.length, 1); assert.match(packed.Ok[0]!.sourceId, /^paper-bundle:/);}
  assert.deepEqual(packSources([sources[0]!, {...sources[1]!, resourceId: 'other'}]), {Err: {kind: 'invalidInput', message: '论文来源包不能混合不同文献或版本'}});
});

test('analysis workflow projects Docling evidence rows with page scoped regions', () => {
  const item = {id: 'item', pageIndex: 2, regions: [{pageIndex: 2, rect: {x: 1, y: 2, width: 3, height: 4}}, {pageIndex: 3, rect: {x: 5, y: 6, width: 7, height: 8}}], kind: 'text', rawRef: 'ref', label: null, text: 'Quote', tableJson: null};
  const result = doclingRowDecision({runId: 'run', item});
  assert.equal(result.kind, 'ready'); assert.equal(result.row.anchorId, 'docling:run:item'); assert.equal(result.row.pageIndex, 2n); assert.equal(JSON.parse(result.row.rectsJson).length, 1);
});

test('analysis workflow preserves completion template and retained-field projection rules', () => {
  const result = completionProjection({kind: 'structuredReading', content: {template: {fields: [{id: 'q', title: 'Q', question: 'Question', color: null}]}, retainedFields: ['x'], body: 'body'}, template: {kind: 'required', content: {fields: [{id: 'q', title: 'Q', question: 'Question', color: null}]}} as any} as any);
  assert.deepEqual(result, {Ok: '{"template":{"fields":[{"id":"q","title":"Q","question":"Question","color":null}]},"body":"body"}'});
  assert.deepEqual(completionProjection({kind: 'structuredReading', content: {template: {fields: []}}, template: {kind: 'required', content: {fields: [{id: 'q'}]}} as any} as any), {Err: {kind: 'invalidInput', message: '画像已保存，但本文阅读模板尚未成功保存；请在内部对话继续完成待审修改'}});
});

test('analysis workflow preserves generic candidate review action semantics', () => {
  const draft = {candidateId: 'candidate', candidateRevision: 1n, action: 'accept_unchanged', rationale: ' rationale ', idempotencyKey: 'key', readingUnitTitle: null, projectId: null};
  const observation = {candidateKind: 'paper_overview_unit_v1', currentRevision: 1n, reviewState: 'unreviewed', hasActiveConfirmations: false, hasRevisionItemDecisions: false, currentEditorKind: 'ai'};
  assert.deepEqual(genericReview({kind: 'candidate', draft, observation}), {kind: 'candidate', result: {Ok: {reviewState: 'accepted_unchanged', provenance: 'ai_accepted_unchanged', requiresInspection: true, requiresCitations: true}}});
  assert.deepEqual(genericReview({kind: 'inspection', inspected: false}), {kind: 'validated', rejection: {kind: 'invalidInput', detail: '原样接受前必须先打开至少一条候选证据'}});
});

test('analysis workflow prepares generic promotion units from selection candidates', () => {
  const result = genericReview({kind: 'genericPromotion', input: {payload: {kind: 'selection_explanation_v1', statements: [{text: 'Reason', epistemicRole: 'source_paraphrase'}], uncertainties: ['Limit']}, readingUnitTitle: '  Title ', projectId: null, paperId: 'paper', anchorIds: ['a'], provenanceKind: 'ai_accepted_unchanged', candidateId: 'candidate', candidateRevision: 1n}});
  assert.equal(result.kind, 'genericPromotion'); assert.equal('Ok' in result.result, true); if ('Ok' in result.result) {assert.equal(result.result.Ok.kind, 'readingUnits'); assert.equal(result.result.Ok.units[0]!.title, 'Title'); assert.match(result.result.Ok.units[0]!.body, /尚待确认/);}
});

test('analysis workflow routes derived-view validation through the existing rule set', () => {
  const result = genericReview({kind: 'derivedValidation', input: {kind: 'provenance', provenanceKind: 'invalid'}} as any);
  assert.deepEqual(result, {kind: 'derivedValidation', rejection: {kind: 'invalidInput', detail: '派生视图校验失败：provenance'}});
  const promotion = genericReview({kind: 'derivedPromotion', input: {view: {kind: 'derived_research_view_v1', schemaVersion: 1n, viewKind: 'taxonomy', title: 'Taxonomy', scopeNote: 'Scope', items: [{id: 'item', text: 'Text', epistemicRole: 'synthesis', evidenceItemIds: ['ev'], hasConflict: false}]}, context: {projectId: 'project', matrixId: 'matrix', matrixRevision: 1n, viewKind: 'taxonomy', title: 'Taxonomy', scopeNote: 'Scope', inputs: []}, projectId: 'project', anchorsByKey: [['ev', 'anchor']], provenanceKind: 'ai_accepted_after_edit', providerId: 'provider', modelId: 'model', generatedAt: 'now', candidateId: 'candidate', candidateRevision: 2n}} as any);
  assert.equal(promotion.kind, 'derivedPromotion'); assert.equal('Ok' in promotion.result, true); if ('Ok' in promotion.result) assert.deepEqual(promotion.result.Ok.items[0].evidenceAnchorIds, ['anchor']);
});

test('analysis workflow validates accepted reading-unit content before storage', () => {
  const draft = {projectId: null, paperId: 'paper', unitKind: 'other', title: 'Title', body: 'Body', provenanceKind: 'ai_accepted_unchanged', epistemicRole: 'synthesis', anchorIds: ['a'], candidateId: 'candidate', candidateRevision: 1n};
  assert.deepEqual(genericReview({kind: 'readingUnitValidation', ordinal: 0n, draft}), {kind: 'readingUnitValidation', rejection: null});
});

test('analysis workflow prepares reference promotion plans with accepted provenance', () => {
  const input = {
    kind: 'referencePromotion' as const,
    input: {
      reference: {kind: 'reference_record_candidate_v1', schemaVersion: 1n, rawText: 'Author. Title. 2024.', evidenceItemIds: ['ev'], fields: [{name: 'title', value: 'Title', evidenceItemIds: ['ev']}], uncertainties: []},
      sources: [{paperId: 'paper', anchorId: 'anchor', relationKind: 'direct_quote'}],
      provenanceKind: 'ai_accepted_unchanged',
      candidateId: 'candidate',
      candidateRevision: 3n,
    },
  };
  const result = genericReview(input);
  assert.equal(result.kind, 'referencePromotion');
  assert.equal('Ok' in result.result, true);
  if ('Ok' in result.result) {
    assert.equal(result.result.Ok.provenanceKind, 'ai_accepted_unchanged');
    assert.equal(result.result.Ok.candidateRevision, 3n);
    assert.equal(result.result.Ok.record.draft.citingPaperId, 'paper');
    assert.deepEqual(result.result.Ok.record.draft.fields, [{name: 'title', value: 'Title', sourceKind: 'ai_inference', confirmedByUser: false}]);
    assert.equal(JSON.parse(result.result.Ok.record.snapshotJson).acceptedFrom.candidateId, 'candidate');
  }
  assert.deepEqual(genericReview({...input, input: {...input.input, provenanceKind: 'manual'}} as any), {kind: 'referencePromotion', result: {Err: {kind: 'invalidInput', detail: 'AI 参考条目审查来源无效'}}});
});

test('analysis workflow routes knowledge and typed review families through their original decisions', () => {
  const knowledge = decodePayload(decideAnalysisWorkflow({cborBase64: encodePayload({kind: 'knowledgeValidation', ordinal: 0n, input: {kind: 'relationNode', nodeKind: 'paper', idIsEmpty: false, idBytes: 12n}}, WorkflowInputV1Serde)}).decisionCborBase64, WorkflowDecisionV1Serde);
  assert.deepEqual(knowledge, {kind: 'knowledgeValidation', decision: {kind: 'relationNode', result: {Ok: 'paper'}}});
  const suggestion = decodePayload(decideAnalysisWorkflow({cborBase64: encodePayload({kind: 'suggestionReview', input: {kind: 'state', total: 1n, terminal: 0n, accepted: 0n, editorKind: 'human', action: 'defer'}}, WorkflowInputV1Serde)}).decisionCborBase64, WorkflowDecisionV1Serde);
  assert.deepEqual(suggestion, {kind: 'suggestionReview', decision: {kind: 'state', state: 'deferred'}});
  const paper = decodePayload(decideAnalysisWorkflow({cborBase64: encodePayload({kind: 'paperConceptReview', input: {kind: 'paper', paperIds: ['paper']}}, WorkflowInputV1Serde)}).decisionCborBase64, WorkflowDecisionV1Serde);
  assert.deepEqual(paper, {kind: 'paperConceptReview', decision: {kind: 'paper', result: {Ok: 'paper'}}});
});
