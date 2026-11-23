import assert from 'node:assert/strict';
import test from 'node:test';
import {MAX_EXPORT_RECORDS, prepareResearchExport, RESEARCH_EXPORT_DATASET_NAMES} from './research-export.mts';

const snapshot = () => ({applicationVersion: '0.7.6', exportedAt: '2026-11-13T00:00:00.000Z', datasets: RESEARCH_EXPORT_DATASET_NAMES.map(name => ({name, records: []}))});
test('preserves export manifest scope counts and reading markdown', () => {
  const source = snapshot();
  const rows = new Map(source.datasets.map(dataset => [dataset.name, dataset.records as unknown[]]));
  rows.get('claims')!.push({id: 'claim', statement: ' Claim Ω '}); rows.get('notePages')!.push({id: 'page', title: 'Reading document'}); rows.get('notePageBlocks')!.push({pageId: 'page', plainText: 'Reading note Ω'}); rows.get('readingNoteSources')!.push({pageId: 'page'}); rows.get('sourceAnchors')!.push({id: 'anchor', quoteExact: 'Quote Ω'});
  const result = prepareResearchExport({...source, datasets: source.datasets.map(dataset => ({...dataset, records: rows.get(dataset.name)! as never}))}); assert.equal('manifestJson' in result, true); if (!('manifestJson' in result)) return;
  const manifest = JSON.parse(result.manifestJson) as Record<string, unknown>; assert.equal(manifest.schemaVersion, 1); assert.equal(manifest.objectCount, 2); assert.equal(manifest.sourceCount, 1); assert.equal(manifest.recordCount, 5); assert.match(result.markdown, /Reading note Ω/u); assert.equal(result.objectCount, 2n);
});
test('rejects invalid dataset scope and record budgets', () => {const source = snapshot(); const invalid = prepareResearchExport({...source, datasets: [{...source.datasets[0]!, name: 'providerSettings'}, ...source.datasets.slice(1)]}); assert.deepEqual(invalid, {kind: 'invalidSnapshot'}); const large = prepareResearchExport({...source, datasets: source.datasets.map((dataset, index) => index === 0 ? {...dataset, records: Array.from({length: MAX_EXPORT_RECORDS + 1}, () => null)} : dataset)}); assert.deepEqual(large, {kind: 'tooLarge'});});
