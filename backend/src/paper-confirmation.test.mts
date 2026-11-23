import assert from 'node:assert/strict';
import test from 'node:test';
import type {AiCandidate} from '@research-assistant/core/ai';
import {fieldAnchors, fieldPlan, normalizePaperDraft, preparePaperConfirmation, prepareUnit, type PaperConfirmationInput} from './paper-confirmation.mts';

function fixture(): {candidate: AiCandidate; overview: any} {
  const overview = {
    kind: 'paper_overview_unit_v1', schemaVersion: 1, profileId: 'generic_overview_v1',
    fields: [{field: 'approach', status: 'filled', statements: [{id: 's1', text: '  Original method Ω  ', epistemicRole: 'source_paraphrase', evidenceItemIds: ['ev'], evidenceQuotes: [{evidenceItemId: 'ev', quote: '唯一'}]}]},
      {field: 'key_result', status: 'not_found', statements: []}],
  };
  const candidate = {
    id: 'candidate', runId: 'run', providerId: 'provider', modelId: 'model', candidateKind: 'paper_overview_unit_v1', schemaVersion: 1,
    currentRevision: 1, reviewState: 'unreviewed', validationStatus: 'valid', originalPayloadHash: 'hash', createdAt: 'old', updatedAt: 'old',
    evidenceBundle: {id: 'bundle', runId: 'run', scopeHash: 'hash', retrievalConfigVersion: 'v1', validationStatus: 'valid', createdAt: 'old', items: [{
      id: 'item', citationKey: 'ev', ordinal: 0, anchorId: 'anchor', paperId: 'paper', paperTitle: 'Title', attachmentId: 'attachment', contentSha256: 'a'.repeat(64), pageIndex: 0,
      pageLabel: '1', quoteExact: '前文唯一后文', quotePrefix: '前'.repeat(180), quoteSuffix: '后'.repeat(180), contextText: 'Context', relationKind: 'direct_quote', validationStatus: 'valid', currentAnchorStatus: 'exact', createdAt: 'old',
    }]},
    revisions: [{id: 'revision', revision: 1, payload: overview, payloadHash: 'hash', editorKind: 'ai', changeReason: 'generated', createdAt: 'old'}],
    decisions: [], attentionFeedback: [], suggestionItemDecisions: [], citationAssessments: [], inspectedEvidenceItemIds: [], overviewFieldConfirmations: [], summaryVersions: [],
  } as unknown as AiCandidate;
  return {candidate, overview};
}

test('field confirmation preserves quoted anchors, Unicode context and later errors', () => {
  const {candidate, overview} = fixture();
  const field = overview.fields[0]!;
  const withUnknown = {...field, statements: [...field.statements, {id: 's2', text: 'same', epistemicRole: 'source_paraphrase', evidenceItemIds: ['unknown']}]};
  const anchors = fieldAnchors(candidate, withUnknown);
  assert.equal(anchors.length, 2);
  assert.equal('kind' in anchors[0]!, true);
  if ('kind' in anchors[0]! && anchors[0]!.kind === 'quoted') {
    assert.equal([...anchors[0]!.prefix].length, 160);
    assert.equal([...anchors[0]!.suffix].length, 160);
    assert.ok(anchors[0]!.prefix.endsWith('前文'));
    assert.ok(anchors[0]!.suffix.startsWith('后文'));
  }
  assert.deepEqual(anchors[1], {code: 'invalid_input', message: '字段引用了未知证据'});
  const plan = fieldPlan(candidate, overview, field);
  assert.equal((plan.unit as {title: string}).title, '结构化阅读 · 方法／论证路径');
  assert.equal((plan.unit as {body: string}).body, 'Original method Ω');
});

test('repeated quotes deduplicate and ambiguous source context remains empty', () => {
  const {candidate, overview} = fixture();
  (candidate.evidenceBundle.items[0] as {quoteExact: string}).quoteExact = '唯一与唯一';
  const field = {...overview.fields[0], statements: [{...overview.fields[0].statements[0], evidenceItemIds: ['ev', 'ev']}]};
  const anchors = fieldAnchors(candidate, field);
  assert.equal(anchors.length, 1);
  assert.equal('kind' in anchors[0]!, true);
  if ('kind' in anchors[0]! && anchors[0]!.kind === 'quoted') {assert.equal(anchors[0]!.prefix, ''); assert.equal(anchors[0]!.suffix, '');}
});

test('paper normalization keeps rejection order and removes project scope', () => {
  const draft = {paperId: 'paper', projectId: 'ignored', metadataFieldNames: ['title', 'doi', 'title'], overviewTargets: [{candidateId: 'candidate', candidateRevision: 3, fieldKinds: ['key_result', 'approach', 'key_result']}], idempotencyKey: ' paper-key '};
  assert.deepEqual(normalizePaperDraft(draft), {status: 'ready', value: {paperId: 'paper', metadataFieldNames: ['doi', 'title'], overviewTargets: [{candidateId: 'candidate', candidateRevision: 3, fieldKinds: ['approach', 'key_result']}], idempotencyKey: ' paper-key '}});
  assert.deepEqual(normalizePaperDraft({...draft, paperId: ' '}), {status: 'rejected', error: {code: 'invalid_input', message: '文献 ID 不能为空'}});
  assert.deepEqual(normalizePaperDraft({...draft, metadataFieldNames: ['invalid']}), {status: 'rejected', error: {code: 'invalid_input', message: '元数据确认字段无效：invalid'}});
});

test('unit confirmation keeps validation, revision and restore decisions distinct', () => {
  assert.deepEqual(prepareUnit({kind: 'validate', title: 'Title', body: 'Body', unitKind: 'approach', provenanceKind: 'ai_accepted_unchanged', epistemicRole: 'source_paraphrase', anchorCount: 1}), {kind: 'validated', rejection: null});
  assert.deepEqual(prepareUnit({kind: 'revision', currentRevision: null, expectedRevision: 1}), {kind: 'revision', result: {ok: false, error: {kind: 'notFound'}}});
  assert.deepEqual(prepareUnit({kind: 'revision', currentRevision: 4, expectedRevision: 2}), {kind: 'revision', result: {ok: false, error: {kind: 'revisionConflict', currentRevision: 4}}});
  assert.deepEqual(prepareUnit({kind: 'revision', currentRevision: 4, expectedRevision: 4}), {kind: 'revision', result: {ok: true, value: 5}});
  const restored = prepareUnit({kind: 'restore', snapshot: {projectId: null, paperId: 'paper', unitKind: 'approach', title: 'Old', body: 'Body', provenanceKind: 'human_original', epistemicRole: 'working_note', evidenceLinks: [{anchorId: 'a', stance: 'context', rationale: 'R'}, {anchorId: 'b', stance: 'context', rationale: 4}, {anchorId: 'never'}]}});
  assert.equal(restored.kind, 'restore');
  if (restored.kind === 'restore') {assert.equal(restored.header.ok, true); assert.equal(restored.links.ok, true); if (restored.links.ok) assert.equal(restored.links.value.length, 2);}
});

test('catalog dispatcher preparation exposes migrated paper confirmation operation', () => {
  const input: PaperConfirmationInput = {kind: 'overviewReplay', requestedCandidateId: 'a', batchCandidateId: 'b'};
  const result = preparePaperConfirmation(input);
  assert.deepEqual(result, {status: 'rejected', error: {code: 'invalid_input', message: '确认幂等键已用于其他候选'}});
});
