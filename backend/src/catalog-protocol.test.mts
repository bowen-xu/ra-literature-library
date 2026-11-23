import assert from 'node:assert/strict';
import {test} from 'node:test';
import {CATALOG_CAPABILITY_ID, CATALOG_OPERATIONS, isCatalogOperation, requireCatalogOperation, validateCatalogCapability} from './catalog-protocol.mts';

test('catalog protocol preserves the finite operation set', () => {
  assert.equal(CATALOG_OPERATIONS.length, 47);
  assert.equal(isCatalogOperation('bibliographySearch'), true);
  assert.equal(isCatalogOperation('unknown'), false);
  assert.equal(requireCatalogOperation('preparePaperConfirmation'), 'preparePaperConfirmation');
  assert.throws(() => requireCatalogOperation('unknown'), /operation_invalid/u);
});

test('catalog capability validation remains explicit', () => {
  validateCatalogCapability({id: CATALOG_CAPABILITY_ID, version: 1});
  assert.throws(() => validateCatalogCapability({id: CATALOG_CAPABILITY_ID, version: 2}), /capability_invalid/u);
});
