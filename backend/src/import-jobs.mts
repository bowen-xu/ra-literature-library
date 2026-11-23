/** BibTeX import preparation and result-state policy migrated from the native plugin. */

import {prepareCatalogSave, type CatalogSaveInput, type CatalogSaveOutcome} from './catalog-save.mts';

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
