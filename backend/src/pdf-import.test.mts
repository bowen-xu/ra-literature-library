import assert from 'node:assert/strict';
import test from 'node:test';
import {decodePdfImportCandidate, preparePdfImportDraft, preparePdfImportHeader, type PdfImportCatalogDraft, type PdfImportCandidate} from './pdf-import.mts';

const draft = (id: string | null = 'old'): PdfImportCatalogDraft => ({id, itemType: 'document', title: 'Paper', abstractText: '', issuedYear: null, containerTitle: '', conferenceName: '', proceedingsTitle: '', place: '', volume: '', issue: '', pages: '', doi: '', url: '', language: '', bibtexKey: '', rawBibtex: null, creators: [], tags: [], sourceKind: 'manual'});
const candidate = (path = '/tmp/Paper.v1.pdf'): PdfImportCandidate => ({path, draft: draft()});

test('pdf import header preserves empty selection rejection and raw candidate labels', () => {
  assert.deepEqual(preparePdfImportHeader([]), {status: 'rejected', candidates: [], reason: 'noFilesSelected'});
  const value = candidate(), result = preparePdfImportHeader([value]);
  assert.deepEqual(result, {status: 'ready', entries: [{candidate: value, inputLabel: value.path, rawInput: JSON.stringify(value)}]});
  assert.deepEqual(preparePdfImportDraft(value.draft), {...value.draft, id: null});
});

test('pdf import candidate decoding preserves valid JSON and filename fallback drafts', () => {
  const value = candidate(), decoded = decodePdfImportCandidate(JSON.stringify(value));
  assert.deepEqual(decoded, {rawInput: JSON.stringify(value), candidate: {...value, draft: {...value.draft, id: null}}});
  const fallback = decodePdfImportCandidate('/tmp/Research.v1.pdf');
  assert.equal(fallback.candidate.path, '/tmp/Research.v1.pdf'); assert.equal(fallback.candidate.draft.title, 'Research.v1'); assert.equal(fallback.candidate.draft.sourceKind, 'pdf_filename');
  assert.equal(decodePdfImportCandidate('{bad').candidate.draft.title, '{bad');
});
