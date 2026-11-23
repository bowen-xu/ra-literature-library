/** Evidence matrix validation migrated from the native plugin. */

export interface EvidenceMatrixDimension {readonly id: string; readonly label: string}
export interface EvidenceMatrixDraft {
  readonly id: string | null; readonly projectId: string; readonly title: string;
  readonly paperIds: readonly string[]; readonly dimensions: readonly EvidenceMatrixDimension[];
  readonly expectedRevision: bigint | null; readonly changeReason: string;
}
export interface EvidenceMatrix {
  readonly id: string; readonly projectId: string; readonly title: string;
  readonly paperIds: readonly string[]; readonly dimensions: readonly EvidenceMatrixDimension[];
  readonly revision: bigint; readonly createdAt: string; readonly updatedAt: string;
}
export interface EvidenceMatrixStatement {
  readonly id: string; readonly text: string; readonly epistemicRole: string;
  readonly evidenceAnchorIds: readonly string[];
}
export interface EvidenceMatrixCellDraft {
  readonly matrixId: string; readonly paperId: string; readonly dimensionId: string;
  readonly coverageState: string; readonly coverageNote: string;
  readonly statements: readonly EvidenceMatrixStatement[];
  readonly expectedRevision: bigint | null; readonly changeReason: string;
}
export type MatrixValidationInput =
  | {readonly kind: 'matrix'; readonly draft: EvidenceMatrixDraft}
  | {readonly kind: 'cell'; readonly draft: EvidenceMatrixCellDraft; readonly matrix: EvidenceMatrix}
  | {readonly kind: 'statement'; readonly statement: EvidenceMatrixStatement; readonly priorStatementIds: readonly string[]};
export type MatrixRejection = 'matrix' | 'cell' | 'statement';
export interface MatrixValidationDecision {readonly rejection: MatrixRejection | null}

export function decideEvidenceMatrix(input: MatrixValidationInput): MatrixValidationDecision {
  const rejection = input.kind === 'matrix' ? validateMatrix(input.draft)
    : input.kind === 'cell' ? validateCell(input.draft, input.matrix)
      : validateStatement(input.statement, input.priorStatementIds);
  return {rejection};
}

function validateMatrix(draft: EvidenceMatrixDraft): MatrixRejection | null {
  const paperIds = new Set(draft.paperIds), dimensionIds = new Set(draft.dimensions.map(item => item.id));
  if (draft.title.trim().length === 0 || [...draft.title].length > 240
    || draft.paperIds.length < 2 || draft.paperIds.length > 20 || paperIds.size !== draft.paperIds.length
    || draft.dimensions.length < 1 || draft.dimensions.length > 20 || dimensionIds.size !== draft.dimensions.length
    || draft.dimensions.some(item => utf8Length(item.id) === 0 || utf8Length(item.id) > 80 || item.label.trim().length === 0 || [...item.label].length > 120)
    || draft.changeReason.trim().length === 0 || utf8Length(draft.changeReason) > 120) return 'matrix';
  return null;
}

function validateCell(draft: EvidenceMatrixCellDraft, matrix: EvidenceMatrix): MatrixRejection | null {
  const inScope = matrix.paperIds.includes(draft.paperId) && matrix.dimensions.some(item => item.id === draft.dimensionId);
  const coverageValid = draft.coverageState === 'unreviewed' || draft.coverageState === 'not_found'
    ? draft.statements.length === 0 : draft.coverageState === 'populated' ? draft.statements.length > 0 : false;
  if (!inScope || !coverageValid || [...draft.coverageNote].length > 2_000 || draft.statements.length > 20
    || draft.changeReason.trim().length === 0 || utf8Length(draft.changeReason) > 120) return 'cell';
  return null;
}

function validateStatement(statement: EvidenceMatrixStatement, priorStatementIds: readonly string[]): MatrixRejection | null {
  const anchorIds = new Set(statement.evidenceAnchorIds);
  if (utf8Length(statement.id) === 0 || utf8Length(statement.id) > 80 || priorStatementIds.includes(statement.id)
    || statement.text.trim().length === 0 || [...statement.text].length > 4_000
    || !['source_paraphrase', 'synthesis', 'inference', 'hypothesis'].includes(statement.epistemicRole)
    || statement.evidenceAnchorIds.length < 1 || statement.evidenceAnchorIds.length > 8
    || anchorIds.size !== statement.evidenceAnchorIds.length) return 'statement';
  return null;
}

function utf8Length(value: string): number {return new TextEncoder().encode(value).length;}

export const EVIDENCE_MATRIX_RESOURCE_FILES = [
  'evidence-matrix-ids.v1.sql', 'evidence-matrix-cell-header.v1.sql', 'evidence-matrix-cell-keys.v1.sql',
  'evidence-matrix-insert.v1.sql', 'evidence-matrix-header.v1.sql', 'evidence-matrix-update.v1.sql',
  'evidence-matrix-revision.v1.sql', 'evidence-matrix-cell-insert.v1.sql', 'evidence-matrix-cell-update.v1.sql',
  'evidence-matrix-cell-revision.v1.sql', 'evidence-matrix-matrix.v1.sql', 'evidence-matrix-cell.v1.sql',
  'evidence-matrix-project-belongs.v1.sql', 'evidence-matrix-anchor-belongs.v1.sql',
] as const;
