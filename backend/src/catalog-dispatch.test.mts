import assert from 'node:assert/strict';
import test from 'node:test';
import {dispatchCatalog} from './catalog-dispatch.mts';

test('catalog dispatcher routes migrated operations and echoes the input', () => {
  const input = {kind: 'trashMany', itemIds: ['b', 'a', 'b']};
  const result = dispatchCatalog({operation: 'prepareLiteratureLifecycle', input});
  assert.equal(result.operation, 'prepareLiteratureLifecycle'); assert.deepEqual(result.input, input); assert.deepEqual(result.result, {status: 'ready', request: input, trashItemIds: ['a', 'b']});
  const evidence = dispatchCatalog({operation: 'validateEvidenceWrite', input: {kind: 'stance', stance: 'supports'}}); assert.deepEqual(evidence.result, {rejection: null});
});

test('catalog dispatcher rejects unknown and not-yet-migrated operations explicitly', () => {
  assert.throws(() => dispatchCatalog({operation: 'unknown', input: {}}), /literature_catalog_operation_invalid/);
  assert.throws(() => dispatchCatalog({operation: 'prepareMetadata', input: {}}), /literature_catalog_operation_unimplemented:prepareMetadata/);
});
