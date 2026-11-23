import assert from 'node:assert/strict';
import test from 'node:test';
import {attachmentRejectionCode, prepareAttachment, prepareReadingState, validReaderViewState} from './attachments.mts';

const view = {schemaVersion: 2, pageIndex: 0, scale: {kind: 'numeric', value: 1}, scrollMode: 'vertical', spreadMode: 'none'};

test('attachment preparation trims names and preserves invalid-name boundaries', () => {
  const input = {kind: 'rename' as const, request: {itemId: 'paper', attachmentId: 'pdf', displayName: '  Article.pdf  '}};
  assert.deepEqual(prepareAttachment(input), {status: 'ready', plan: {kind: 'rename', request: input.request, displayName: 'Article.pdf'}});
  const invalid = prepareAttachment({...input, request: {...input.request, displayName: `\u0000${'x'.repeat(255)}`}});
  assert.deepEqual(invalid, {status: 'rejected', input: {...input, request: {...input.request, displayName: `\u0000${'x'.repeat(255)}`}}, reason: 'invalidAttachmentName'});
  assert.equal(attachmentRejectionCode('invalidAttachmentName'), 'attachment_name_invalid');
});

test('reader state validates schema before clamping zoom', () => {
  assert.equal(validReaderViewState(view), true);
  assert.equal(validReaderViewState({...view, pageIndex: -1}), false);
  assert.equal(validReaderViewState({...view, scale: {kind: 'numeric', value: 3.1}}), false);
  assert.equal(prepareReadingState(4, JSON.stringify(view)), 3);
  assert.equal(prepareReadingState(0.1, JSON.stringify(view)), 0.5);
  assert.equal(prepareReadingState(Number.NaN, JSON.stringify(view)), 'invalidReaderViewState');
  assert.equal(prepareReadingState(1, '{'), 'invalidReaderViewState');
});

test('save-reading-state preparation retains the original request and bounded zoom', () => {
  const request = {itemId: 'paper', attachmentId: 'pdf', pageIndex: 7, zoom: 1.25, viewStateJson: JSON.stringify(view)};
  assert.deepEqual(prepareAttachment({kind: 'saveReadingState', request}), {status: 'ready', plan: {kind: 'saveReadingState', request, boundedZoom: 1.25}});
  const invalid = prepareAttachment({kind: 'saveReadingState', request: {...request, viewStateJson: JSON.stringify({...view, spreadMode: 'invalid'})}});
  assert.equal(invalid.status, 'rejected');
});
