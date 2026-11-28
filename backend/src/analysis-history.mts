/** Analysis workflow history projection migrated from native analysis_history.rs. */
import {decodePayload, encodePayload} from '../../../../ra-workbench-sdk/packages/workbench-backend-sdk/lib/paper-context-wire/codec.js';
import {HistoryInputV1Serde, HistoryResultV1Serde, type HistoryResultV1, type HistoryWireInputV1, type HistoryWireOutcomeV1} from '../../../../ra-workbench-sdk/packages/workbench-backend-sdk/lib/analysis-history.js';

export interface AnalysisAttemptRow {readonly id: string; readonly turnId: string; readonly [key: string]: unknown}
export interface CapturedTurn {readonly row: Record<string, unknown>; readonly attempts: readonly AnalysisAttemptRow[]}
export interface CapturedWorkflow {readonly row: Record<string, unknown>; readonly turns: readonly CapturedTurn[]}
export interface AnalysisHistoryInput {readonly request: {readonly kind: string}; readonly workflow: CapturedWorkflow | null}
export type AnalysisHistoryResult = {readonly status: 'ready'; readonly workflow: Record<string, unknown> | null} | {readonly status: 'rejected'; readonly error: 'not_found'};

function text(row: Record<string, unknown>, key: string): string {return typeof row[key] === 'string' ? row[key] as string : '';}
function nullableText(row: Record<string, unknown>, key: string): string | null {return row[key] === null || row[key] === undefined ? null : text(row, key);}
function numberOrNull(value: unknown): number | bigint | null {
  if (typeof value === 'bigint') return value;
  return typeof value === 'number' && Number.isSafeInteger(value) ? value : null;
}
function uuidOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value) ? value : null;
}

function attempt(capture: AnalysisAttemptRow): Record<string, unknown> {
  const row = capture as Record<string, unknown>;
  return {
    id: text(row, 'id'), turnId: text(row, 'turnId'), sharedConversationId: uuidOrNull(row.sharedConversationId), sharedTurnOutcome: nullableText(row, 'sharedTurnOutcome'),
    sharedRequestId: uuidOrNull(row.sharedRequestId), sharedTurnId: uuidOrNull(row.sharedTurnId), sharedAiRunId: nullableText(row, 'sharedAiRunId'), sharedCandidateId: nullableText(row, 'sharedCandidateId'),
    sharedTerminalStatus: nullableText(row, 'sharedTerminalStatus'), attempt: numberOrNull(row.attempt), status: text(row, 'status'), normalizedMessages: Array.isArray(row.normalizedMessages) ? row.normalizedMessages : [],
    providerId: text(row, 'providerId'), modelId: text(row, 'modelId'), reasoningEffort: nullableText(row, 'reasoningEffort'), aiRunId: nullableText(row, 'aiRunId'), candidateId: nullableText(row, 'candidateId'),
    inputHash: nullableText(row, 'inputHash'), outputHash: nullableText(row, 'outputHash'), inputTokens: numberOrNull(row.inputTokens), outputTokens: numberOrNull(row.outputTokens),
    errorCode: nullableText(row, 'errorCode'), errorMessage: nullableText(row, 'errorMessage'), createdAt: text(row, 'createdAt'), startedAt: nullableText(row, 'startedAt'), finishedAt: nullableText(row, 'finishedAt'),
    recoveryReason: nullableText(row, 'recoveryReason'), recoveryVersion: numberOrNull(row.recoveryVersion), recoveredAt: nullableText(row, 'recoveredAt'),
  };
}
function turn(capture: CapturedTurn): Record<string, unknown> {
  const row = capture.row;
  return {id: text(row, 'id'), workflowId: text(row, 'workflowId'), ordinal: numberOrNull(row.ordinal), kind: text(row, 'kind'), status: text(row, 'status'), candidateId: nullableText(row, 'candidateId'), createdAt: text(row, 'createdAt'), finishedAt: nullableText(row, 'finishedAt'), attempts: capture.attempts.map(attempt)};
}
function workflow(capture: CapturedWorkflow): Record<string, unknown> {
  const row = capture.row;
  return {id: text(row, 'id'), activeClientRequestId: null, conversationId: uuidOrNull(row.conversationId), paperId: text(row, 'paperId'), contextSnapshotId: nullableText(row, 'contextSnapshotId'), status: text(row, 'status'), providerId: text(row, 'providerId'), modelId: text(row, 'modelId'), reasoningEffort: nullableText(row, 'reasoningEffort'), promptSetVersion: text(row, 'promptSetVersion'), activeTurnKind: nullableText(row, 'activeTurnKind'), revision: numberOrNull(row.revision), supersedesWorkflowId: nullableText(row, 'supersedesWorkflowId'), createdAt: text(row, 'createdAt'), updatedAt: text(row, 'updatedAt'), completedAt: nullableText(row, 'completedAt'), turns: capture.turns.map(turn)};
}

export function projectAnalysisHistory(input: AnalysisHistoryInput): AnalysisHistoryResult {
  if (input.workflow === null) return input.request.kind === 'get' ? {status: 'rejected', error: 'not_found'} : {status: 'ready', workflow: null};
  return {status: 'ready', workflow: workflow(input.workflow)};
}

/** The Core/native boundary sends the captured history as CBOR. Keep the
 * pure projection above available for direct backend tests, and perform the
 * wire conversion only at the catalog operation boundary. */
export function projectAnalysisHistoryWire(input: HistoryWireInputV1): HistoryWireOutcomeV1 {
  const captured = decodePayload(input.cborBase64, HistoryInputV1Serde);
  const adapted: AnalysisHistoryInput = {
    request: captured.request,
    workflow: captured.workflow === null ? null : {
      row: {...captured.workflow.row},
      turns: captured.workflow.turns.map(turn => ({row: {...turn.row}, attempts: turn.attempts.map(attempt => ({...attempt}))})),
    },
  };
  const projected = projectAnalysisHistory(adapted);
  // The pure backend projection intentionally accepts the legacy row shape
  // used by the direct tests. The SDK boundary performs the authoritative
  // serde validation and accepts safe numeric integer inputs at encode time.
  const result = (projected.status === 'ready' ? {Ok: projected.workflow} : {Err: 'notFound'}) as unknown as HistoryResultV1;
  return {input, resultCborBase64: encodePayload(result, HistoryResultV1Serde)};
}
