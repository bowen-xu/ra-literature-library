import { useRef } from "react";
import { PdfPageThumbnail } from "./PdfPageThumbnail";
import type { PdfThumbnailSource } from "./PdfPageThumbnail";
import { usePdfThumbnailCacheWindow } from "@research-assistant/workbench-sdk/pdf";

interface PdfThumbnailListProps {
  readonly currentPageNumber: number;
  readonly source: PdfThumbnailSource;
  readonly onSelectPage: (pageIndex: number) => void;
  readonly renderingEnabled?: boolean;
  readonly revisionForPage?: (pageIndex: number) => string | number;
}

export function PdfThumbnailList({
  currentPageNumber,
  source,
  onSelectPage,
  renderingEnabled = true,
  revisionForPage,
}: PdfThumbnailListProps): React.JSX.Element {
  const listRef = useRef<HTMLDivElement>(null);
  const cachedPages = usePdfThumbnailCacheWindow({ listRef, pageCount: source.pageCount, currentPageNumber, renderingEnabled });
  return (
    <div aria-label="PDF 缩略图" className="thumbnail-list" ref={listRef} role="listbox">
      {Array.from({ length: source.pageCount }, (_, pageIndex) => {
        const pageNumber = pageIndex + 1;
        return (
          <PdfPageThumbnail
            active={pageNumber === currentPageNumber}
            cacheRetained={cachedPages.has(pageNumber)}
            key={pageNumber}
            onSelect={() => onSelectPage(pageIndex)}
            pageNumber={pageNumber}
            renderingEnabled={renderingEnabled}
            {...(revisionForPage === undefined ? {} : { revision: revisionForPage(pageIndex) })}
            source={source}
          />
        );
      })}
    </div>
  );
}
