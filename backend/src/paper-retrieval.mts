import {ORIGINAL_MARK_SENT, type RetrievalTraceRow, type TraceRejection, validateContext, RetrievalTraceError} from './retrieval-trace.mts';

export interface PaperRetrievalInput {paperId: string; query: string; row: RetrievalTraceRow | null}
export type PaperRetrievalDecision = {status: 'ready'; markSent: typeof ORIGINAL_MARK_SENT}
  | {status: 'rejected'; reason: TraceRejection};
export interface PaperRetrievalOutcome {input: PaperRetrievalInput; decision: PaperRetrievalDecision}

export function decidePaperRetrieval(input: PaperRetrievalInput): PaperRetrievalOutcome {
  let decision: PaperRetrievalDecision;
  try { validateContext(input.paperId, input.query, input.row); decision = {status: 'ready', markSent: ORIGINAL_MARK_SENT}; }
  catch (error) {
    if (!(error instanceof RetrievalTraceError)) throw error;
    decision = {status: 'rejected', reason: error.rejection};
  }
  return {input: structuredClone(input), decision};
}
