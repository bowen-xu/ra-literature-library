import assert from 'node:assert/strict';
import test from 'node:test';
import {planBibliographyCandidates, planCatalogQuery, projectCatalog, searchBibliography, selectCatalogIds, type CatalogItemRows, type CatalogSelectionRows, type DataRows, type DataValue} from './catalog.mts';

const text = (value: string): DataValue => ({kind: 'text', value});
const integer = (value: bigint | number): DataValue => ({kind: 'integer', value: BigInt(value)});
const nullValue = (): DataValue => ({kind: 'null', value: null});
const rows = (...values: DataValue[][]): DataRows => ({rows: values});
const ids = (...values: string[]): DataRows => ({rows: values.map(value => [text(value)])});

function itemRows(id: string): CatalogItemRows {
  return {
    main: rows([text(id), text('legacy-custom-kind'), text('Title'), text('Abstract'), integer(2026), text('Journal'), text('Conference'), text('Proceedings'), text('Place'), text('7'), text('2'), text('3–8'), text('10.example/id'), text('https://example.invalid'), text(' zh '), text('key'), nullValue(), text('legacy-status'), text('created'), text('updated'), nullValue()]),
    related: {
      creators: rows([text('Family'), text('Given'), text(''), text('translator')]),
      tags: ids('b', 'A'),
      attachments: rows([text('attachment'), text('PDF'), text('application/pdf'), integer(7), text('hash')]),
      projectIds: ids('project-z', 'project-a'),
      metadataSources: rows([text('abstractText'), text('import'), integer(1)]),
    },
  };
}

test('catalog query planning preserves blank, Unicode, quote and i32 rules', () => {
  assert.deepEqual(planCatalogQuery({kind: 'list', query: ' \n\t'}), {kind: 'all'});
  assert.deepEqual(planCatalogQuery({kind: 'get', id: ' raw\0 id '}), {kind: 'get', id: ' raw\0 id '});
  assert.deepEqual(planCatalogQuery({kind: 'list', query: ' A"B '}), {kind: 'search', ftsQuery: '{title creators} : "a""b"*', year: null});
  const bounded = planCatalogQuery({kind: 'list', query: ' +002026 '});
  const overflow = planCatalogQuery({kind: 'list', query: '2147483648'});
  assert.equal(bounded.kind, 'search');
  assert.equal(overflow.kind, 'search');
  if (bounded.kind === 'search' && overflow.kind === 'search') {
    assert.equal(bounded.year, 2026);
    assert.equal(overflow.year, null);
  }
});

test('catalog selection keeps primary duplicates and only deduplicates year additions', () => {
  const selection: CatalogSelectionRows = {primary: ids('rank-first', 'rank-second', 'rank-first', ''), year: ids('rank-second', 'year-first', 'year-first', 'year-second')};
  assert.deepEqual(selectCatalogIds(selection), ['rank-first', 'rank-second', 'rank-first', '', 'year-first', 'year-second']);
  assert.throws(() => selectCatalogIds({primary: rows([integer(1)]), year: null}), /primary/);
});

test('catalog projection preserves related values, empty results, not-found priority and identity checks', () => {
  const projected = projectCatalog({request: {kind: 'get', id: 'item'}, items: [itemRows('item')]});
  assert.equal(projected.kind, 'success');
  if (projected.kind === 'success') {
    assert.equal(projected.items[0]?.id, 'item');
    assert.equal(projected.items[0]?.attachments[0]?.byteSize, 7n);
    assert.equal(projected.items[0]?.metadataSources[0]?.confirmedByUser, true);
  }
  assert.deepEqual(projectCatalog({request: {kind: 'list', query: null}, items: []}), {kind: 'success', items: []});
  const absent: CatalogItemRows = {main: rows(), related: null};
  assert.deepEqual(projectCatalog({request: {kind: 'list', query: null}, items: [absent, {main: rows([]), related: null}]}), {kind: 'notFound'});
  assert.throws(() => projectCatalog({request: {kind: 'get', id: 'item'}, items: [itemRows('other')]}), /another item identity/);
  assert.throws(() => projectCatalog({request: {kind: 'get', id: 'item'}, items: []}), /one captured item/);
});

test('bibliography search and candidate planning preserve original branch decisions', () => {
  assert.deepEqual(searchBibliography({phase: 'prepare', query: '  X%_中文  '}), {kind: 'needle', needle: '%x%_中文%'});
  assert.deepEqual(searchBibliography({phase: 'project', rows: rows([text('id'), text('Title'), nullValue(), text('Venue'), text('Key'), text('Author'), integer(1), integer(0), nullValue()])}), {kind: 'hits', hits: [{literatureItemId: 'id', title: 'Title', issuedYear: null, containerTitle: 'Venue', importedKey: 'Key', firstAuthor: 'Author', hasPdf: true, hasEvidence: false, citationKey: null}]});
  assert.deepEqual(planBibliographyCandidates({doi: '', title: 'Title', primary: null, fallback: null}), {kind: 'query', query: 'title', parameter: 'Title'});
  assert.deepEqual(planBibliographyCandidates({doi: 'doi', title: 'Title', primary: [], fallback: ['fallback']}), {kind: 'ready', ids: ['fallback'], exactDoi: false});
  assert.deepEqual(planBibliographyCandidates({doi: 'doi', title: 'Title', primary: ['primary'], fallback: null}), {kind: 'ready', ids: ['primary'], exactDoi: true});
});
