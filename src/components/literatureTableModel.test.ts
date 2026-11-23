import type { LiteratureItem } from "@research-assistant/core/literature";
import { describe, expect, it } from "vitest";

import {
  createLiteratureGridTemplate,
  cycleLiteratureColumnSort,
  DEFAULT_LITERATURE_COLUMNS,
  DEFAULT_LITERATURE_SORT,
  fitLiteratureColumns,
  normalizeLiteratureColumns,
  retainVisibleLiteratureIds,
  resizeLiteratureColumn,
  sortLiteratureItems,
  toggleLiteratureColumn,
  updateLiteratureSelection,
} from "./literatureTableModel";

function item(id: string, title: string, year: number, attachments = 0): LiteratureItem {
  return {
    id,
    itemType: id === "b" ? "report" : "journalArticle",
    title,
    abstractText: "",
    issuedYear: year,
    containerTitle: "",
    volume: "",
    issue: "",
    pages: "",
    doi: "",
    url: "",
    language: "",
    bibtexKey: id,
    creators: [],
    tags: [],
    readingStatus: "unread",
    attachments: Array.from({ length: attachments }, (_, index) => ({
      id: `${id}-${index}`,
      displayName: `${id}-${index}.pdf`,
      mimeType: "application/pdf",
      byteSize: 1,
      contentSha256: String(index).padStart(64, "0"),
    })),
    projectIds: [],
    metadataSources: [],
    createdAt: `2026-08-0${year}T00:00:00.000Z`,
    updatedAt: "2026-08-04T00:00:00.000Z",
  };
}

describe("literature table model", () => {
  it("lets the title column absorb remaining table width", () => {
    expect(createLiteratureGridTemplate(DEFAULT_LITERATURE_COLUMNS)).toBe(
      "minmax(464px, 1fr) 140px 100px 64px 46px",
    );
  });

  it("shrinks every column to fit, aligns the grid, and keeps preferred widths intact", () => {
    const fitted = fitLiteratureColumns(DEFAULT_LITERATURE_COLUMNS, 600);
    expect(fitted.reduce((total, column) => total + column.width, 0)).toBeCloseTo(600);
    fitted.forEach((column, index) => {
      expect(column.width).toBeGreaterThan(column.minWidth);
      expect(column.width).toBeLessThan(DEFAULT_LITERATURE_COLUMNS[index]?.width ?? 0);
    });
    expect(fitLiteratureColumns(DEFAULT_LITERATURE_COLUMNS, 1_000)).toBe(DEFAULT_LITERATURE_COLUMNS);
    expect(DEFAULT_LITERATURE_COLUMNS.map((column) => column.width)).toEqual([464, 140, 100, 64, 46]);
  });

  it("overflows only at minimum widths and fits the visible subset", () => {
    const minimum = fitLiteratureColumns(DEFAULT_LITERATURE_COLUMNS, 400);
    expect(minimum.map((column) => column.width)).toEqual([212, 90, 82, 58, 42]);
    const subset = DEFAULT_LITERATURE_COLUMNS.filter((column) => column.key === "title" || column.key === "year");
    expect(fitLiteratureColumns(subset, 400).reduce((total, column) => total + column.width, 0)).toBeCloseTo(400);
    expect(fitLiteratureColumns([], 400)).toEqual([]);
    expect(fitLiteratureColumns(minimum, 484)).toEqual(minimum);
  });

  it("supports single, command-toggle, and shift-range selection", () => {
    const single = updateLiteratureSelection({
      anchorId: undefined,
      clickedId: "b",
      currentIds: new Set(),
      currentPrimaryId: undefined,
      extendRange: false,
      toggle: false,
      visibleIds: ["a", "b", "c", "d"],
    });
    const toggled = updateLiteratureSelection({
      anchorId: single.anchorId,
      clickedId: "d",
      currentIds: single.selectedIds,
      currentPrimaryId: single.primaryId,
      extendRange: false,
      toggle: true,
      visibleIds: ["a", "b", "c", "d"],
    });
    const ranged = updateLiteratureSelection({
      anchorId: single.anchorId,
      clickedId: "d",
      currentIds: single.selectedIds,
      currentPrimaryId: single.primaryId,
      extendRange: true,
      toggle: false,
      visibleIds: ["a", "b", "c", "d"],
    });

    expect([...toggled.selectedIds]).toEqual(["b", "d"]);
    expect([...ranged.selectedIds]).toEqual(["b", "c", "d"]);
    expect(ranged.primaryId).toBe("d");
  });

  it("drops selected rows that are no longer visible", () => {
    expect([...retainVisibleLiteratureIds(new Set(["a", "b"]), ["b", "c"])]).toEqual(["b"]);
    expect([...retainVisibleLiteratureIds(new Set(["a"]), ["b", "c"])]).toEqual([]);
  });

  it("sorts by a selected column and direction", () => {
    const values = [item("a", "Beta", 2024), item("b", "Alpha", 2026, 2)];

    expect(sortLiteratureItems(values, { key: "title", direction: "ascending" }).map((value) => value.id)).toEqual(["b", "a"]);
    expect(sortLiteratureItems(values, { key: "year", direction: "descending" }).map((value) => value.id)).toEqual(["b", "a"]);
    expect(sortLiteratureItems(values, { key: "attachment", direction: "descending" }).map((value) => value.id)).toEqual(["b", "a"]);
  });

  it.each(DEFAULT_LITERATURE_COLUMNS)("cycles $key through ascending, descending and the default order", ({ key }) => {
    const values = [
      { ...item("a", "Beta", 2024), createdAt: "2026-08-02T00:00:00Z" },
      { ...item("b", "Alpha", 2026), createdAt: "2026-08-01T00:00:00Z" },
    ];
    const ascending = cycleLiteratureColumnSort(DEFAULT_LITERATURE_SORT, key);
    const descending = cycleLiteratureColumnSort(ascending, key);
    const reset = cycleLiteratureColumnSort(descending, key);
    expect(ascending).toEqual({ key, direction: "ascending" });
    expect(descending).toEqual({ key, direction: "descending" });
    expect(sortLiteratureItems(values, reset).map((value) => value.id)).toEqual(["a", "b"]);
    expect(values.map((value) => value.id)).toEqual(["a", "b"]);
    expect(cycleLiteratureColumnSort(reset, key)).toEqual(ascending);
  });

  it("starts a newly selected column in ascending order", () => {
    expect(cycleLiteratureColumnSort({ key: "title", direction: "descending" }, "year"))
      .toEqual({ key: "year", direction: "ascending" });
  });

  it("resizes and hides optional columns while preserving required columns", () => {
    const resized = resizeLiteratureColumn(DEFAULT_LITERATURE_COLUMNS, "creator", 42);
    const hidden = toggleLiteratureColumn(resized, "creator");
    const required = toggleLiteratureColumn(hidden, "title");
    const restored = normalizeLiteratureColumns(hidden);

    expect(resized.find((column) => column.key === "creator")?.width).toBe(90);
    expect(hidden.find((column) => column.key === "creator")?.visible).toBe(false);
    expect(required.find((column) => column.key === "title")?.visible).toBe(true);
    expect(restored.find((column) => column.key === "creator")).toMatchObject({
      visible: false,
      width: 90,
    });
  });
});
