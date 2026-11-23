import type {
  AttachmentSummary,
  ImportJob,
  LiteratureDraft,
  LiteratureItem,
  MetadataPreview,
  PdfImportCandidate,
} from "@research-assistant/core/literature";
import { LITERATURE_TYPE_OPTIONS } from "@research-assistant/core/literature";

export type ImportPanel = "pdf" | "bibtex" | "doi" | "manual" | undefined;
export type LibraryFilter = "all" | "with-pdf" | "unread" | "reading" | "read" | "active-project" | "trash";

export const terminalImportStates = new Set([
  "completed", "completed_with_errors", "failed", "cancelled", "interrupted",
]);

export function shouldAutoDismissImportJob(job: ImportJob): boolean {
  return job.state === "completed";
}

export function shouldTrackMetadataPreviewJob(preview: Pick<MetadataPreview, "diffs">): boolean {
  return preview.diffs.length > 0;
}

export function retryableImportResults(job: ImportJob): ImportJob["results"] {
  return job.results.filter((result) =>
    result.state === "failed" || (job.state === "interrupted" && result.state === "pending"));
}

export function creatorLabel(item: LiteratureItem): string {
  const authors = item.creators.filter((creator) => creator.role === "author");
  if (authors.length === 0) return "作者未知";
  const names = authors.map((creator) =>
    creator.literalName || creator.familyName || creator.givenName);
  return names.length > 2 ? `${names[0]} 等` : names.join("、");
}

export {LITERATURE_TYPE_OPTIONS} from "@research-assistant/core/literature";

export function typeLabel(type: LiteratureItem["itemType"]): string { return LITERATURE_TYPE_OPTIONS.find(option => option.value === type)!.label; }

export function bestAttachmentForReveal(
  item: Pick<LiteratureItem, "attachments">,
): AttachmentSummary | undefined {
  return item.attachments.find((attachment) => attachment.mimeType === "application/pdf")
    ?? item.attachments[0];
}

export function mergeMetadataCandidate(
  current: LiteratureItem,
  candidate: LiteratureDraft,
): LiteratureDraft {
  const { issuedYear: _currentYear, ...currentWithoutYear } = current;
  const issuedYear = candidate.issuedYear ?? current.issuedYear;
  const merged: LiteratureDraft = {
    ...currentWithoutYear,
    itemType: candidate.itemType,
    title: candidate.title || current.title,
    abstractText: candidate.abstractText || current.abstractText,
    containerTitle: candidate.containerTitle || current.containerTitle,
    conferenceName: candidate.conferenceName || current.conferenceName || "",
    proceedingsTitle: candidate.proceedingsTitle || current.proceedingsTitle || "",
    place: candidate.place || current.place || "",
    volume: candidate.volume || current.volume,
    issue: candidate.issue || current.issue,
    pages: candidate.pages || current.pages,
    doi: candidate.doi || current.doi,
    url: candidate.url || current.url,
    language: candidate.language || current.language,
    creators: candidate.creators.length > 0 ? candidate.creators : current.creators,
    sourceKind: "user",
  };
  return issuedYear === undefined ? merged : { ...merged, issuedYear };
}

export function downloadText(contents: string, filename: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([contents], { type: mime }));
  const anchor = window.document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function candidateFromPdfPath(path: string): PdfImportCandidate {
  const filename = path.split(/[\\/]/).pop() ?? "Untitled PDF";
  const title = filename.replace(/\.pdf$/i, "") || "Untitled PDF";
  return {
    path,
    draft: {
      itemType: "document",
      title,
      abstractText: "",
      containerTitle: "",
      conferenceName: "",
      proceedingsTitle: "",
      place: "",
      volume: "",
      issue: "",
      pages: "",
      doi: "",
      url: "",
      language: "",
      bibtexKey: "",
      creators: [],
      tags: [],
      sourceKind: "pdf_filename",
    },
  };
}

export function candidateFromRawInput(rawInput: string): PdfImportCandidate {
  try {
    const parsed = JSON.parse(rawInput) as Partial<PdfImportCandidate>;
    if (typeof parsed.path === "string" && parsed.draft !== undefined) {
      return parsed as PdfImportCandidate;
    }
  } catch {
    // Older local jobs stored the raw path directly.
  }
  return candidateFromPdfPath(rawInput);
}
