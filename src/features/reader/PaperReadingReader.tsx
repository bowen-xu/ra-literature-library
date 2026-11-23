import { useCallback, useMemo, useRef, useState } from "react";
import type { ResearchProject } from "@research-assistant/core/project";
import { PdfReader, type PdfReaderProps } from "../../components/PdfReader";
import { PaperOverviewPanel } from "../ai/PaperOverviewPanel";
import type { ReadingFieldSource } from "../ai/readingFieldSources";

/** Compose the shared reading panel and PDF source layer without coupling the PDF renderer to AI persistence. */
export function PaperReadingReader({ project, onOpenAttachment, onPaperReviewChanged, ...readerProps }: PdfReaderProps & {
  readonly project?: ResearchProject;
  readonly onOpenAttachment: (attachment: PdfReaderProps["attachment"]) => void;
  readonly onPaperReviewChanged: () => Promise<void>;
}): React.JSX.Element {
  const [sources, setSources] = useState<readonly ReadingFieldSource[]>([]);
  const [visible, setVisible] = useState(true);
  const live = useRef({onOpenAttachment, onPaperReviewChanged, attachmentId: readerProps.attachment.id});
  live.current = {onOpenAttachment, onPaperReviewChanged, attachmentId: readerProps.attachment.id};
  const open = useCallback((attachment: PdfReaderProps["attachment"]) => {
    if (attachment.id !== live.current.attachmentId) live.current.onOpenAttachment(attachment);
  }, []);
  const reviewChanged = useCallback(() => live.current.onPaperReviewChanged(), []);
  const toggleHighlights = useCallback(() => setVisible(value => !value), []);
  // A retained PDF session also owns its reading rail. Activation changes neither
  // its component identity nor its data subscriptions, editors or sidebar tabs.
  const readingPanel = useMemo(() => <PaperOverviewPanel item={readerProps.item} literatureGateway={readerProps.gateway}
    {...(project === undefined ? {} : { project })} currentAttachmentId={readerProps.attachment.id}
    onOpenAttachment={open} onPaperReviewChanged={reviewChanged} onReadingSourcesChanged={setSources}
    readingHighlightsVisible={visible} onReadingHighlightsVisibleChanged={toggleHighlights} />,
  [readerProps.item, readerProps.gateway, readerProps.attachment.id, project, open, reviewChanged, visible, toggleHighlights]);
  return <PdfReader {...readerProps} readingSources={visible ? sources : []} readingPanel={readingPanel} />;
}
