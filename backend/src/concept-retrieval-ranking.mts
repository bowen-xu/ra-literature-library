export interface LexicalHit {conceptId: string; rank: number}
export interface VectorObservation {conceptId: string; valid: boolean; distanceBits: number; subjectRevision: number}
export interface CandidateRank {conceptId: string; lexicalRank: number | null; vectorRank: number | null; vectorDistanceBits: number | null; vectorRevision: number | null}
export interface ConceptIdentity {revision: number; label: string; preferredTerm: string}
export interface ConceptRetrievalSeed {
  conceptId: string; conceptRevision: number; label: string; preferredTerm: string; matchedBy: string[];
  lexicalRank: number | null; vectorRank: number | null; vectorDistance: number | null; rrfScore: number;
}

function empty(conceptId: string): CandidateRank { return {conceptId, lexicalRank: null, vectorRank: null, vectorDistanceBits: null, vectorRevision: null}; }
function rrf(rank: number): number { return 1 / (60 + rank); }
function f32(bits: number): number {
  const buffer = new ArrayBuffer(4); new DataView(buffer).setUint32(0, bits >>> 0, false); return new DataView(buffer).getFloat32(0, false);
}

export function rankCandidates(lexicalHits: readonly LexicalHit[], vectorHits: readonly VectorObservation[]): CandidateRank[] {
  const ranks = new Map<string, CandidateRank>();
  for (const hit of lexicalHits) (ranks.get(hit.conceptId) ?? (ranks.set(hit.conceptId, empty(hit.conceptId)), ranks.get(hit.conceptId)!)).lexicalRank = hit.rank;
  for (const [index, hit] of vectorHits.entries()) {
    if (!hit.valid) continue;
    const state = ranks.get(hit.conceptId) ?? (ranks.set(hit.conceptId, empty(hit.conceptId)), ranks.get(hit.conceptId)!);
    state.vectorRank = index + 1; state.vectorDistanceBits = hit.distanceBits; state.vectorRevision = hit.subjectRevision;
  }
  return [...ranks.values()].sort((left, right) => left.conceptId.localeCompare(right.conceptId));
}

export function projectSeed(rank: CandidateRank, identity: ConceptIdentity | null): ConceptRetrievalSeed | null {
  if (identity === null) return null;
  if (rank.vectorRank !== null && rank.vectorRevision !== identity.revision && rank.lexicalRank === null) return null;
  const vectorCurrent = rank.vectorRank !== null && rank.vectorRevision === identity.revision;
  const matchedBy = [...(rank.lexicalRank === null ? [] : ['lexical']), ...(vectorCurrent ? ['vector'] : [])];
  return {conceptId: rank.conceptId, conceptRevision: identity.revision, label: identity.label, preferredTerm: identity.preferredTerm,
    matchedBy, lexicalRank: rank.lexicalRank, vectorRank: vectorCurrent ? rank.vectorRank : null,
    vectorDistance: vectorCurrent && rank.vectorDistanceBits !== null ? f32(rank.vectorDistanceBits) : null,
    rrfScore: (rank.lexicalRank === null ? 0 : rrf(rank.lexicalRank)) + (rank.vectorRank === null ? 0 : rrf(rank.vectorRank))};
}

export function selectSeeds(seeds: readonly ConceptRetrievalSeed[]): ConceptRetrievalSeed[] {
  return [...seeds].sort((left, right) => right.rrfScore - left.rrfScore || left.conceptId.localeCompare(right.conceptId)).slice(0, 8);
}
