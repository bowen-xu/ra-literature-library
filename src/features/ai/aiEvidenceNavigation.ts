import type { AiEvidenceItem } from "@research-assistant/core/ai";
import type { ReadingNoteSource, ReadingNoteSourceState } from "@research-assistant/core/notes";

const sourceStates: Readonly<Record<AiEvidenceItem["currentAnchorStatus"], ReadingNoteSourceState>> = {
  exact: "exact",
  page_level: "page_only",
  stale: "needs_relocation",
  missing: "unavailable",
};

/** Converts a frozen AI evidence item into the reader's public navigation contract. */
export function readingSourceForAiEvidence(evidence: AiEvidenceItem): ReadingNoteSource {
  return {
    anchorId: evidence.anchorId,
    paperId: evidence.paperId,
    paperTitle: evidence.paperTitle,
    attachmentId: evidence.attachmentId,
    contentSha256: evidence.contentSha256,
    pageIndex: evidence.pageIndex,
    ...(evidence.pageLabel === undefined ? {} : { pageLabel: evidence.pageLabel }),
    rects: [],
    quoteExact: evidence.quoteExact,
    quotePrefix: evidence.quotePrefix,
    quoteSuffix: evidence.quoteSuffix,
    state: sourceStates[evidence.currentAnchorStatus],
  };
}

export interface AiSourceInspectionRequest {
  readonly source: ReadingNoteSource;
  readonly resolve: () => void;
  readonly reject: (reason: Error) => void;
}

/** Only the application host can acknowledge successful attachment-version navigation. */
export function inspectAiReadingSource(source: ReadingNoteSource): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new CustomEvent<AiSourceInspectionRequest>("research-assistant:inspect-reading-source", {
      detail: { source, resolve, reject }, cancelable: true,
    });
    if (window.dispatchEvent(request)) reject(new Error("当前界面无法打开来源；未记录原文核对。"));
  });
}
