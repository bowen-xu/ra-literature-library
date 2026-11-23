import { LITERATURE_TYPES, type ImportJob, type MetadataPreview } from "@research-assistant/core/literature";
import { describe, expect, it } from "vitest";

import {
  bestAttachmentForReveal,
  LITERATURE_TYPE_OPTIONS,
  shouldAutoDismissImportJob,
  shouldTrackMetadataPreviewJob,
  typeLabel,
} from "./literatureWorkspaceModel";

function job(state: string): ImportJob {
  return {
    id: "job-1",
    state,
    sourceKind: "pdf",
    totalCount: 1,
    completedCount: state === "running" ? 0 : 1,
    cancellationRequested: false,
    results: [],
    createdAt: "2026-08-04T00:00:00.000Z",
    updatedAt: "2026-08-04T00:00:00.000Z",
  };
}

describe("import job presentation", () => {
  it("auto-dismisses only fully successful imports", () => {
    expect(shouldAutoDismissImportJob(job("completed"))).toBe(true);
    expect(shouldAutoDismissImportJob(job("completed_with_errors"))).toBe(false);
    expect(shouldAutoDismissImportJob(job("failed"))).toBe(false);
    expect(shouldAutoDismissImportJob(job("running"))).toBe(false);
  });

  it("does not surface a no-difference DOI preview as an import-job notification", () => {
    const unchangedPreview = { diffs: [] } as Pick<MetadataPreview, "diffs">;
    const changedPreview = {
      diffs: [{ fieldName: "title", currentValue: "Current", candidateValue: "Candidate", userConfirmed: false }],
    } as Pick<MetadataPreview, "diffs">;

    expect(shouldTrackMetadataPreviewJob(unchangedPreview)).toBe(false);
    expect(shouldTrackMetadataPreviewJob(changedPreview)).toBe(true);
  });
});

describe("attachment reveal choice", () => {
  const item = {
    attachments: [
      { id: "snapshot", displayName: "snapshot.html", mimeType: "text/html", byteSize: 1, contentSha256: "a" },
      { id: "paper", displayName: "paper.pdf", mimeType: "application/pdf", byteSize: 2, contentSha256: "b" },
    ],
  };

  it("prefers the first PDF for a bibliographic item", () => {
    expect(bestAttachmentForReveal(item)?.id).toBe("paper");
  });

  it("falls back to the first stored attachment", () => {
    expect(bestAttachmentForReveal({ ...item, attachments: item.attachments.slice(0, 1) })?.id)
      .toBe("snapshot");
  });

  it("returns no target for an item without attachments", () => {
    expect(bestAttachmentForReveal({ ...item, attachments: [] })).toBeUndefined();
  });
});

describe("literature type presentation", () => {
  it("offers every supported domain type exactly once", () => {
    expect(LITERATURE_TYPE_OPTIONS.map((option) => option.value)).toEqual(LITERATURE_TYPES);
    expect(new Set(LITERATURE_TYPE_OPTIONS.map((option) => option.label)).size)
      .toBe(LITERATURE_TYPES.length);
  });

  it("represents a proceedings volume as a book and its papers separately", () => {
    expect(typeLabel("book")).toBe("书籍 / 会议录");
    expect(typeLabel("conferencePaper")).toBe("会议论文");
  });
});
