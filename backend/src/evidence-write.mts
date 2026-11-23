/** Manual claim/evidence relationship validation migrated from the native plugin. */

export type EvidenceWriteInput =
  | {readonly kind: 'claim'; readonly statement: string; readonly epistemicRole: string}
  | {readonly kind: 'stance'; readonly stance: string};

export type EvidenceWriteRejection =
  | {readonly kind: 'emptyStatement'}
  | {readonly kind: 'invalidEpistemicRole'; readonly value: string}
  | {readonly kind: 'invalidStance'; readonly value: string};

export interface EvidenceWriteDecision {readonly rejection: EvidenceWriteRejection | null}

const EPISTEMIC_ROLES = new Set(['assertion', 'source_paraphrase', 'synthesis', 'inference', 'hypothesis', 'question', 'working_note']);
const STANCES = new Set(['supports', 'opposes', 'context']);

export function decideEvidenceWrite(input: EvidenceWriteInput): EvidenceWriteDecision {
  if (input.kind === 'claim') {
    if (input.statement.length === 0) return {rejection: {kind: 'emptyStatement'}};
    if (!EPISTEMIC_ROLES.has(input.epistemicRole)) return {rejection: {kind: 'invalidEpistemicRole', value: input.epistemicRole}};
    return {rejection: null};
  }
  return STANCES.has(input.stance) ? {rejection: null} : {rejection: {kind: 'invalidStance', value: input.stance}};
}

export function evidenceWriteRejectionMessage(reason: EvidenceWriteRejection): string {
  if (reason.kind === 'emptyStatement') return '观点内容不能为空';
  return `${reason.kind === 'invalidEpistemicRole' ? '不支持的认识角色：' : '不支持的证据关系：'}${reason.value}`;
}

export function evidenceWriteMatchesDecision(input: EvidenceWriteInput, decision: EvidenceWriteDecision): boolean {
  const reason = decision.rejection;
  if (reason === null) return true;
  if (input.kind === 'claim') return reason.kind === 'emptyStatement'
    || (reason.kind === 'invalidEpistemicRole' && input.epistemicRole === reason.value);
  return reason.kind === 'invalidStance' && input.stance === reason.value;
}

export const EVIDENCE_READ_RESOURCE_FILES = [
  'evidence-read-claims.v1.sql',
  'evidence-read-source.v1.sql',
  'evidence-read-sources.v1.sql',
  'evidence-read-links.v1.sql',
] as const;
