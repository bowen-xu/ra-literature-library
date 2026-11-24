import assert from 'node:assert/strict';
import test from 'node:test';
import {decideDoiPreview} from './doi-preview.mts';
import {DOI_ACCEPT, DOI_RESPONSE_LIMIT, HTML_RESPONSE_LIMIT} from './doi-metadata.mts';

const doi = '10.1000/example';
const body = (body: string, finalHttps = true) => ({Ok: {contentType: 'application/json', body, finalHttps}});

test('DOI start preserves the original validation and import finish policy', () => {
  assert.deepEqual(decideDoiPreview({kind: 'start', rawInput: ' \n', normalizedDoi: doi}), {status: 'rejected', code: 'invalid_input', message: 'DOI 不能为空'});
  assert.deepEqual(decideDoiPreview({kind: 'start', rawInput: 'not a DOI', normalizedDoi: null}), {status: 'rejected', code: 'invalid_input', message: '未识别到有效 DOI，请检查输入内容'});
  assert.deepEqual(decideDoiPreview({kind: 'start', rawInput: doi, normalizedDoi: doi}), {status: 'started', normalizedDoi: doi, sourceKind: 'doi', finishStates: {noFailed: 'completed', noImported: 'failed', mixed: 'completed_with_errors'}, resolverAccept: DOI_ACCEPT, publisherAccept: 'text/html,application/xhtml+xml', resolverLimit: BigInt(DOI_RESPONSE_LIMIT), publisherLimit: BigInt(HTML_RESPONSE_LIMIT)});
});

test('CSL translation preserves draft fields, creators, tags and audit payload', () => {
  const raw = JSON.stringify({type: 'journal-article', title: ' A &amp; B ', abstract: '<p>Abstract</p>', issued: {'date-parts': [[2026]]}, 'container-title': 'Journal', 'event-title': 'Conference', 'event-place': 'Place', volume: '7', issue: '2', page: '3–8', URL: 'https://example.invalid', language: 'zh', author: [{family: 'Family', given: 'Given'}], editor: [{literal: 'Editor'}], keyword: 'a; b, a'});
  const result = decideDoiPreview({kind: 'translate', normalizedDoi: doi, resolver: body(raw), publisher: null});
  assert.equal(result.status, 'translated');
  if (result.status !== 'translated') return;
  assert.equal(result.translation.draft.title, 'A & B');
  assert.equal(result.translation.draft.itemType, 'journalArticle');
  assert.deepEqual(result.translation.draft.creators, [{familyName: 'Family', givenName: 'Given', literalName: '', role: 'author'}, {familyName: '', givenName: '', literalName: 'Editor', role: 'editor'}]);
  assert.deepEqual(result.translation.draft.tags, ['a', 'b', 'a']);
  assert.equal(JSON.parse(result.translation.rawPayload).doiResponse, raw);
});

test('book sections request publisher enrichment once and retain embedded conference metadata', () => {
  const base = decideDoiPreview({kind: 'translate', normalizedDoi: doi, resolver: body(JSON.stringify({type: 'book-chapter', title: 'Chapter'})), publisher: null});
  assert.deepEqual(base, {status: 'needsPublisher'});
  const result = decideDoiPreview({kind: 'translate', normalizedDoi: doi, resolver: body(JSON.stringify({type: 'book-chapter', title: 'Chapter'})), publisher: body("<meta name='citation_conference_title' content='Actual Conference'>", true)});
  assert.equal(result.status, 'translated');
  if (result.status !== 'translated') return;
  assert.equal(result.translation.draft.itemType, 'conferencePaper');
  assert.equal(result.translation.draft.conferenceName, 'Actual Conference');
  assert.equal(JSON.parse(result.translation.rawPayload).embeddedMetadata.citation_conference_title, 'Actual Conference');
});

test('resolver errors retain connector prefix', () => {
  const result = decideDoiPreview({kind: 'translate', normalizedDoi: doi, resolver: {Err: {kind: 'status', status: 503, cause: 'safe status'}}, publisher: null});
  assert.deepEqual(result, {status: 'rejected', code: 'connector_error', message: 'DOI 元数据请求失败：DOI resolver 返回错误：safe status'});
});
