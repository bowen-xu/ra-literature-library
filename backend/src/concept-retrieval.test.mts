import assert from 'node:assert/strict';
import {test} from 'node:test';
import {configuration, definitionContext, externalPaperCount, ftsQuery, renderContext, selectSources, termUsageContext, validateDraft} from './concept-retrieval.mts';

const source = (anchorId: string, conceptId = 'c', paperId = 'p', selected = false) => ({anchorId, conceptId, conceptLabel: '概念', paperId, paperTitle: '论文', sourceKind: 'definition_claim', sourceSubjectId: 's', sourceSubjectRevision: 1, pageIndex: 0, pageLabel: '1', quoteExact: '原文', contextText: '范围', selected, omissionReason: null});

test('concept retrieval source selection preserves priority, duplicate and limit policies', () => {
  const sources = [source('a'), ...Array.from({length: 13}, (_, index) => source(`x${index}`, 'c'))];
  const selected = selectSources(['c'], sources);
  assert.equal(selected.filter(item => item.selected).length, 12); assert.equal(selected.at(-1)?.omissionReason, 'source_limit');
  assert.equal(externalPaperCount(selected, 'p'), 0); assert.match(renderContext([], [], selected), /概念网络检索上下文/u);
});

test('concept retrieval keeps query and context formatting contracts', () => {
  assert.equal(ftsQuery('中文 question_1'), '"中文" OR "question_1"');
  assert.equal(definitionContext('定义', '范围'), '定义\n范围：范围'); assert.equal(termUsageContext('', '术语'), '术语：术语');
  validateDraft({clientRequestId: 'id', query: ' query ', paperId: null}); assert.throws(() => validateDraft({clientRequestId: '', query: 'x', paperId: null}));
  assert.match(configuration('ready'), /concept-retrieval-v1/u);
});
