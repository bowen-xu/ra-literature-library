import assert from 'node:assert/strict';
import test from 'node:test';
import {SOFT_PAPER_OWNERS, deletionOrder, prepareTrashCleanup, relations} from './trash-cleanup.mts';

test('trash cleanup preserves the explicit graph and emits deterministic relation ids', () => {
  const edges = relations();
  assert.equal(edges.length, 110);
  assert.deepEqual(edges[0], {
    child: 'agent_paper_analysis_bindings', parent: 'bibliographic_items', columns: [['paper_id', 'id']],
  });
  const preparation = prepareTrashCleanup();
  assert.equal(preparation.status, 'ready');
  if (preparation.status !== 'ready') return;
  assert.deepEqual(preparation.plan.softOwners, [...SOFT_PAPER_OWNERS]);
  assert.equal(preparation.plan.relations[0]?.id,
    'literature.trash-cleanup.collect-agent_paper_analysis_bindings-paper_id--bibliographic_items');
  assert.ok(!preparation.plan.deleteTables.includes('bibliographic_items'));
});

test('trash cleanup deletes children before parents and includes soft owners', () => {
  const order = deletionOrder();
  assert.notEqual(order, 'cycle');
  if (order === 'cycle') return;
  for (const edge of relations()) {
    const child = order.indexOf(edge.child), parent = order.indexOf(edge.parent);
    if (child >= 0 && parent >= 0) assert.ok(child < parent, `${edge.child} must precede ${edge.parent}`);
  }
  for (const table of SOFT_PAPER_OWNERS) assert.ok(order.includes(table));
});
