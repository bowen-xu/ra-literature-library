import type { ReadingNoteBlock } from "@research-assistant/core/notes";
import { readingNoteSegments } from "./readerWorkspaceModel";

type SourcePosition = readonly [pageIndex: number, y: number, x: number];

function comparePosition(left: SourcePosition, right: SourcePosition): number {
  for (const index of [0, 1, 2] as const) {
    if (left[index] < right[index]) return -1;
    if (left[index] > right[index]) return 1;
  }
  return 0;
}

function firstPosition(note: ReadingNoteBlock): SourcePosition {
  let first: SourcePosition | undefined;
  for (const segment of readingNoteSegments(note.source)) {
    // Legacy page-only notes follow the positioned annotations on their page.
    const positions: SourcePosition[] = segment.rects.length > 0
      ? segment.rects.map(rect => [segment.pageIndex, rect.y, rect.x])
      : [[segment.pageIndex, Infinity, Infinity]];
    for (const position of positions) {
      if (!first || comparePosition(position, first) < 0) first = position;
    }
  }
  return first ?? [note.source.pageIndex, Infinity, Infinity];
}

/** Derive sidebar order from current source geometry, without mutating the controller snapshot. */
export function orderedReadingAnnotations(notes: readonly ReadingNoteBlock[]): ReadingNoteBlock[] {
  return notes.map(note => ({ note, position: firstPosition(note) }))
    .sort((left, right) => comparePosition(left.position, right.position)
      || left.note.createdAt.localeCompare(right.note.createdAt)
      || left.note.id.localeCompare(right.note.id))
    .map(entry => entry.note);
}
