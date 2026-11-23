/** Derived-view validation and provenance decisions migrated from native/derived_view.rs. */

export interface DerivedViewInputRef {readonly objectKind: string; readonly objectId: string; readonly objectRevision: bigint; readonly selectionReason: string}
export interface DerivedViewItem {readonly id: string; readonly text: string; readonly epistemicRole: string; readonly evidenceAnchorIds: readonly string[]; readonly hasConflict: boolean}
export interface DerivedResearchViewDraft {readonly id: string | null; readonly projectId: string; readonly viewKind: string; readonly title: string; readonly scopeNote: string; readonly inputs: readonly DerivedViewInputRef[]; readonly items: readonly DerivedViewItem[]; readonly reviewState: string; readonly expectedRevision: bigint | null; readonly changeReason: string}
export interface DerivedEvidenceMatrixCellSnapshot {readonly coverageState: string}
export type DerivedValidationInput =
  | {readonly kind: 'provenance'; readonly provenanceKind: string}
  | {readonly kind: 'header'; readonly draft: DerivedResearchViewDraft}
  | {readonly kind: 'input'; readonly ordinal: bigint; readonly input: DerivedViewInputRef}
  | {readonly kind: 'coverage'; readonly ordinal: bigint; readonly snapshot: DerivedEvidenceMatrixCellSnapshot}
  | {readonly kind: 'item'; readonly ordinal: bigint; readonly viewKind: string; readonly item: DerivedViewItem; readonly allowedAnchors: readonly string[]};
export type DerivedViewInput = {readonly kind: 'validate'; readonly input: DerivedValidationInput} | {readonly kind: 'provenance'; readonly current: string; readonly review: string};
export type DerivedRejection = 'header' | 'input' | 'coverage' | 'item' | 'provenance';
export type DerivedViewDecision = {readonly kind: 'validated'; readonly rejection: DerivedRejection | null} | {readonly kind: 'provenance'; readonly value: string};

const viewKinds = ['taxonomy', 'historical_context', 'gap_hypothesis', 'innovation_hypothesis'];
const reviewStates = ['unreviewed', 'accepted', 'rejected', 'deferred'];
const roles = ['synthesis', 'inference', 'hypothesis'];
const size = (value: string): number => [...value].length;
const invalid = (kind: DerivedRejection): DerivedRejection => kind;

export function nextDerivedProvenance(current: string, review: string): string {return current === 'ai_suggestion' && review === 'accepted' ? 'ai_accepted_after_edit' : current;}

export function validateDerived(input: DerivedValidationInput): DerivedRejection | null {
  switch (input.kind) {
    case 'provenance': return input.provenanceKind === 'ai_suggestion' || input.provenanceKind === 'ai_accepted_after_edit' ? null : invalid('provenance');
    case 'header': {
      const draft = input.draft, inputIds = new Set(draft.inputs.map(value => value.objectId)), itemIds = new Set(draft.items.map(value => value.id));
      return viewKinds.includes(draft.viewKind) && draft.title.trim() !== '' && size(draft.title) <= 240 && size(draft.scopeNote) <= 4000
        && draft.inputs.length >= 1 && draft.inputs.length <= 100 && inputIds.size === draft.inputs.length
        && draft.items.length >= 1 && draft.items.length <= 100 && itemIds.size === draft.items.length
        && reviewStates.includes(draft.reviewState) && draft.changeReason.trim() !== '' && draft.changeReason.length <= 120 ? null : invalid('header');
    }
    case 'input': return input.input.objectKind === 'matrix_cell' && input.input.objectRevision >= 1n && size(input.input.selectionReason) <= 500 ? null : invalid('input');
    case 'coverage': return input.snapshot.coverageState === 'populated' ? null : invalid('coverage');
    case 'item': {
      const item = input.item, allowed = new Set(input.allowedAnchors), anchors = new Set(item.evidenceAnchorIds), hypothesis = input.viewKind === 'gap_hypothesis' || input.viewKind === 'innovation_hypothesis';
      return item.id !== '' && item.id.length <= 80 && item.text.trim() !== '' && size(item.text) <= 4000 && roles.includes(item.epistemicRole)
        && (!hypothesis || item.epistemicRole === 'hypothesis') && item.evidenceAnchorIds.length >= 1 && item.evidenceAnchorIds.length <= 16
        && anchors.size === item.evidenceAnchorIds.length && item.evidenceAnchorIds.every(anchor => allowed.has(anchor)) ? null : invalid('item');
    }
  }
}

export function decideDerivedView(input: DerivedViewInput): DerivedViewDecision {
  if (input.kind === 'provenance') return {kind: 'provenance', value: nextDerivedProvenance(input.current, input.review)};
  return {kind: 'validated', rejection: validateDerived(input.input)};
}
