import { expect, it } from "vitest";
import { readingNoteSourceAt, type ReadingNoteBlock } from "@research-assistant/core/notes";
import type { SourceRect } from "@research-assistant/core/literature";
import { orderedReadingAnnotations } from "./readingAnnotationOrder";

const rect = (x: number, y: number): SourceRect => ({ x, y, width: .05, height: .02 });
function note(id: string, pageIndex: number, rects: readonly SourceRect[], noteType: ReadingNoteBlock["noteType"] = "annotation"): ReadingNoteBlock {
  return { id: id as ReadingNoteBlock["id"], noteType, body: "", color: "#f4cf65", status: "active", isFavorite: false, revision: 0,
    source: { paperId: "paper", paperTitle: "Synthetic paper", attachmentId: "pdf", contentSha256: "a".repeat(64), pageIndex,
      pageLabel: String(440 + pageIndex), rects, quoteExact: noteType === "highlight" ? "Synthetic quote" : "", quotePrefix: "", quoteSuffix: "", state: "exact" },
    projectIds: [], tagIds: [], createdAt: "2026-10-12T00:00:00Z", updatedAt: "2026-10-12T00:00:00Z" };
}
const ids = (notes: readonly ReadingNoteBlock[]) => orderedReadingAnnotations(notes).map(value => value.id);

it("orders highlights and sticky notes by actual page, then top and left, without mutating insertion order", () => {
  const input = [note("next-page", 1, [rect(.1, .1)]), note("lower", 0, [rect(.1, .8)]), note("right", 0, [rect(.7, .2)]), note("left", 0, [rect(.1, .2)], "highlight")];
  expect(ids(input)).toEqual(["left", "right", "lower", "next-page"]);
  expect(input.map(value => value.id)).toEqual(["next-page", "lower", "right", "left"]);
});

it("uses the earliest source rectangle for multi-line and reversed cross-page sources", () => {
  const crossing = note("crossing", 1, [rect(.1, .8)]);
  const source = { ...crossing, source: { ...crossing.source, selector: { schemaVersion: 2 as const, attachmentSha256: crossing.source.contentSha256, segments: [
    { pageIndex: 1, rects: [rect(.1, .1)], exactText: "second" },
    { pageIndex: 0, rects: [rect(.1, .8), rect(.4, .2)], exactText: "first" },
  ] } } };
  expect(ids([note("middle", 0, [rect(.1, .4)]), source, note("first", 0, [rect(.1, .1)])])).toEqual(["first", "crossing", "middle"]);
});

it("reorders a moved sticky note immediately and after reading its persisted source", () => {
  const sticky = note("sticky", 0, [rect(.1, .8)]), highlight = note("highlight", 0, [rect(.1, .4)]), next = rect(.1, .2);
  expect(ids([sticky, highlight])).toEqual(["highlight", "sticky"]);
  const moved = { ...sticky, source: readingNoteSourceAt(sticky.source, next) };
  expect(ids([highlight, moved])).toEqual(["sticky", "highlight"]);
  expect(ids(JSON.parse(JSON.stringify([highlight, moved])) as ReadingNoteBlock[])).toEqual(["sticky", "highlight"]);
});

it("places legacy page-only notes after positioned notes on their page and resolves exact ties consistently", () => {
  const same = [note("b", 0, [rect(.1, .2)]), note("a", 0, [rect(.1, .2)])];
  expect(ids([note("legacy", 0, [], "page_note"), ...same, note("next", 1, [rect(.1, .1)])])).toEqual(["a", "b", "legacy", "next"]);
  expect(ids([...same].reverse())).toEqual(["a", "b"]);
});
