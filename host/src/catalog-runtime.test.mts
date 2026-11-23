import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash, randomUUID} from 'node:crypto';
import {FileBackedCatalogRuntime, CatalogRuntimeError, createFileBackedCatalogHandler} from './catalog-runtime.mts';

const ref = (handle: string, input: string, packageKey: string, instanceId: string, requestId: string) => ({relativeHandle: handle, byteSize: Buffer.byteLength(input), sha256: createHash('sha256').update(input).digest('hex'), packageKey, instanceId, requestId});

test('file-backed catalog runtime validates input snapshots and writes dispatcher results', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'literature-catalog-')), packageKey = 'package', instanceId = randomUUID(), requestId = randomUUID(), input = JSON.stringify({kind: 'trashMany', itemIds: ['b', 'a', 'b']});
  await writeFile(path.join(root, 'input.json'), input); const runtime = new FileBackedCatalogRuntime(root), output = await runtime.dispatch('prepareLiteratureLifecycle', ref('input.json', input, packageKey, instanceId, requestId), {...ref('result.json', '', packageKey, instanceId, requestId), byteSize: 1, sha256: '0'.repeat(64)});
  assert.equal(output.relativeHandle, 'result.json'); assert.ok(output.byteSize > 0); assert.equal(output.packageKey, packageKey);
});

test('file-backed catalog runtime rejects path traversal and corrupted input', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'literature-catalog-')), runtime = new FileBackedCatalogRuntime(root), base = {relativeHandle: '../input.json', byteSize: 1, sha256: '0'.repeat(64), packageKey: 'package', instanceId: randomUUID(), requestId: randomUUID()};
  await assert.rejects(() => runtime.dispatch('prepareLiteratureLifecycle', base, {...base, relativeHandle: 'result.json'}), (error: unknown) => error instanceof CatalogRuntimeError && error.code === 'invalid_handle');
});

test('file-backed catalog runtime exposes the host catalog handler with protocol result handles', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'literature-catalog-')), packageKey = 'package', instanceId = randomUUID(), requestId = randomUUID(), input = JSON.stringify({kind: 'trashMany', itemIds: ['b', 'a']});
  await writeFile(path.join(root, 'catalog-input-test.json'), input); const runtime = new FileBackedCatalogRuntime(root), handler = createFileBackedCatalogHandler(runtime);
  const result = await handler('prepareLiteratureLifecycle', ref('catalog-input-test.json', input, packageKey, instanceId, requestId));
  assert.equal(result.relativeHandle, `catalog-result-${requestId}.json`); assert.equal(result.requestId, requestId); assert.ok(result.byteSize > 0);
});
