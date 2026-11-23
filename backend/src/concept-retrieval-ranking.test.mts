import assert from 'node:assert/strict';
import {test} from 'node:test';
import {projectSeed, rankCandidates, selectSeeds} from './concept-retrieval-ranking.mts';

test('concept ranking fuses lexical and valid vector hits with deterministic ids', () => {
  const ranks = rankCandidates([{conceptId: 'b', rank: 2}, {conceptId: 'a', rank: 1}], [{conceptId: 'b', valid: true, distanceBits: 0x3f800000, subjectRevision: 4}, {conceptId: 'c', valid: false, distanceBits: 0, subjectRevision: 4}]);
  assert.deepEqual(ranks.map(value => value.conceptId), ['a', 'b']);
  const seed = projectSeed(ranks[1]!, {revision: 4, label: 'B', preferredTerm: 'B'});
  assert.deepEqual(seed?.matchedBy, ['lexical', 'vector']); assert.equal(seed?.vectorDistance, 1);
});

test('stale vector-only hits are dropped and stable tie order keeps eight seeds', () => {
  const stale = projectSeed({conceptId: 'stale', lexicalRank: null, vectorRank: 1, vectorDistanceBits: 0, vectorRevision: 1}, {revision: 2, label: 'S', preferredTerm: 'S'});
  assert.equal(stale, null);
  const seeds = Array.from({length: 10}, (_, index) => ({conceptId: String.fromCharCode(97 + index), conceptRevision: 1, label: '', preferredTerm: '', matchedBy: [], lexicalRank: 1, vectorRank: null, vectorDistance: null, rrfScore: 1}));
  assert.deepEqual(selectSeeds(seeds).map(seed => seed.conceptId), ['a','b','c','d','e','f','g','h']);
});
