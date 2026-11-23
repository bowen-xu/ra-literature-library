import assert from 'node:assert/strict';
import test from 'node:test';
import {contextForDoclingItem, evidenceRow, quoteForDoclingItem, validateDoclingAnalysisSources, validateAnalysisStart} from './docling-evidence.mts';
import type {ContextItem} from './paper-context-preview.mts';

const item = (overrides: Partial<ContextItem> = {}): ContextItem => ({id: 'item', attachmentId: 'attachment', contentSha256: 'a'.repeat(64), parseRunId: 'parse', rawRef: 'raw', kind: 'text', label: 'Label', pageIndex: 1, regions: [{pageIndex: 1, rect: {x: 0, y: 0, width: 0.5, height: 0.5}}, {pageIndex: 2, rect: {x: 0, y: 0, width: 0.2, height: 0.2}}], charspan: null, sourceTextHash: null, text: 'Text', ...overrides});

test('Docling evidence rows preserve quote/context precedence and first-page regions', () => {
  const value = item(), row = evidenceRow('run', value); assert.equal(row?.anchorId, 'docling:run:item'); assert.equal(row?.pageLabel, '2'); assert.equal(JSON.parse(row!.rectsJson).length, 1); assert.equal(quoteForDoclingItem(value), 'Text'); assert.match(contextForDoclingItem(value), /label=Label/);
  assert.equal(evidenceRow('run', item({pageIndex: null, regions: []})), null);
  assert.equal(quoteForDoclingItem(item({text: null, label: null, tableJson: {a: 1}})), '{"a":1}');
});

test('Docling analysis validation keeps source and start limits', () => {
  assert.equal(validateAnalysisStart(0, false), '阅读框架尚未确认，无法启动 AI 提取'); assert.equal(validateAnalysisStart(0, true), null);
  assert.equal(validateDoclingAnalysisSources(['available'], 128), null); assert.match(validateDoclingAnalysisSources(['available'], 129)!, /超过本轮上限 128/); assert.match(validateDoclingAnalysisSources(['pending'], 0)!, /尚未完成/);
});
