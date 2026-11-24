import type {DoiPreviewInputV1, DoiPreviewOutcomeV1, DoiTranslationV1} from '../../../../ra-workbench-sdk/packages/workbench-backend-sdk/src/doi-metadata.js';
import type {CatalogItemRows} from './catalog.mts';
import {projectCatalog, type CatalogProjectionInput} from './catalog.mts';
import {diffMetadata, type MetadataItem} from './metadata.mts';
import {finishDoi, needsPublisher, prepareDoi, resolverError, DOI_ACCEPT, DOI_RESPONSE_LIMIT, HTML_RESPONSE_LIMIT, type PublisherOutcome} from './doi-metadata.mts';
import {finishImportState} from './import-jobs.mts';

const rejected = (code: string, message: string): DoiPreviewOutcomeV1 => ({status: 'rejected', code, message});
const connector = (error: {readonly message: string}): DoiPreviewOutcomeV1 => rejected('connector_error', `DOI 元数据请求失败：${error.message}`);

export function decideDoiPreview(input: DoiPreviewInputV1): DoiPreviewOutcomeV1 {
  if (input.kind === 'start') {
    if (input.rawInput.trim() === '') return rejected('invalid_input', 'DOI 不能为空');
    if (input.normalizedDoi === null) return rejected('invalid_input', '未识别到有效 DOI，请检查输入内容');
    return {status: 'started', normalizedDoi: input.normalizedDoi, sourceKind: 'doi', finishStates: {noFailed: finishImportState(0, 0), noImported: finishImportState(0, 1), mixed: finishImportState(1, 1)}, resolverAccept: DOI_ACCEPT, publisherAccept: 'text/html,application/xhtml+xml', resolverLimit: BigInt(DOI_RESPONSE_LIMIT), publisherLimit: BigInt(HTML_RESPONSE_LIMIT)};
  }
  if (input.kind === 'translate') {
    if ('Err' in input.resolver) return connector(resolverError(input.resolver.Err));
    let prepared;
    try {prepared = prepareDoi(input.normalizedDoi, input.resolver.Ok.contentType, input.resolver.Ok.body);} catch (error) {return connector({message: error instanceof Error ? error.message : String(error)});}
    if (input.publisher !== null && 'Err' in input.publisher && ['invalidResolver', 'client'].includes(input.publisher.Err.kind)) throw new Error('literature_catalog_input_invalid:doi_publisher');
    if (needsPublisher(prepared) && input.publisher === null) return {status: 'needsPublisher'};
    const publisher: PublisherOutcome | null = input.publisher === null ? null : 'Ok' in input.publisher ? {kind: 'html', body: input.publisher.Ok.body, finalHttps: input.publisher.Ok.finalHttps} : {kind: 'failed', error: input.publisher.Err};
    try {return {status: 'translated', translation: finishDoi(prepared, publisher)};} catch (error) {return connector({message: error instanceof Error ? error.message : String(error)});}
  }
  let current: MetadataItem | null = null;
  if (input.itemId === null) {if (input.current !== null) throw new Error('literature_catalog_input_invalid:doi_capture');}
  else {if (input.current === null) throw new Error('literature_catalog_input_invalid:doi_capture'); const outcome = projectCatalog({request: {kind: 'get', id: input.itemId}, items: [input.current] satisfies readonly CatalogItemRows[] as CatalogProjectionInput['items']}); if (outcome.kind === 'notFound') return rejected('not_found', '找不到文献或附件'); current = outcome.items[0] as MetadataItem | undefined ?? null;}
  const draft = {...input.translation.draft, id: input.itemId}; const preview = {id: input.id, importJobId: input.importJobId, itemId: input.itemId, sourceKind: input.translation.sourceKind, sourceReference: input.normalizedDoi, draft, diffs: diffMetadata(current, draft, input.currentNormalizedDoi, input.normalizedDoi), warnings: input.translation.warnings};
  return {status: 'candidate', preview, rawPayload: input.translation.rawPayload};
}
