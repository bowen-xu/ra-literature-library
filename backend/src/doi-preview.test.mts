import assert from 'node:assert/strict';
import test from 'node:test';
import {decideDoiPreview} from './doi-preview.mts';
import {DOI_ACCEPT, DOI_RESPONSE_LIMIT, HTML_RESPONSE_LIMIT, finishDoi, prepareDoi, resolverError} from './doi-metadata.mts';
import type {DoiHttpErrorV1} from '../../../../ra-workbench-sdk/packages/workbench-backend-sdk/src/doi-metadata.js';

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

test('DOI publisher state follows the original required and unsolicited outcomes', () => {
  const chapter = prepareDoi(doi, 'application/json', JSON.stringify({type: 'book-chapter', title: 'Chapter'}));
  assert.throws(() => finishDoi(chapter, null), /DOI 出版商补充结果与准备状态不符/u);
  const journal = prepareDoi(doi, 'application/json', JSON.stringify({type: 'journal-article', title: 'Journal'}));
  assert.throws(() => finishDoi(journal, {kind: 'html', body: '', finalHttps: true}), /DOI 出版商补充结果与准备状态不符/u);
});

test('DOI fallback title and insecure publisher preserve warning order and raw envelope', () => {
  const prepared = prepareDoi(doi, 'not-a-dispatch-rule', JSON.stringify({type: 'unrecognized', title: ''}));
  const result = finishDoi(prepared, {kind: 'html', body: "<meta name='citation_conference_title' content='Ignored'>", finalHttps: false});
  assert.equal(result.draft.title, doi);
  assert.deepEqual(result.warnings, ['出版商页面不是 HTTPS，已保留 DOI 基础元数据', '文献类型缺少明确会议证据，请人工确认']);
  const raw = JSON.parse(result.rawPayload) as Record<string, unknown>;
  assert.equal(raw.adapter, 'csl-json'); assert.equal(raw.contentType, 'not-a-dispatch-rule'); assert.equal(raw.doiResponse, JSON.stringify({type: 'unrecognized', title: ''}));
  assert.deepEqual(raw.embeddedMetadata, {}); assert.deepEqual(raw.typeEvidence, []);
});

test('DOI publisher enrichment preserves base response and evidence', () => {
  const prepared = prepareDoi(doi, 'application/json', JSON.stringify({type: 'book-chapter', title: 'Chapter'}));
  const result = finishDoi(prepared, {kind: 'html', body: "<meta name='citation_conference_title' content='Conference &amp; Workshop'><meta name='citation_inbook_title' content='Proceedings'><meta name='citation_conference_location' content='Paris'>", finalHttps: true});
  assert.equal(result.draft.itemType, 'conferencePaper'); assert.equal(result.draft.conferenceName, 'Conference & Workshop'); assert.equal(result.draft.proceedingsTitle, 'Proceedings'); assert.equal(result.draft.place, 'Paris');
  const raw = JSON.parse(result.rawPayload) as Record<string, any>; assert.equal(raw.doiResponse, JSON.stringify({type: 'book-chapter', title: 'Chapter'})); assert.deepEqual(raw.typeEvidence, []);
});

test('DOI resolver error categories retain request and parse labels', () => {
  const cases: readonly [DoiHttpErrorV1, string][] = [
    [{kind: 'send', cause: 'send failed'}, '无法连接 DOI resolver：send failed'],
    [{kind: 'notFound'}, '没有找到 DOI 元数据，请检查 DOI 是否正确'],
    [{kind: 'status', status: 503, cause: 'status failed'}, 'DOI resolver 返回错误：status failed'],
    [{kind: 'tooLarge', status: 200}, 'DOI resolver 响应超过大小限制'],
    [{kind: 'read', status: 200, cause: 'body failed'}, '无法读取DOI resolver 响应：body failed'],
    [{kind: 'utf8', status: 200, cause: 'invalid utf8'}, 'DOI resolver 响应不是 UTF-8：invalid utf8'],
  ];
  for (const [error, message] of cases) assert.equal(resolverError(error).message, message);
});
