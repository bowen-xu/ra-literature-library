/** BibTeX import preparation and result-state policy migrated from the native plugin. */

import {prepareCatalogSave, type CatalogSaveInput, type CatalogSaveOutcome} from './catalog-save.mts';
import type {DataRows, DataValue} from '../../../../ra-workbench-sdk/packages/workbench-backend-sdk/src/data.js';

export interface PreparedBibtexEntry {readonly inputLabel: string; readonly rawInput: string; readonly save: CatalogSaveOutcome}
export interface ImportFinishStates {readonly noFailed: string; readonly noImported: string; readonly mixed: string}
export interface ImportJobRules {
  readonly sourceKind: string; readonly importedState: string; readonly failedState: string;
  readonly finishStates: ImportFinishStates; readonly notFoundMessage: string; readonly emptyTitleMessage: string;
  readonly unsupportedTypePrefix: string; readonly databaseErrorPrefix: string;
}
export interface PreparedBibtex {readonly entries: readonly PreparedBibtexEntry[]; readonly rules: ImportJobRules}
export type ImportJobsRejection = {readonly kind: 'emptyTitle'};
export type BibtexPreparation =
  | {readonly status: 'ready'; readonly plan: PreparedBibtex}
  | {readonly status: 'rejected'; readonly reason: ImportJobsRejection; readonly message: string};

export function finishImportState(imported: number, failed: number): string {
  return failed === 0 ? 'completed' : imported === 0 ? 'failed' : 'completed_with_errors';
}

export function prepareBibtex(input: {readonly inputs: readonly CatalogSaveInput[]}): BibtexPreparation {
  if (input.inputs.length === 0) return {status: 'rejected', reason: {kind: 'emptyTitle'}, message: '标题不能为空'};
  const entries = input.inputs.map(original => {
    const rawInput = serialize(original.draft);
    const inputLabel = original.draft.bibtexKey.trim().length === 0 ? original.draft.title : original.draft.bibtexKey;
    const draft = {...original.draft, sourceKind: 'bibtex'};
    return {inputLabel, rawInput, save: prepareCatalogSave({draft, doi: original.doi})};
  });
  return {status: 'ready', plan: {entries, rules: importJobRules()}};
}

export function importJobRules(): ImportJobRules {
  return {
    sourceKind: 'bibtex', importedState: 'imported', failedState: 'failed',
    finishStates: {noFailed: finishImportState(0, 0), noImported: finishImportState(0, 1), mixed: finishImportState(1, 1)},
    notFoundMessage: '找不到文献或附件', emptyTitleMessage: '标题不能为空',
    unsupportedTypePrefix: '不支持的文献类型：', databaseErrorPrefix: '文献数据库操作失败：',
  };
}

function serialize(value: unknown): string {
  const serialized = JSON.stringify(value, (_key, current: unknown) => typeof current === 'bigint' ? Number(current) : current);
  if (serialized === undefined) throw new Error('IMPORT_INPUT_ENCODING');
  return serialized;
}

export interface ImportedResult {readonly inputLabel: string; readonly rawInput: string; readonly state: string; readonly itemId: string | null; readonly errorMessage: string | null}
export interface ImportedJob {
  readonly id: string; readonly state: string; readonly sourceKind: string; readonly totalCount: bigint; readonly completedCount: bigint;
  readonly cancellationRequested: boolean; readonly results: readonly ImportedResult[]; readonly createdAt: string; readonly updatedAt: string;
}
export type ImportJobsProjectionInput =
  | {readonly kind: 'job'; readonly expectedId: string; readonly rows: ImportJobRows}
  | {readonly kind: 'jobs'; readonly expectedIds: readonly string[]; readonly rows: readonly ImportJobRows[]}
  | {readonly kind: 'cancel'; readonly affectedRows: bigint};
export interface ImportJobRows {readonly header: DataRows; readonly results: DataRows | null}
export type ImportJobsProjectionOutcome =
  | {readonly status: 'success'; readonly result: {readonly kind: 'job'; readonly job: ImportedJob} | {readonly kind: 'jobs'; readonly jobs: readonly ImportedJob[]} | {readonly kind: 'done'}}
  | {readonly status: 'notFound'; readonly message: string};

const importNotFound = '找不到文献或附件';
class ImportRow {
  private readonly values: readonly DataValue[];
  private readonly group: string;
  private readonly index: number;
  constructor(values: readonly DataValue[], group: string, index: number, count: number) {
    this.values = values;
    this.group = group;
    this.index = index;
    if (values.length !== count) throw new Error(`literature_catalog_input_invalid: ${group} row ${index} has ${values.length} columns; expected ${count}`);
  }
  private invalid(column: number, expected: string): Error {return new Error(`literature_catalog_input_invalid: ${this.group} row ${this.index} column ${column} requires ${expected}`);}
  text(column: number): string {const value = this.values[column]; if (value?.kind !== 'text') throw this.invalid(column, 'String'); return value.value;}
  optionalText(column: number): string | null {const value = this.values[column]; if (value?.kind === 'null') return null; if (value?.kind !== 'text') throw this.invalid(column, 'Option<String>'); return value.value;}
  integer(column: number): bigint {const value = this.values[column]; if (value?.kind !== 'integer') throw this.invalid(column, 'Integer'); return value.value;}
}

function importedJob(expectedId: string, captured: ImportJobRows): ImportedJob | null {
  if (captured.header.rows.length === 0) return null;
  if (captured.header.rows.length !== 1) throw new Error('literature_catalog_input_invalid: importJob query_row result has multiple rows');
  const row = new ImportRow(captured.header.rows[0]!, 'importJob', 0, 8);
  const id = row.text(0);
  if (id !== expectedId) throw new Error('literature_catalog_input_invalid: import-job header has another requested identity');
  const totalCount = row.integer(3), completedCount = row.integer(4);
  if (totalCount < 0n || completedCount < 0n) throw new Error('literature_catalog_input_invalid: importJob count requires usize');
  if (captured.results === null) throw new Error('literature_catalog_input_invalid: import-job captured row bundle is incomplete');
  const results = captured.results.rows.map((values, index) => {
    const result = new ImportRow(values, 'importResults', index, 5);
    return {inputLabel: result.text(0), rawInput: result.text(1), state: result.text(2), itemId: result.optionalText(3), errorMessage: result.optionalText(4)};
  });
  return {id, state: row.text(1), sourceKind: row.text(2), totalCount, completedCount, cancellationRequested: row.integer(5) !== 0n, results, createdAt: row.text(6), updatedAt: row.text(7)};
}

export function projectImportJobs(input: ImportJobsProjectionInput): ImportJobsProjectionOutcome {
  if (input.kind === 'cancel') return input.affectedRows === 0n ? {status: 'notFound', message: importNotFound} : {status: 'success', result: {kind: 'done'}};
  if (input.kind === 'job') {
    const job = importedJob(input.expectedId, input.rows);
    return job === null ? {status: 'notFound', message: importNotFound} : {status: 'success', result: {kind: 'job', job}};
  }
  if (input.rows.length > input.expectedIds.length || input.rows.length !== input.expectedIds.length) throw new Error('literature_catalog_input_invalid: import-job captured row bundle is incomplete');
  const jobs: ImportedJob[] = [];
  for (let index = 0; index < input.expectedIds.length; index += 1) {
    const job = importedJob(input.expectedIds[index]!, input.rows[index]!);
    if (job === null) return {status: 'notFound', message: importNotFound};
    jobs.push(job);
  }
  return {status: 'success', result: {kind: 'jobs', jobs}};
}
