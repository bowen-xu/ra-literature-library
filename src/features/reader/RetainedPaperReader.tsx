import { lazy, memo, Suspense, useCallback } from "react";
import type { PdfReaderProps } from "../../components/PdfReader";
import type { ResearchProject } from "@research-assistant/core/project";
import type { ReaderSession, ReaderSessionInput } from "./session/ReaderSessionRegistry";

const Reader = lazy(async () => ({default: (await import("./PaperReadingReader")).PaperReadingReader}));

/** Keep inactive PDF trees out of unrelated workspace updates. */
export const RetainedPaperReader = memo(function RetainedPaperReader({reader, selected, active, gateway, project, onOpen, onReviewChanged, onClose}: {
  readonly reader: ReaderSession;
  readonly selected: boolean;
  readonly active: boolean;
  readonly gateway: PdfReaderProps["gateway"];
  readonly project?: ResearchProject;
  readonly onOpen: (reader: ReaderSessionInput) => void;
  readonly onReviewChanged: () => Promise<void>;
  readonly onClose: (id: string) => void;
}) {
  const openAttachment = useCallback((attachment: PdfReaderProps["attachment"]) => onOpen({item: reader.item, attachment}), [onOpen, reader.item]);
  const close = useCallback(() => onClose(reader.id), [onClose, reader.id]);
  return <div className="reader-tab-surface" hidden={!selected}>
    <Suspense fallback={<div className="reader-workspace"><div className="detail-empty">正在载入 PDF 阅读器…</div></div>}>
      <Reader active={active} attachment={reader.attachment} gateway={gateway} item={reader.item}
        onOpenAttachment={openAttachment} onPaperReviewChanged={onReviewChanged} onCommitClose={close}
        {...(project === undefined ? {} : {project})} navigationRequestId={reader.navigationRequestId}
        {...(reader.source === undefined ? {} : {initialPageIndex: reader.source.pageIndex, sourceLocation: reader.source,
          ...(reader.source.anchorId === undefined ? {} : {focusAnchorId: reader.source.anchorId})})}/>
    </Suspense>
  </div>;
});
