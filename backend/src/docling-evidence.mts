/** Docling evidence-row interpretation migrated from the native plugin. */

import type {ContextItem} from './paper-context-preview.mts';

export interface DoclingEvidenceRow {readonly anchorId: string; readonly pageIndex: number; readonly pageLabel: string; readonly rectsJson: string; readonly quote: string; readonly context: string}
export function quoteForDoclingItem(item: ContextItem): string {
  let value: string | undefined = item.text ?? item.label ?? undefined;
  if (value === null || value === undefined) value = item.tableJson === undefined ? undefined : JSON.stringify(item.tableJson);
  return [...(value ?? `Docling ${item.kind} block ${item.id}`)].slice(0, 6_000).join('');
}
export function contextForDoclingItem(item: ContextItem): string {
  let value = `[${item.id}] kind=${item.kind} page=${item.pageIndex === null ? 0 : item.pageIndex + 1} rawRef=${item.rawRef}`;
  if (item.label !== null) value += ` label=${item.label}`;
  if (item.text !== null) value += ` text=${item.text}`;
  if (item.tableJson !== undefined) value += ` table=${JSON.stringify(item.tableJson)}`;
  return [...value].slice(0, 12_000).join('');
}
export function evidenceRow(run: string, item: ContextItem): DoclingEvidenceRow | null {
  const page = item.regions[0]?.pageIndex ?? item.pageIndex; if (page === null) return null;
  const rects = item.regions.filter(region => region.pageIndex === page).map(region => region.rect);
  return {anchorId: `docling:${run}:${item.id}`, pageIndex: page, pageLabel: String(page + 1), rectsJson: JSON.stringify(rects), quote: quoteForDoclingItem(item), context: contextForDoclingItem(item)};
}
export function validateAnalysisStart(revision: number | bigint, hasTemplate: boolean): string | null {return Number(revision) < 1 && !hasTemplate ? '阅读框架尚未确认，无法启动 AI 提取' : null;}
export function validateDoclingAnalysisSources(statuses: readonly string[], pictureCount: number | bigint): string | null {if (statuses.some(status => status !== 'available')) return '部分 PDF 尚未完成 Docling 结构化解析'; return Number(pictureCount) > 128 ? `图片结构块数量为 ${pictureCount}，超过本轮上限 128；请等待分批发送能力接入` : null;}
