import assert from 'node:assert/strict';
import test from 'node:test';
import {digestSnapshot, evaluate, preview, type PaperContextRequest, type SnapshotDigestInput} from './paper-context-preview.mts';

const base = (): SnapshotDigestInput => ({contextSchemaVersion: 1, paperId: 'paper', attachments: [{attachmentId: 'attachment', contentSha256: 'a'.repeat(64), parseRunId: 'parse', ordinal: 0}], items: [{id: 'item', attachmentId: 'attachment', contentSha256: 'a'.repeat(64), parseRunId: 'parse', rawRef: 'raw', kind: 'text', label: null, pageIndex: 0, regions: [{pageIndex: 0, rect: {x: 0.1, y: 0.1, width: 0.2, height: 0.2}}], charspan: [0, 5], sourceTextHash: null, text: 'hello'}]});
const request = (snapshot: SnapshotDigestInput): PaperContextRequest => {const contextHash = digestSnapshot(snapshot); return {paperId: 'paper', snapshotId: `paper-context-${contextHash}`, expectedContextHash: contextHash};};

test('paper context preview validates headers and preflight budgets in order', () => {
  const snapshot = base(), request_ = request(snapshot);
  assert.deepEqual(evaluate({kind: 'header', request: request_, header: ['paper', request_.expectedContextHash, 1]}), {kind: 'validated'});
  assert.deepEqual(evaluate({kind: 'header', request: request_, header: null}), {kind: 'rejected', error: 'unavailable'});
  assert.deepEqual(evaluate({kind: 'header', request: request_, header: ['other', request_.expectedContextHash, 1]}), {kind: 'rejected', error: 'conflict'});
  assert.deepEqual(evaluate({kind: 'preflight', itemCount: 1, itemBytes: 1, invalidPageCount: 0, attachmentCount: 1, attachmentBytes: 1}), {kind: 'validated'});
  assert.deepEqual(evaluate({kind: 'preflight', itemCount: 1, itemBytes: 1, invalidPageCount: 1, attachmentCount: 1, attachmentBytes: 1}), {kind: 'rejected', error: 'corrupt'});
});

test('paper context preview retains source identities and rejects corrupt observations', () => {
  const snapshot = base(), request_ = request(snapshot), result = preview(request_, snapshot);
  assert.equal(typeof result, 'object');
  if (typeof result === 'object') {assert.equal(result.items[0]?.sourceId.startsWith('paper-source:'), true); assert.equal(result.contextHash, request_.expectedContextHash);}
  assert.equal(preview({...request_, expectedContextHash: 'b'.repeat(64)}, snapshot), 'corrupt');
  const invalid = structuredClone(snapshot); invalid.items[0]!.regions[0]!.rect.width = 2; assert.equal(preview(request_, invalid), 'corrupt');
  const duplicate = {...structuredClone(snapshot), items: [...snapshot.items, {...snapshot.items[0]!}]}; assert.equal(preview(request_, duplicate), 'corrupt');
});
