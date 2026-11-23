import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BROWSER_CAPTURE_RESOURCE_FILES,
  MAX_METADATA_BYTES,
  MAX_PDF_BYTES,
  decodedTitle,
  digest,
  identifier,
  prepareBrowserCapture,
  validateScope,
} from './browser-capture.mts';

const payload = (): any => ({sessionID: 'capture', uri: 'https://example.org/paper', translatorID: 'fixture', translatorVersion: '1', items: [{id: 18446744073709551615n, itemType: 'journalArticle', title: '  Ω Paper  ', DOI: '10.1234/example', date: '2026-11-13', publicationTitle: 'Fixture Journal', ISBN: '978-1 234', creators: [{name: 'Fixture Consortium', creatorType: 'contributor'}], tags: [{tag: 'Tag'}, {tag: 'TAG'}], extra: 'Retain original'}]});
const pdf = () => ({byteSize: 42, startsWithPdf: true, sha256: 'b'.repeat(64)});
const metadata = () => ({id: 'pdf', parentItemID: 'parent', title: '=?UTF-8?Q?Full_Text_=CE=A9?=', url: 'https://example.org/p.pdf', contentType: 'application/pdf'});

test('browser capture preserves raw metadata, identifiers, provenance and catalog projection', () => {
  const raw = payload(), result = prepareBrowserCapture({kind: 'items', scope: 'receiver', payload: raw, doi: [{display: '10.1234/example', normalized: '10.1234/example'}]});
  assert.equal(result.kind, 'capture');
  if (result.kind !== 'capture') return;
  const item = result.plan.items[0]!;
  assert.equal(item.raw, raw.items[0]);
  assert.equal(item.receipt.title, 'Ω Paper');
  assert.deepEqual(item.receipt.warnings, []);
  assert.deepEqual(item.sourceReference, {captureSessionID: 'capture', externalItemID: '18446744073709551615', uri: 'https://example.org/paper', translatorID: 'fixture', translatorVersion: '1'});
  assert.equal(item.save.kind, 'planned');
  if (item.save.kind === 'planned') {assert.equal(item.save.plan.item.issuedYear, 2026); assert.equal(item.save.plan.creators[0]?.literalName, 'Fixture Consortium'); assert.deepEqual(item.save.plan.tags, ['Tag']);}
  assert.deepEqual(item.identifiers[0], {kind: 'isbn', normalized: '9781234', display: '978-1 234'});
});

test('browser capture warns for unsupported item types and defers malformed identifiers', () => {
  const raw = payload(); raw.items[0]!.itemType = 'future-type'; raw.items[0]!.ISBN = 17; raw.items[0]!.ISSN = '123-4';
  const result = prepareBrowserCapture({kind: 'items', scope: 'receiver', payload: raw, doi: [{display: '', normalized: ''}]});
  assert.equal(result.kind, 'capture');
  if (result.kind !== 'capture') return;
  const item = result.plan.items[0]!; assert.equal(item.receipt.itemType, 'document'); assert.equal((item.receipt.warnings[0] as any).originalItemType, 'future-type'); assert.equal(item.identifiers[0], 'invalidInput'); assert.deepEqual(item.identifiers[1], {kind: 'issn', normalized: '1234', display: '123-4'});
});

test('browser capture rejects duplicate identities, credentials and metadata limits', () => {
  const raw = payload(); raw.items.push(raw.items[0]!);
  assert.equal(prepareBrowserCapture({kind: 'items', scope: 'receiver', payload: raw, doi: [{display: '', normalized: ''}, {display: '', normalized: ''}]}).kind, 'rejected');
  const credential = payload(); credential.items[0]!.extra = {nested: {request_headers: {cookie: 'synthetic'}}};
  assert.deepEqual(prepareBrowserCapture({kind: 'items', scope: 'receiver', payload: credential, doi: [{display: '', normalized: ''}]}), {kind: 'rejected', reason: 'invalidInput'});
  const large = payload(); large.items[0]!.extra = 'x'.repeat(MAX_METADATA_BYTES); assert.deepEqual(prepareBrowserCapture({kind: 'items', scope: 'receiver', payload: large, doi: [{display: '', normalized: ''}]}), {kind: 'rejected', reason: 'invalidInput'});
});

test('browser capture preserves PDF title decoding, hashes and standalone semantics', () => {
  const attachment = prepareBrowserCapture({kind: 'attachment', scope: 'receiver', sessionId: 'capture', metadata: metadata(), pdf: pdf()});
  assert.equal(attachment.kind, 'attachment'); if (attachment.kind === 'attachment') {assert.equal(attachment.plan.displayName, 'Full Text Ω'); assert.equal(attachment.plan.requestSha256, digest(`${JSON.stringify(metadata())}:${'b'.repeat(64)}`));}
  const standalone = prepareBrowserCapture({kind: 'standalone', scope: 'receiver', sessionId: 'standalone', metadata: metadata(), pdf: pdf()}); assert.equal(standalone.kind, 'standalone'); if (standalone.kind === 'standalone') {assert.equal((standalone.plan.raw as any).metadataPending, true); assert.equal(standalone.plan.attachment.externalId, 'standalone');}
  assert.equal(decodedTitle({title: '=?utf-8?b?zqk=?='}), 'Ω'); assert.throws(() => decodedTitle({title: '=?utf-8?q?=GG?='}));
  assert.deepEqual(prepareBrowserCapture({kind: 'attachment', scope: 'receiver', sessionId: 'capture', metadata: metadata(), pdf: {...pdf(), byteSize: MAX_PDF_BYTES + 1}}), {kind: 'rejected', reason: 'invalidInput'});
});

test('browser capture keeps session capability and resource boundaries', () => {
  assert.deepEqual(prepareBrowserCapture({kind: 'updateSession', scope: '', payload: {sessionID: 'capture', target: 'other'}}), {kind: 'rejected', reason: 'unsupported'});
  assert.deepEqual(prepareBrowserCapture({kind: 'recognizedItem', scope: '', payload: {sessionID: 'capture'}}), {kind: 'rejected', reason: 'invalidInput'});
  assert.deepEqual(prepareBrowserCapture({kind: 'recognizedItem', scope: 'receiver', payload: {sessionID: 'capture'}}), {kind: 'session', sessionId: 'capture', projection: 'null'});
  assert.deepEqual(prepareBrowserCapture({kind: 'snapshot', scope: '', payload: {pdf: true, cookies: 'synthetic'}}), {kind: 'rejected', reason: 'unsupported'});
  assert.equal((prepareBrowserCapture({kind: 'selectedLibrary'}).kind), 'value'); assert.equal((prepareBrowserCapture({kind: 'attachmentResolvers'}).kind), 'value'); assert.equal(BROWSER_CAPTURE_RESOURCE_FILES.length, 12);
  assert.equal(identifier(-1), '-1'); assert.throws(() => identifier(true)); assert.throws(() => validateScope('Ω'));
});
