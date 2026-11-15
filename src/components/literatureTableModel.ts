import type { LiteratureItem } from "@research-assistant/core/literature";

import { creatorLabel, typeLabel } from "./literatureWorkspaceModel";

export type LiteratureColumnKey =
  | "title"
  | "creator"
  | "itemType"
  | "year"
  | "attachment";

export interface LiteratureColumn {
  readonly key: LiteratureColumnKey;
  readonly label: string;
  readonly minWidth: number;
  readonly width: number;
  readonly visible: boolean;
  readonly required?: boolean;
}

export type LiteratureSortKey =
  | "created"
  | "title"
  | "creator"
  | "itemType"
  | "year"
  | "attachment";

export interface LiteratureSort {
  readonly key: LiteratureSortKey;
  readonly direction: "ascending" | "descending";
}

export type { RowSelectionInput as LiteratureSelectionInput, RowSelectionResult as LiteratureSelectionResult } from "@research-assistant/workbench-sdk/layout";

export const DEFAULT_LITERATURE_COLUMNS: readonly LiteratureColumn[] = [
  { key: "title", label: "标题", minWidth: 212, width: 464, visible: true, required: true },
  { key: "creator", label: "作者", minWidth: 90, width: 140, visible: true },
  { key: "itemType", label: "条目类型", minWidth: 82, width: 100, visible: true },
  { key: "year", label: "年份", minWidth: 58, width: 64, visible: true },
  { key: "attachment", label: "附件", minWidth: 42, width: 46, visible: true },
];

export const DEFAULT_LITERATURE_SORT: LiteratureSort = {
  key: "created",
  direction: "descending",
};

export function cycleLiteratureColumnSort(
  current: LiteratureSort,
  key: LiteratureColumnKey,
): LiteratureSort {
  if (current.key !== key) return { key, direction: "ascending" };
  return current.direction === "ascending"
    ? { key, direction: "descending" }
    : DEFAULT_LITERATURE_SORT;
}

export function createLiteratureGridTemplate(
  columns: readonly LiteratureColumn[],
): string {
  return columns
    .map((column) => column.key === "title"
      ? `minmax(${column.width}px, 1fr)`
      : `${column.width}px`)
    .join(" ");
}

/** Fit preferred widths without overwriting the user's saved column sizes. */
export function fitLiteratureColumns(
  columns: readonly LiteratureColumn[],
  availableWidth: number,
): readonly LiteratureColumn[] {
  const preferredWidth = columns.reduce((total, column) => total + column.width, 0);
  if (!Number.isFinite(availableWidth) || availableWidth >= preferredWidth) return columns;
  const minimumWidth = columns.reduce((total, column) => total + column.minWidth, 0);
  if (availableWidth <= minimumWidth) return columns.map((column) => ({ ...column, width: column.minWidth }));
  // Share the reduction according to each column's room above its minimum.
  const remainingRatio = (availableWidth - minimumWidth) / (preferredWidth - minimumWidth);
  return columns.map((column) => ({
    ...column,
    width: column.minWidth + (column.width - column.minWidth) * remainingRatio,
  }));
}

export function normalizeLiteratureColumns(value: unknown): readonly LiteratureColumn[] {
  const preferences = Array.isArray(value) ? value : [];
  return DEFAULT_LITERATURE_COLUMNS.map((column) => {
    const preference = preferences.find((candidate) => (
      candidate !== null &&
      typeof candidate === "object" &&
      "key" in candidate &&
      candidate.key === column.key
    ));
    if (preference === undefined || preference === null || typeof preference !== "object") {
      return column;
    }
    const width = "width" in preference && typeof preference.width === "number"
      ? Math.max(column.minWidth, Math.round(preference.width))
      : column.width;
    const visible = column.required
      ? true
      : "visible" in preference && typeof preference.visible === "boolean"
        ? preference.visible
        : column.visible;
    return { ...column, visible, width };
  });
}

export function resizeLiteratureColumn(
  columns: readonly LiteratureColumn[],
  key: LiteratureColumnKey,
  width: number,
): readonly LiteratureColumn[] {
  return columns.map((column) => column.key === key
    ? { ...column, width: Math.max(column.minWidth, Math.round(width)) }
    : column);
}

export function toggleLiteratureColumn(
  columns: readonly LiteratureColumn[],
  key: LiteratureColumnKey,
): readonly LiteratureColumn[] {
  return columns.map((column) => column.key === key && !column.required
    ? { ...column, visible: !column.visible }
    : column);
}

export function sortLiteratureItems(
  items: readonly LiteratureItem[],
  sort: LiteratureSort,
): readonly LiteratureItem[] {
  const direction = sort.direction === "ascending" ? 1 : -1;
  return [...items].sort((left, right) => {
    let comparison = 0;
    if (sort.key === "created") comparison = left.createdAt.localeCompare(right.createdAt);
    if (sort.key === "title") comparison = left.title.localeCompare(right.title, "zh-CN");
    if (sort.key === "creator") comparison = creatorLabel(left).localeCompare(creatorLabel(right), "zh-CN");
    if (sort.key === "itemType") comparison = typeLabel(left.itemType).localeCompare(typeLabel(right.itemType), "zh-CN");
    if (sort.key === "year") comparison = (left.issuedYear ?? 0) - (right.issuedYear ?? 0);
    if (sort.key === "attachment") comparison = left.attachments.length - right.attachments.length;
    if (comparison === 0) comparison = left.title.localeCompare(right.title, "zh-CN");
    return comparison * direction;
  });
}

export { retainRowSelectionIds as retainVisibleLiteratureIds, updateRowSelection as updateLiteratureSelection } from "@research-assistant/workbench-sdk/layout";
