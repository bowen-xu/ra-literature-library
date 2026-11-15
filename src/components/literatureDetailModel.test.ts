import { describe, expect, it } from "vitest";

import {
  DEFAULT_LITERATURE_DETAIL_PREFERENCES,
  basicFieldsForLiteratureType,
  creatorRolesForLiteratureType,
  defaultBasicFieldsForLiteratureType,
  detailPaneRatioFromWidth,
  firstPendingMetadataField,
  isBasicFieldApplicable,
  metadataReviewStatus,
  normalizeLiteratureDetailPreferences,
  primaryCreatorRoleForLiteratureType,
  resolveLiteratureDetailWidth,
} from "./literatureDetailModel";

describe("literature detail preferences", () => {
  it("decodes allowlisted fields and bounds the pane ratio", () => {
    expect(normalizeLiteratureDetailPreferences({
      detailPaneRatio: 9,
      basicFields: ["doi", "unknown", "doi", "abstractText"],
    })).toEqual({
      detailPaneRatio: 0.55,
      basicFields: ["doi", "abstractText"],
    });
  });

  it("falls back for malformed input and preserves an explicit empty field set", () => {
    expect(normalizeLiteratureDetailPreferences(null)).toBe(DEFAULT_LITERATURE_DETAIL_PREFERENCES);
    expect(normalizeLiteratureDetailPreferences({ basicFields: [] }).basicFields).toEqual([]);
  });

  it("resolves the default ratio while protecting both panes", () => {
    expect(resolveLiteratureDetailWidth(1_200, 0.375)).toBe(450);
    expect(resolveLiteratureDetailWidth(1_200, 0.9)).toBe(660);
    expect(resolveLiteratureDetailWidth(800, 0.1)).toBe(300);
    expect(detailPaneRatioFromWidth(1_200, 450)).toBe(0.375);
  });
});

describe("Zotero-derived item-type field profiles", () => {
  it("uses a conference-specific field set instead of the journal container field", () => {
    expect(basicFieldsForLiteratureType("conferencePaper")).toEqual(expect.arrayContaining([
      "conferenceName", "proceedingsTitle", "place", "volumeIssuePages",
    ]));
    expect(isBasicFieldApplicable("conferencePaper", "containerTitle")).toBe(false);
    expect(defaultBasicFieldsForLiteratureType("conferencePaper")).toEqual([
      "issuedYear", "proceedingsTitle", "volumeIssuePages", "doi", "tags",
    ]);
  });

  it("keeps journal and book-section container semantics separate", () => {
    expect(isBasicFieldApplicable("journalArticle", "containerTitle")).toBe(true);
    expect(isBasicFieldApplicable("bookSection", "containerTitle")).toBe(true);
    expect(isBasicFieldApplicable("book", "containerTitle")).toBe(false);
  });

  it("uses the type's primary creator role without treating editors as authors", () => {
    expect(primaryCreatorRoleForLiteratureType("conferencePaper")).toBe("author");
    expect(primaryCreatorRoleForLiteratureType("computerProgram")).toBe("programmer");
    expect(primaryCreatorRoleForLiteratureType("patent")).toBe("inventor");
  });

  it("uses Zotero's per-type role choices for new creator rows", () => {
    expect(creatorRolesForLiteratureType("conferencePaper")).toEqual([
      "author", "contributor", "editor", "translator", "seriesEditor",
    ]);
    expect(creatorRolesForLiteratureType("computerProgram")).toEqual(["programmer", "contributor"]);
    expect(creatorRolesForLiteratureType("patent")).toEqual(["inventor", "attorneyAgent", "contributor"]);
  });
});

describe("metadata review status", () => {
  const sources = [
    { fieldName: "title", sourceKind: "crossref", confirmedByUser: true },
    { fieldName: "doi", sourceKind: "crossref", confirmedByUser: false },
  ];

  it("distinguishes confirmed, pending, and unknown fields", () => {
    expect(metadataReviewStatus(sources)).toBe("pending");
    expect(metadataReviewStatus(sources, ["title"])).toBe("confirmed");
    expect(metadataReviewStatus(sources, ["language"])).toBe("unknown");
    expect(firstPendingMetadataField(sources)).toBe("doi");
  });
});
