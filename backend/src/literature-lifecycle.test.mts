import assert from 'node:assert/strict';
import test from 'node:test';
import {prepareLifecycle} from './literature-lifecycle.mts';

test('lifecycle keeps non-trash requests and empty trash ids unchanged', () => {
  const requests = [
    {kind: 'archive', itemId: ''} as const,
    {kind: 'restore', itemId: ' '} as const,
    {kind: 'trash', itemId: 'a\\0b'} as const,
    {kind: 'restoreTrash', itemId: '中'} as const,
    {kind: 'setProjects', itemId: ' raw ', projectIds: ['b', 'a', 'b', '']} as const,
  ];
  for (const request of requests) {
    assert.deepEqual(prepareLifecycle(request), {status: 'ready', request, trashItemIds: []});
  }
});

test('lifecycle sorts and deduplicates trashMany ids like BTreeSet', () => {
  const request = {kind: 'trashMany', itemIds: ['b', 'a', 'b', '', '中']} as const;
  assert.deepEqual(prepareLifecycle(request), {
    status: 'ready',
    request,
    trashItemIds: ['', 'a', 'b', '中'],
  });
});

test('lifecycle rejects an empty trashMany request with the original error', () => {
  assert.deepEqual(prepareLifecycle({kind: 'trashMany', itemIds: []}), {
    status: 'rejected',
    error: {code: 'not_found', message: '部分文献已归档、删除或不存在，请刷新后重试'},
  });
});
