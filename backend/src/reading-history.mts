/** Reading-history projections and bootstrap qualification migrated from native reading_history.rs. */

import {sessionSummary, type ReadingSessionRow, type PaperAiReadingSessionSummary} from './paper-context-prepare.mts';

export interface ReadingDebugRow {readonly turnId: string; readonly rawRequestJson: string | null; readonly rawResponseJson: string | null}
export interface ReadingDebugData {readonly turnId: string; readonly rawRequest: unknown; readonly rawResponse: unknown}
export interface ReadingAttachmentStatus {readonly attachmentId: string; readonly contentSha256: string; readonly parseRunId: string | null; readonly parseStatus: string}
export interface AnalysisTurn {readonly kind: string; readonly status: string}
export interface AnalysisWorkflow {readonly id: string; readonly contextSnapshotId: string | null; readonly revision: number; readonly status: string; readonly providerId: string; readonly modelId: string; readonly turns: readonly AnalysisTurn[]; readonly updatedAt: string}
export interface BootstrapOptions {
  readonly defaultKind: string;
  readonly structuredHistory: {readonly workflowId: string; readonly workflowRevision: number; readonly workflowStatus: string; readonly providerId: string; readonly modelId: string; readonly completedTurns: readonly string[]; readonly attachmentCount: number; readonly updatedAt: string} | null;
  readonly unavailableReason: string | null;
}

export type ReadingHistoryInput =
  | {readonly kind: 'list'; readonly rows: readonly ReadingSessionRow[]}
  | {readonly kind: 'session'; readonly summary: ReadingSessionRow | null; readonly turns: readonly unknown[]}
  | {readonly kind: 'debugIdentity'; readonly turnId: string}
  | {readonly kind: 'debugRecord'; readonly row: ReadingDebugRow | null}
  | {readonly kind: 'archive'; readonly sessionId: string}
  | {readonly kind: 'bootstrapSources'; readonly statuses: readonly ReadingAttachmentStatus[]}
  | {readonly kind: 'bootstrapHistory'; readonly workflow: AnalysisWorkflow | null}
  | {readonly kind: 'bootstrapSnapshot'; readonly statuses: readonly ReadingAttachmentStatus[]; readonly workflow: AnalysisWorkflow; readonly attachments: readonly (readonly [string, string, string])[]};

export type ReadingHistoryDecision =
  | {readonly kind: 'list'; readonly sessions: readonly PaperAiReadingSessionSummary[]}
  | {readonly kind: 'session'; readonly session: {readonly summary: PaperAiReadingSessionSummary; readonly turns: readonly unknown[]}}
  | {readonly kind: 'debugIdentity'; readonly turnId: string}
  | {readonly kind: 'debugRecord'; readonly data: ReadingDebugData}
  | {readonly kind: 'archive'; readonly sessionId: string}
  | {readonly kind: 'historyRequired'}
  | {readonly kind: 'snapshotRequired'; readonly contextSnapshotId: string}
  | {readonly kind: 'bootstrap'; readonly options: BootstrapOptions}
  | {readonly kind: 'rejected'; readonly message: string};

const unavailable = (reason: string): BootstrapOptions => ({defaultKind: 'fresh_paper', structuredHistory: null, unavailableReason: reason});

export function debugIdentity(turnId: string): string | string {
  const value = turnId.trim();
  return value === '' ? 'AI 阅读 turn ID 不能为空' : value;
}
export function archiveIdentity(sessionId: string): string {
  const value = sessionId.trim();
  return value === '' ? 'AI 阅读会话 ID 不能为空' : value;
}

export function debugRecord(row: ReadingDebugRow | null): ReadingDebugData | string {
  if (row === null) return '找不到 AI 阅读 turn';
  const parse = (value: string | null, message: string): unknown | string => {
    if (value === null) return null;
    try {return JSON.parse(value);} catch {return message;}
  };
  const rawRequest = parse(row.rawRequestJson, 'AI 阅读原始请求记录损坏');
  if (typeof rawRequest === 'string') return rawRequest;
  const rawResponse = parse(row.rawResponseJson, 'AI 阅读原始返回记录损坏');
  if (typeof rawResponse === 'string') return rawResponse;
  return {turnId: row.turnId, rawRequest, rawResponse};
}

export function unavailableForSources(statuses: readonly ReadingAttachmentStatus[]): BootstrapOptions | undefined {
  return statuses.some(status => status.parseStatus !== 'available') ? unavailable('当前 PDF 尚未完成结构化解析') : undefined;
}
export function workflowHasOverview(workflow: AnalysisWorkflow): boolean {
  return workflow.turns.some(turn => turn.kind === 'paper_overview' && turn.status === 'succeeded');
}
export function unavailableForWorkflow(workflow: AnalysisWorkflow | null): BootstrapOptions | undefined {
  if (workflow === null) return unavailable('尚无可复用的结构化阅读历史');
  return workflowHasOverview(workflow) ? undefined : unavailable('最近的结构化阅读尚未生成概要候选');
}
export function bootstrapOptions(workflow: AnalysisWorkflow, statuses: readonly ReadingAttachmentStatus[], attachments: readonly (readonly [string, string, string])[]): BootstrapOptions {
  const current = statuses.flatMap(status => status.parseRunId === null ? [] : [[status.attachmentId, status.contentSha256, status.parseRunId] as const]);
  if (JSON.stringify(current) !== JSON.stringify(attachments)) return unavailable('当前 PDF 或 Docling 解析版本已变化，请重新运行结构化阅读');
  return {defaultKind: 'structured_history', structuredHistory: {workflowId: workflow.id, workflowRevision: workflow.revision, workflowStatus: workflow.status,
    providerId: workflow.providerId, modelId: workflow.modelId, completedTurns: workflow.turns.filter(turn => turn.status === 'succeeded').map(turn => turn.kind),
    attachmentCount: statuses.length, updatedAt: workflow.updatedAt}, unavailableReason: null};
}

export function projectReadingHistory(input: ReadingHistoryInput): ReadingHistoryDecision {
  switch (input.kind) {
    case 'list': {
      const sessions: PaperAiReadingSessionSummary[] = [];
      for (const row of input.rows) {const summary = sessionSummary(row); if (typeof summary === 'string') return {kind: 'rejected', message: summary}; sessions.push(summary);}
      return {kind: 'list', sessions};
    }
    case 'session': {const summary = sessionSummary(input.summary); return typeof summary === 'string' ? {kind: 'rejected', message: summary} : {kind: 'session', session: {summary, turns: input.turns}};}
    case 'debugIdentity': {const value = debugIdentity(input.turnId); return value === 'AI 阅读 turn ID 不能为空' ? {kind: 'rejected', message: value} : {kind: 'debugIdentity', turnId: value};}
    case 'debugRecord': {const value = debugRecord(input.row); return typeof value === 'string' ? {kind: 'rejected', message: value} : {kind: 'debugRecord', data: value};}
    case 'archive': {const value = archiveIdentity(input.sessionId); return value === 'AI 阅读会话 ID 不能为空' ? {kind: 'rejected', message: value} : {kind: 'archive', sessionId: value};}
    case 'bootstrapSources': {const options = unavailableForSources(input.statuses); return options === undefined ? {kind: 'historyRequired'} : {kind: 'bootstrap', options};}
    case 'bootstrapHistory': {const options = unavailableForWorkflow(input.workflow); if (options !== undefined) return {kind: 'bootstrap', options}; return {kind: 'snapshotRequired', contextSnapshotId: input.workflow!.contextSnapshotId ?? ''};}
    case 'bootstrapSnapshot': return {kind: 'bootstrap', options: bootstrapOptions(input.workflow, input.statuses, input.attachments)};
  }
}
