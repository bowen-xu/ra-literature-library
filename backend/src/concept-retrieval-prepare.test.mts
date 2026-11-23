import assert from 'node:assert/strict';
import {test} from 'node:test';
import {prepareConceptRetrieval} from './concept-retrieval-prepare.mts';

const draft = {clientRequestId: 'client', query: ' question Ω ', paperId: null};
const source = {anchorId: 'a', conceptId: 'c', conceptLabel: '概念', paperId: 'p', paperTitle: '论文', sourceSubjectId: 's', sourceSubjectRevision: 1, pageIndex: 0, pageLabel: '1', quoteExact: '原文', text: '定义', detail: '范围'};

test('concept retrieval preparation covers query, paper, candidates and seeds', () => {
  assert.equal(prepareConceptRetrieval({kind: 'validateDraft', draft}).decision.kind, 'query');
  assert.equal(prepareConceptRetrieval({kind: 'validatePaper', exists: false}).decision.kind, 'rejected');
  const candidates = prepareConceptRetrieval({kind: 'rankCandidates', lexicalHits: [{conceptId: 'c', rank: 1}], vectorHits: []}).decision;
  assert.equal(candidates.kind, 'candidates');
  assert.equal(prepareConceptRetrieval({kind: 'selectSeeds', candidates: candidates.kind === 'candidates' ? [{rank: candidates.candidates[0]!, identity: {revision: 1, label: 'C', preferredTerm: 'C'}}] : []}).decision.kind, 'seeds');
});

test('concept retrieval preparation projects graph and trace source context', () => {
  const edge = {relationAssertionId: 'r', relationRevision: 1, subjectConceptId: 'c', subjectLabel: '概念', predicateKind: 'related', objectConceptId: 'd', objectLabel: '另一个', hop: 0};
  const seed = {conceptId: 'c', conceptRevision: 1, label: '概念', preferredTerm: '概念', matchedBy: ['lexical'], lexicalRank: 1, vectorRank: null, vectorDistance: null, rrfScore: 1};
  const graph = prepareConceptRetrieval({kind: 'projectGraph', seedIds: ['c'], edges: [edge]}).decision;
  assert.equal(graph.kind, 'graph'); assert.deepEqual(graph.kind === 'graph' ? graph.conceptIds : [], ['c', 'd']);
  const trace = prepareConceptRetrieval({kind: 'projectSources', paperId: null, seeds: [seed], edges: [edge], definitions: [source], usages: []}).decision;
  assert.equal(trace.kind, 'trace'); assert.equal(trace.kind === 'trace' ? trace.selectedSourceCount : 0, 1);
});
