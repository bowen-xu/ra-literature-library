/** Pure NAL annotation identity and link preparation migrated from the native plugin. */

export interface NalAnnotation {
  readonly id: string;
  readonly targetKind: string;
  readonly targetId: string;
  readonly notePageId: string;
}

export interface NalAnnotationRequest {
  readonly targetKind: string;
  readonly targetId: string;
  readonly title: string;
}

export interface NalAnnotationSnapshot {
  readonly annotations: readonly NalAnnotation[];
  readonly targetExists: boolean;
}

export type NalAnnotationPlan =
  | {readonly kind: 'existing'; readonly annotation: NalAnnotation}
  | {readonly kind: 'create'; readonly targetKind: string; readonly targetId: string; readonly title: string};

export type NalAnnotationError = 'invalidRequest' | 'targetMissing';

export type NalAnnotationBeforeLoadRejection = 'invalidAnnotationId';
export type NalAnnotationAfterLoadRejection = 'identityConflict' | 'targetConflict';

export type NalAnnotationLinkTarget =
  | {readonly kind: 'concept'; readonly id: string}
  | {readonly kind: 'statement'; readonly id: string}
  | {readonly kind: 'invalidTargetKind'};

export type NalAnnotationLinkPreparation =
  | {readonly kind: 'rejectedBeforeLoad'; readonly reason: NalAnnotationBeforeLoadRejection}
  | {readonly kind: 'afterLoadRejected'; readonly annotations: readonly NalAnnotation[]; readonly reason: NalAnnotationAfterLoadRejection}
  | {readonly kind: 'readActive'; readonly annotations: readonly NalAnnotation[]; readonly target: NalAnnotationLinkTarget};

export function validateNalAnnotationRequest(request: NalAnnotationRequest): NalAnnotationError | null {
  if (!['concept', 'statement'].includes(request.targetKind)
    || request.targetId.trim().length === 0
    || request.targetId.length > 200
    || request.title.trim().length === 0
    || [...request.title].length > 300) return 'invalidRequest';
  return null;
}

export function planNalAnnotation(request: NalAnnotationRequest, snapshot: NalAnnotationSnapshot): NalAnnotationPlan | NalAnnotationError {
  const invalid = validateNalAnnotationRequest(request);
  if (invalid !== null) return invalid;
  const existing = snapshot.annotations.find(annotation =>
    annotation.targetKind === request.targetKind && annotation.targetId === request.targetId);
  if (existing !== undefined) return {kind: 'existing', annotation: existing};
  if (!snapshot.targetExists) return 'targetMissing';
  return {kind: 'create', targetKind: request.targetKind, targetId: request.targetId, title: request.title};
}

export function validateNalAnnotationLinkId(annotation: NalAnnotation): NalAnnotationBeforeLoadRejection | null {
  return annotation.id.trim().length === 0 || annotation.id.length > 200 ? 'invalidAnnotationId' : null;
}

export function prepareNalAnnotationLink(annotation: NalAnnotation, annotations: readonly NalAnnotation[]): NalAnnotationLinkPreparation {
  const invalid = validateNalAnnotationLinkId(annotation);
  if (invalid !== null) return {kind: 'rejectedBeforeLoad', reason: invalid};
  const current = annotations.find(value => value.id === annotation.id);
  const reason: NalAnnotationAfterLoadRejection | null = current !== undefined && !sameAnnotation(current, annotation)
    ? 'identityConflict'
    : annotations.some(value => value.targetKind === annotation.targetKind
      && value.targetId === annotation.targetId
      && value.notePageId !== annotation.notePageId) ? 'targetConflict' : null;
  if (reason !== null) return {kind: 'afterLoadRejected', annotations: [...annotations], reason};
  const target: NalAnnotationLinkTarget = annotation.targetKind === 'concept'
    ? {kind: 'concept', id: annotation.targetId}
    : annotation.targetKind === 'statement'
      ? {kind: 'statement', id: annotation.targetId}
      : {kind: 'invalidTargetKind'};
  return {kind: 'readActive', annotations: [...annotations], target};
}

function sameAnnotation(left: NalAnnotation, right: NalAnnotation): boolean {
  return left.id === right.id && left.targetKind === right.targetKind
    && left.targetId === right.targetId && left.notePageId === right.notePageId;
}
