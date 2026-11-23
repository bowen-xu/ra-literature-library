/** PDF import header and candidate preparation migrated from native/pdf_import.rs. */

export interface PdfImportCatalogDraft {
  readonly id: string | null; readonly itemType: string; readonly title: string; readonly abstractText: string;
  readonly issuedYear: number | null; readonly containerTitle: string; readonly conferenceName: string; readonly proceedingsTitle: string;
  readonly place: string; readonly volume: string; readonly issue: string; readonly pages: string; readonly doi: string; readonly url: string;
  readonly language: string; readonly bibtexKey: string; readonly rawBibtex: string | null; readonly creators: readonly unknown[];
  readonly tags: readonly string[]; readonly sourceKind: string | null;
}
export interface PdfImportCandidate {readonly path: string; readonly draft: PdfImportCatalogDraft}
export interface PreparedPdfImportEntry {readonly candidate: PdfImportCandidate; readonly inputLabel: string; readonly rawInput: string}
export type PdfImportHeaderPreparation = {readonly status: 'ready'; readonly entries: readonly PreparedPdfImportEntry[]} | {readonly status: 'rejected'; readonly candidates: readonly PdfImportCandidate[]; readonly reason: 'noFilesSelected'};
export interface DecodedPdfImportCandidate {readonly rawInput: string; readonly candidate: PdfImportCandidate}

export function validatePdfImportCandidates(candidates: readonly PdfImportCandidate[]): 'noFilesSelected' | null {return candidates.length === 0 ? 'noFilesSelected' : null;}
export function preparePdfImportEntry(candidate: PdfImportCandidate): PreparedPdfImportEntry {return {candidate, inputLabel: candidate.path, rawInput: JSON.stringify(candidate)};}
export function preparePdfImportHeader(candidates: readonly PdfImportCandidate[]): PdfImportHeaderPreparation {
  const reason = validatePdfImportCandidates(candidates); return reason === null ? {status: 'ready', entries: candidates.map(preparePdfImportEntry)} : {status: 'rejected', candidates, reason};
}
export function preparePdfImportDraft(draft: PdfImportCatalogDraft): PdfImportCatalogDraft {return {...draft, id: null};}

function defaultPdfDraft(path: string): PdfImportCatalogDraft {
  const name = path.split(/[\\/]/u).pop() ?? '', title = name.replace(/\.[^.]*$/u, '') || 'Untitled PDF';
  return {id: null, itemType: 'document', title, abstractText: '', issuedYear: null, containerTitle: '', conferenceName: '', proceedingsTitle: '', place: '', volume: '', issue: '', pages: '', doi: '', url: '', language: '', bibtexKey: '', rawBibtex: null, creators: [], tags: [], sourceKind: 'pdf_filename'};
}
function candidateFromUnknown(value: unknown): PdfImportCandidate | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>, draft = row.draft;
  return typeof row.path === 'string' && draft !== null && typeof draft === 'object' && !Array.isArray(draft) ? {path: row.path, draft: draft as PdfImportCatalogDraft} : null;
}
export function decodePdfImportCandidate(rawInput: string): DecodedPdfImportCandidate {
  let candidate: PdfImportCandidate | null = null;
  try {candidate = candidateFromUnknown(JSON.parse(rawInput));} catch {/* fall back to the path form below */}
  if (candidate === null) candidate = {path: rawInput, draft: defaultPdfDraft(rawInput)};
  return {rawInput, candidate: {...candidate, draft: preparePdfImportDraft(candidate.draft)}};
}
