import assert from 'node:assert/strict';
import test from 'node:test';
import {imageIdentity, imageSet, projectPaperContextSnapshot, snapshotReady, type SnapshotProjectionInput} from './paper-context-snapshot.mts';

const input = (): SnapshotProjectionInput => ({paperId: 'paper', attachmentStatuses: [{attachmentId: 'attachment', displayName: 'Paper.pdf', contentSha256: 'a'.repeat(64), parseRunId: 'parse', parseStatus: 'available'}], contextItems: [{id: 'item', attachmentId: 'attachment', contentSha256: 'a'.repeat(64), parseRunId: 'parse', rawRef: 'raw', kind: 'picture', label: null, pageIndex: 0, regions: [], charspan: null, sourceTextHash: null, text: null}], imageHashes: {item: 'b'.repeat(64)}});

test('paper context snapshot projects available Docling attachments and stable item order', () => {
  const result = projectPaperContextSnapshot(input()); assert.equal(typeof result, 'object'); if (typeof result === 'object') {assert.equal(result.contextSchemaVersion, 1); assert.equal(result.attachments[0]?.ordinal, 0); assert.equal(result.items[0]?.imageContentSha256, 'b'.repeat(64)); assert.equal(result.snapshotId, `paper-context-${result.contextHash}`);}
  assert.equal(snapshotReady(input().attachmentStatuses), true);
  assert.equal(snapshotReady([{...input().attachmentStatuses[0]!, parseStatus: 'pending'}]), false);
});

test('paper context snapshot preserves screenshot identity and set rules', () => {
  assert.equal(imageIdentity('item', ['item']), '图片截图包含重复结构化块 ID'); assert.equal(imageIdentity('item', []), null);
  assert.equal(imageSet(['a'], ['b']), '缺少结构化图片块 a 的截图'); assert.equal(imageSet(['a'], ['a']), null); assert.equal(imageSet(['a'], []), '图片截图数量与 Docling picture 结构块不一致');
});
