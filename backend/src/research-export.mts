/** Research knowledge export preparation migrated from native/research_export.rs. */

import type {JsonValue} from '../../../../ra-workbench-sdk/packages/workbench-backend-sdk/src/json-wire.ts';
import type {PreparedResearchExportV1, ResearchExportDatasetV1, ResearchExportRejectionV1, ResearchExportSnapshotV1} from '../../../../ra-workbench-sdk/packages/workbench-backend-sdk/src/research-export.ts';

export const RESEARCH_EXPORT_DATASET_NAMES = [
  'projects', 'papers', 'creators', 'paperCreators', 'paperIdentifiers', 'paperMetadataProvenance', 'projectPapers', 'tags', 'paperTags', 'attachments', 'sourceAnchors', 'claims', 'claimEvidenceLinks', 'notePages', 'notePageBlocks', 'readingNoteSources', 'noteLinks', 'notePageTags', 'readingNoteTags', 'projectNotePages', 'projectReadingNotes', 'noteRevisions', 'noteBlockAssets', 'noteRevisionAssets', 'structuredReadingUnits', 'readingUnitEvidenceLinks', 'terms', 'concepts', 'conceptTerms', 'termUsages', 'definitionClaims', 'definitionEvidenceLinks', 'relationAssertions', 'relationEvidenceLinks', 'researchObjectRevisions', 'conceptIdentityEvents', 'conceptIdentityMappings', 'conceptIdentityRelationImpacts', 'readingProfiles', 'paperReadingProfileSelections', 'paperReadingProfileSelectionRevisions', 'referenceRecords', 'referenceRecordRevisions', 'evidenceMatrices', 'evidenceMatrixRevisions', 'evidenceMatrixCells', 'evidenceMatrixCellRevisions', 'derivedResearchViews', 'derivedResearchViewRevisions', 'aiRuns', 'aiScopeItems', 'aiRunStages', 'aiEvidenceBundles', 'aiEvidenceItems', 'aiCandidates', 'aiCandidateRevisions', 'aiCandidateSummaryVersions', 'aiReviewDecisions', 'aiEvidenceInspections', 'aiCitationAssessments', 'aiOverviewRetryRuns', 'aiOverviewProfileRuns', 'aiAttentionFeedback', 'aiSuggestionRunContexts', 'aiSuggestionItemDecisions', 'aiMatrixSynthesisRunContexts', 'aiMatrixSynthesisInputCells',
] as const;
export const MAX_EXPORT_RECORDS = 100_000;

const objectDatasets = new Set(['claims', 'notePages', 'structuredReadingUnits', 'terms', 'concepts', 'termUsages', 'definitionClaims', 'relationAssertions', 'referenceRecords', 'evidenceMatrices', 'evidenceMatrixCells', 'derivedResearchViews', 'aiCandidates']);
const objectRecord = (record: JsonValue): Readonly<Record<string, JsonValue>> | undefined => record !== null && typeof record === 'object' && !Array.isArray(record) ? record as Readonly<Record<string, JsonValue>> : undefined;
const textField = (record: JsonValue, field: string): string => {const object = objectRecord(record); const value = object?.[field]; return typeof value === 'string' ? value : '';};
const nonEmptyText = (record: JsonValue, field: string): string | undefined => {const value = textField(record, field).trim(); return value === '' ? undefined : value;};

interface Bundle {readonly schemaVersion: 1; readonly applicationVersion: string; readonly exportedAt: string; readonly scope: 'all_research_knowledge'; readonly containsAiCandidateHistory: true; readonly objectCount: number; readonly sourceCount: number; readonly recordCount: number; readonly datasets: readonly ResearchExportDatasetV1[]}

function section(output: string[], records: readonly JsonValue[], title: string, fields: readonly string[]): void {
  output.push(`## ${title}（${records.length}）\n`);
  for (const record of records) output.push(`- ${fields.flatMap(field => nonEmptyText(record, field) ?? []).join(' — ')} \`${textField(record, 'id')}\``);
  output.push('');
}
function relationSection(output: string[], records: readonly JsonValue[]): void {
  output.push(`## 关系断言（${records.length}）\n`);
  for (const record of records) output.push(`- ${textField(record, 'subjectLabelSnapshot')} — ${textField(record, 'predicateKind')} → ${textField(record, 'objectLabelSnapshot')} \`${textField(record, 'id')}\``);
  output.push('');
}
function markdown(bundle: Bundle): string {
  const output = ['# Research Assistant 研究知识导出\n', `- 导出时间：${bundle.exportedAt}`, `- 长期研究对象：${bundle.objectCount}`, `- 原文锚点：${bundle.sourceCount}`, `- 全部结构化记录：${bundle.recordCount}`, '- 完整版本、证据关系和 AI 审查来历见 `manifest.json`。\n'];
  const dataset = (name: string): readonly JsonValue[] => bundle.datasets.find(value => value.name === name)?.records ?? [];
  section(output, dataset('claims'), '观点', ['statement']); section(output, dataset('notePages'), '笔记页面', ['title']);
  const sources = new Set(dataset('readingNoteSources').map(value => textField(value, 'pageId')));
  const blocks = new Map<string, JsonValue[]>(); for (const block of dataset('notePageBlocks')) {const id = textField(block, 'pageId'); const list = blocks.get(id) ?? []; list.push(block); blocks.set(id, list);}
  const pages = dataset('notePages').filter(value => sources.has(textField(value, 'id')));
  output.push(`## 阅读笔记（${pages.length}）\n`); for (const page of pages) {const id = textField(page, 'id'); output.push(`### ${textField(page, 'title')} \`${id}\`\n`); for (const block of blocks.get(id) ?? []) {const text = nonEmptyText(block, 'plainText'); if (text) output.push(`${text}\n`);}}
  section(output, dataset('structuredReadingUnits'), '结构化阅读单元', ['title', 'body']); section(output, dataset('concepts'), '概念', ['label', 'explanation', 'disambiguation']); section(output, dataset('definitionClaims'), '定义主张', ['statement', 'scopeNote']); relationSection(output, dataset('relationAssertions')); section(output, dataset('referenceRecords'), '参考条目', ['rawText', 'identityState', 'semanticState']); section(output, dataset('evidenceMatrices'), 'Evidence Matrix', ['title']); section(output, dataset('derivedResearchViews'), '派生研究视图', ['viewKind', 'title', 'scopeNote']);
  return output.join('\n');
}

export function prepareResearchExport(snapshot: ResearchExportSnapshotV1): PreparedResearchExportV1 | ResearchExportRejectionV1 {
  if (snapshot.datasets.length !== RESEARCH_EXPORT_DATASET_NAMES.length || snapshot.datasets.some((dataset, index) => dataset.name !== RESEARCH_EXPORT_DATASET_NAMES[index])) return {kind: 'invalidSnapshot'};
  let recordCount = 0, objectCount = 0, sourceCount = 0;
  for (const dataset of snapshot.datasets) {recordCount += dataset.records.length; if (recordCount > MAX_EXPORT_RECORDS) return {kind: 'tooLarge'}; if (objectDatasets.has(dataset.name)) objectCount += dataset.records.length; if (dataset.name === 'sourceAnchors') sourceCount = dataset.records.length;}
  const bundle: Bundle = {schemaVersion: 1, applicationVersion: snapshot.applicationVersion, exportedAt: snapshot.exportedAt, scope: 'all_research_knowledge', containsAiCandidateHistory: true, objectCount, sourceCount, recordCount, datasets: snapshot.datasets};
  let manifestJson: string; try {manifestJson = JSON.stringify(bundle, null, 2);} catch (cause) {return {kind: 'serialization', message: cause instanceof Error ? cause.message : String(cause)};}
  return {exportedAt: bundle.exportedAt, manifestJson, markdown: markdown(bundle), objectCount: BigInt(objectCount), sourceCount: BigInt(sourceCount)};
}
