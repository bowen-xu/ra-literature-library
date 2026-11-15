import type { ReadingNoteSource } from "@research-assistant/core/notes";
import type { ReaderLocation } from "@research-assistant/core/reader";

export function readingNoteLocation(source: ReadingNoteSource): ReaderLocation {
  const selector = source.selector;
  return {
    alignment: "center",
    pageIndex: source.pageIndex,
    ...(source.pageLabel === undefined ? {} : { pageLabel: source.pageLabel }),
    position: {
      ...(selector?.anchorId === undefined && source.anchorId === undefined
        ? {}
        : { anchorId: selector?.anchorId ?? source.anchorId }),
      attachmentSha256: selector?.attachmentSha256 ?? source.contentSha256,
      segments: selector?.segments ?? [{
        pageIndex: source.pageIndex,
        ...(source.pageLabel === undefined ? {} : { pageLabel: source.pageLabel }),
        rects: source.rects,
        exactText: source.quoteExact,
        prefix: source.quotePrefix,
        suffix: source.quoteSuffix,
      }],
    },
    history: "hard",
  };
}

export function readingNoteSegments(source: ReadingNoteSource): readonly {
  readonly pageIndex: number;
  readonly rects: readonly { readonly x: number; readonly y: number; readonly width: number; readonly height: number }[];
}[] {
  return source.selector?.segments ?? [{ pageIndex: source.pageIndex, rects: source.rects }];
}

export function isEditableTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || target instanceof HTMLSelectElement
    || (target instanceof HTMLElement && target.isContentEditable);
}
