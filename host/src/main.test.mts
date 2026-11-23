import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {test} from 'node:test';
import path from 'node:path';

test('standalone Node host initializes and shuts down through the framed protocol', async t => {
  const child = spawn(process.execPath, ['--experimental-strip-types', path.join(process.cwd(), 'host/src/main.mts')], {stdio: ['pipe', 'pipe', 'pipe']});
  t.after(() => {if (child.exitCode === null) child.kill('SIGTERM');});
  let buffer = '';
  const next = (): Promise<{readonly body: {readonly kind: string}}> => new Promise((resolve, reject) => {
    const onData = (chunk: Buffer) => {
      buffer += chunk.toString('utf8'); const index = buffer.indexOf('\n');
      if (index < 0) return;
      const line = buffer.slice(0, index); buffer = buffer.slice(index + 1); child.stdout.off('data', onData);
      try {resolve(JSON.parse(line) as {readonly body: {readonly kind: string}});} catch (cause) {reject(cause);}
    };
    child.stdout.on('data', onData); child.once('error', reject);
  });
  const base = {protocolVersion: 2, pluginId: 'literature_library', packageKey: 'a'.repeat(64), instanceId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'};
  child.stdin.write(JSON.stringify({...base, requestId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', body: {kind: 'initialize'}}) + '\n');
  assert.equal((await next()).body.kind, 'initialized');
  child.stdin.write(JSON.stringify({...base, requestId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', body: {kind: 'shutdown'}}) + '\n');
  assert.equal((await next()).body.kind, 'shutdownComplete');
  await new Promise<void>((resolve, reject) => {child.once('exit', code => code === 0 ? resolve() : reject(new Error(`host exit ${code}`)));});
});
