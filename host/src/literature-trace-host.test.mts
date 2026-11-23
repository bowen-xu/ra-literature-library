import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {LiteratureTraceHost} from './literature-trace-host.mts';
import {createFileBackedCatalogHandler, FileBackedCatalogRuntime} from './catalog-runtime.mts';

const base = {protocolVersion: 2, pluginId: 'literature_library', packageKey: 'a'.repeat(64), instanceId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'};
const handlers = {async decideNoteTrace() {return {status: 'ready' as const, markSent: {expectedRows: 1, onMismatch: 'already_consumed' as const}};},
  async catalog(_operation: string, snapshot: any) {return snapshot;}};

test('literature host initializes, preserves identity and shuts down', async () => {
  const host = new LiteratureTraceHost();
  const init = await host.handle({...base, requestId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', body: {kind: 'initialize'}}, handlers);
  assert.equal(init.body.kind, 'initialized');
  const shutdown = await host.handle({...base, requestId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', body: {kind: 'shutdown'}}, handlers);
  assert.equal(shutdown.body.kind, 'shutdownComplete');
  await assert.rejects(() => host.handle({...base, requestId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', body: {kind: 'shutdown'}}, handlers));
});

test('literature host rejects a different package identity', async () => {
  const host = new LiteratureTraceHost();
  await host.handle({...base, requestId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', body: {kind: 'initialize'}}, handlers);
  await assert.rejects(() => host.handle({...base, packageKey: 'b'.repeat(64), requestId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', body: {kind: 'shutdown'}}, handlers), /identity/);
});

test('literature host composes the file-backed catalog handler end to end', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'literature-host-')), input = JSON.stringify({kind: 'trashMany', itemIds: ['b', 'a']}), requestId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  await writeFile(path.join(root, 'catalog-input.json'), input);
  const digest = createHash('sha256').update(input).digest('hex'), host = new LiteratureTraceHost(), runtime = new FileBackedCatalogRuntime(root), composed = {decideNoteTrace: handlers.decideNoteTrace, catalog: createFileBackedCatalogHandler(runtime)};
  await host.handle({...base, requestId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', body: {kind: 'initialize'}}, composed);
  const response = await host.handle({...base, requestId, body: {kind: 'catalog', operation: 'prepareLiteratureLifecycle', snapshot: {relativeHandle: 'catalog-input.json', byteSize: Buffer.byteLength(input), sha256: digest, packageKey: base.packageKey, instanceId: base.instanceId, requestId}}}, composed);
  assert.equal(response.body.kind, 'catalogResult'); if (response.body.kind === 'catalogResult') assert.equal(response.body.payload.relativeHandle, `catalog-result-${requestId}.json`);
});
