/** File-backed catalog runtime bridge for the literature trace host. */

import {createHash, randomUUID} from 'node:crypto';
import {readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {dispatchCatalog} from '../../backend/src/catalog-dispatch.mts';
import {catalogResultHandle, type SnapshotRef} from '../../backend/src/literature-trace-protocol.mts';
import type {LiteratureTraceHostHandlers} from './literature-trace-host.mts';

export class CatalogRuntimeError extends Error {
  readonly code: 'invalid_handle' | 'input_mismatch' | 'io' | 'dispatch';
  constructor(code: 'invalid_handle' | 'input_mismatch' | 'io' | 'dispatch', message: string) {super(message); this.name = 'CatalogRuntimeError'; this.code = code;}
}

export class FileBackedCatalogRuntime {
  private readonly root: string;
  constructor(root: string) {this.root = root;}

  async dispatch(operation: string, input: SnapshotRef, output: SnapshotRef): Promise<SnapshotRef> {
    let inputBytes: Uint8Array;
    try {inputBytes = await readFile(this.safePath(input.relativeHandle));} catch (cause) {if (cause instanceof CatalogRuntimeError) throw cause; throw new CatalogRuntimeError('io', 'literature_catalog_input_unavailable');}
    if (inputBytes.byteLength !== input.byteSize || digest(inputBytes) !== input.sha256) throw new CatalogRuntimeError('input_mismatch', 'literature_catalog_input_mismatch');
    let value: unknown;
    try {value = JSON.parse(new TextDecoder().decode(inputBytes));} catch {throw new CatalogRuntimeError('input_mismatch', 'literature_catalog_input_invalid_json');}
    let result: unknown;
    try {result = dispatchCatalog({operation, input: value});} catch (cause) {throw new CatalogRuntimeError('dispatch', cause instanceof Error ? cause.message : String(cause));}
    const resultBytes = new TextEncoder().encode(JSON.stringify(result));
    try {await writeFile(this.safePath(output.relativeHandle), resultBytes);} catch (cause) {if (cause instanceof CatalogRuntimeError) throw cause; throw new CatalogRuntimeError('io', 'literature_catalog_result_unavailable');}
    return {...output, byteSize: resultBytes.byteLength, sha256: digest(resultBytes)};
  }

  private safePath(relativeHandle: string): string {
    if (relativeHandle.length === 0 || path.isAbsolute(relativeHandle) || relativeHandle.includes('\\') || relativeHandle.split('/').some(part => part === '..' || part === '')) throw new CatalogRuntimeError('invalid_handle', 'literature_catalog_handle_invalid');
    const root = path.resolve(this.root), resolved = path.resolve(root, relativeHandle);
    if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) throw new CatalogRuntimeError('invalid_handle', 'literature_catalog_handle_invalid');
    return resolved;
  }
}

function digest(bytes: Uint8Array): string {return createHash('sha256').update(bytes).digest('hex');}
export function newCatalogRequestIdentity(): {readonly instanceId: string; readonly requestId: string} {return {instanceId: randomUUID(), requestId: randomUUID()};}

export function createFileBackedCatalogHandler(runtime: FileBackedCatalogRuntime): LiteratureTraceHostHandlers['catalog'] {
  return (operation, input) => runtime.dispatch(operation, input, {
    relativeHandle: catalogResultHandle(input.requestId), byteSize: 1, sha256: '0'.repeat(64),
    packageKey: input.packageKey, instanceId: input.instanceId, requestId: input.requestId,
  });
}
