import assert from 'node:assert/strict';
import {test} from 'node:test';
import {CAPABILITY_ID, FrameDecoder, decodeRequest, encodeResponse, PROTOCOL_VERSION} from './literature-trace-protocol.mts';

const digest = 'a'.repeat(64);
const instanceId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const requestId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const base = {protocolVersion: PROTOCOL_VERSION, pluginId: 'literature_library', packageKey: digest, instanceId, requestId};

test('literature trace protocol keeps request identity and capability response', () => {
  const request = decodeRequest(new TextEncoder().encode(JSON.stringify({...base, body: {kind: 'initialize'}})));
  assert.deepEqual(request.body, {kind: 'initialize'});
  const response = encodeResponse({...base, body: {kind: 'initialized', capability: CAPABILITY_ID, version: 1}});
  assert.match(new TextDecoder().decode(response), /literature\.note-trace-decision/u);
});

test('literature trace frame decoder accepts CRLF and retains incomplete frames', () => {
  const decoder = new FrameDecoder();
  assert.deepEqual(decoder.push(new TextEncoder().encode('{"a":1}\r')), []);
  assert.equal(decoder.push(new TextEncoder().encode('\n{"b":2}\n')).length, 2);
  assert.equal(decoder.empty, true);
});

test('literature trace protocol rejects a non-canonical envelope', () => {
  assert.throws(() => decodeRequest(new TextEncoder().encode(JSON.stringify({...base, instanceId: instanceId.toUpperCase(), body: {kind: 'initialize'}}))));
  assert.throws(() => decodeRequest(new TextEncoder().encode(JSON.stringify({...base, extra: true, body: {kind: 'initialize'}}))));
});
