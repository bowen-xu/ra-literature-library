import {hash} from './retrieval-trace.mts';
import {configuration, definitionContext, externalPaperCount, ftsQuery, renderContext, selectSources, termUsageContext, validateDraft, type ConceptRetrievalDraft, type ConceptRetrievalEdge, type ConceptRetrievalSource} from './concept-retrieval.mts';
import {projectSeed, rankCandidates, selectSeeds, type ConceptIdentity, type LexicalHit, type VectorObservation, type CandidateRank, type ConceptRetrievalSeed} from './concept-retrieval-ranking.mts';

export type ConceptRetrievalInput =
  | {kind: 'validateDraft'; draft: ConceptRetrievalDraft}
  | {kind: 'validatePaper'; exists: boolean}
  | {kind: 'rankCandidates'; lexicalHits: readonly LexicalHit[]; vectorHits: readonly VectorObservation[]}
  | {kind: 'selectSeeds'; candidates: readonly {rank: CandidateRank; identity: ConceptIdentity | null}[]}
  | {kind: 'projectGraph'; seedIds: readonly string[]; edges: readonly ConceptRetrievalEdge[]}
  | {kind: 'projectSources'; paperId: string | null; seeds: readonly ConceptRetrievalSeed[]; edges: readonly ConceptRetrievalEdge[]; definitions: readonly SourceObservation[]; usages: readonly SourceObservation[]};

export interface SourceObservation {anchorId: string; conceptId: string; conceptLabel: string; paperId: string; paperTitle: string; sourceSubjectId: string; sourceSubjectRevision: number; pageIndex: number; pageLabel: string; quoteExact: string; text: string; detail: string}
export type ConceptRetrievalDecision =
  | {kind: 'query'; query: string; ftsQuery: string; querySha256: string}
  | {kind: 'paperValidated'}
  | {kind: 'rejected'; message: string}
  | {kind: 'candidates'; candidates: CandidateRank[]}
  | {kind: 'seeds'; seeds: ConceptRetrievalSeed[]}
  | {kind: 'graph'; edges: ConceptRetrievalEdge[]; conceptIds: string[]}
  | {kind: 'trace'; sources: ConceptRetrievalSource[]; selectedSourceCount: number; externalPaperCount: number; contextText: string; contextSha256: string; configJson: string};

function source(row: SourceObservation, definition: boolean): ConceptRetrievalSource {
  return {anchorId: row.anchorId, conceptId: row.conceptId, conceptLabel: row.conceptLabel, paperId: row.paperId, paperTitle: row.paperTitle,
    sourceKind: definition ? 'definition_claim' : 'term_usage', sourceSubjectId: row.sourceSubjectId, sourceSubjectRevision: row.sourceSubjectRevision,
    pageIndex: row.pageIndex, pageLabel: row.pageLabel, quoteExact: row.quoteExact,
    contextText: definition ? definitionContext(row.text, row.detail) : termUsageContext(row.text, row.detail), selected: false, omissionReason: null};
}

export function prepareConceptRetrieval(input: ConceptRetrievalInput): {input: ConceptRetrievalInput; decision: ConceptRetrievalDecision} {
  let decision: ConceptRetrievalDecision;
  switch (input.kind) {
    case 'validateDraft':
      try {validateDraft(input.draft); decision = {kind: 'query', query: input.draft.query.trim(), ftsQuery: ftsQuery(input.draft.query), querySha256: hash(input.draft.query.trim())};}
      catch {decision = {kind: 'rejected', message: '概念网络检索问题或范围无效'};}
      break;
    case 'validatePaper': decision = input.exists ? {kind: 'paperValidated'} : {kind: 'rejected', message: '当前论文不存在'}; break;
    case 'rankCandidates': decision = {kind: 'candidates', candidates: rankCandidates(input.lexicalHits, input.vectorHits)}; break;
    case 'selectSeeds': decision = {kind: 'seeds', seeds: selectSeeds(input.candidates.flatMap(candidate => {const seed = projectSeed(candidate.rank, candidate.identity); return seed === null ? [] : [seed];}))}; break;
    case 'projectGraph': {
      const ids = new Set(input.seedIds), edges = input.edges.map(edge => {ids.add(edge.subjectConceptId); ids.add(edge.objectConceptId); return {...edge, hop: 1};});
      decision = {kind: 'graph', edges, conceptIds: [...ids].sort()}; break;
    }
    case 'projectSources': {
      const sources = selectSources(input.seeds.map(seed => seed.conceptId), [...input.definitions.map(row => source(row, true)), ...input.usages.map(row => source(row, false))]);
      decision = {kind: 'trace', sources, selectedSourceCount: sources.filter(value => value.selected).length,
        externalPaperCount: externalPaperCount(sources, input.paperId), contextText: renderContext(input.seeds, input.edges, sources),
        contextSha256: hash(renderContext(input.seeds, input.edges, sources)), configJson: configuration('used')}; break;
    }
  }
  return {input: structuredClone(input), decision};
}
