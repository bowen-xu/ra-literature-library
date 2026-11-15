// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { LiteratureItem, MetadataPreview } from "@research-assistant/core/literature";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LiteratureMetadataDialog } from "./LiteratureMetadataDialog";
import { LiteratureSummary } from "./LiteratureSummary";
import { DEFAULT_LITERATURE_BASIC_FIELDS } from "./literatureDetailModel";

function item(): LiteratureItem {
  return {
    id: "paper-1",
    itemType: "journalArticle",
    title: "Traceable research",
    abstractText: "A bounded abstract.",
    issuedYear: 2026,
    containerTitle: "Research Journal",
    volume: "12",
    issue: "3",
    pages: "10-20",
    doi: "10.1000/test",
    url: "https://example.test/paper",
    language: "en",
    bibtexKey: "traceable2026",
    creators: [{ familyName: "Xu", givenName: "Bo", literalName: "", role: "author" }],
    tags: ["evidence"],
    readingStatus: "unread",
    attachments: [],
    projectIds: ["project-1"],
    metadataSources: [
      { fieldName: "title", sourceKind: "crossref", confirmedByUser: true },
      { fieldName: "creators", sourceKind: "user", confirmedByUser: true },
      { fieldName: "doi", sourceKind: "crossref", confirmedByUser: false },
    ],
    createdAt: "2026-08-06T00:00:00.000Z",
    updatedAt: "2026-08-06T00:00:00.000Z",
  };
}

function button(scope: ParentNode, label: string): HTMLButtonElement {
  const match = [...scope.querySelectorAll("button")].find((candidate) => (
    candidate.textContent?.replace(/\s+/g, "").includes(label.replace(/\s+/g, ""))
    || candidate.getAttribute("aria-label") === label
  ));
  if (match === undefined) throw new Error(`missing button ${label}`);
  return match;
}

function setInputValue(input: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const prototype = input instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function setSelectValue(select: HTMLSelectElement, value: string): void {
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set?.call(select, value);
  select.dispatchEvent(new Event("change", { bubbles: true }));
}

describe("literature metadata presentation", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
      .IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function dialog(overrides: Partial<React.ComponentProps<typeof LiteratureMetadataDialog>> = {}) {
    return (
      <LiteratureMetadataDialog
        focusFieldName={undefined}
        isReadOnly={false}
        item={item()}
        onApplyCandidateFields={vi.fn(async () => item())}
        onClose={() => undefined}
        onConfirmFields={vi.fn(async () => item())}
        onError={() => undefined}
        onPreviewDoi={vi.fn()}
        onRejectCandidate={vi.fn(async () => undefined)}
        onSuccess={() => undefined}
        onUpdateField={vi.fn(async () => item())}
        {...overrides}
      />
    );
  }

  it("shows the configured summary without provenance tags or project membership", async () => {
    const onToggleBasicField = vi.fn();
    await act(async () => root.render(
      <LiteratureSummary
        basicFields={DEFAULT_LITERATURE_BASIC_FIELDS}
        isFieldPickerOpen={false}
        item={item()}
        onCloseFieldPicker={() => undefined}
        onOpenDetails={() => undefined}
        onOpenPendingDetails={() => undefined}
        onResetBasicFields={() => undefined}
        onToggleBasicField={onToggleBasicField}
        onToggleFieldPicker={() => undefined}
      />,
    ));

    expect(document.querySelector("h2")?.textContent).toBe("Traceable research");
    expect(document.body.textContent).toContain("Bo Xu");
    expect(document.body.textContent).toContain("Research Journal");
    expect(document.body.textContent).not.toContain("未读");
    expect(document.body.textContent).not.toContain("所属项目");
    expect(document.body.textContent).not.toContain("字段来源");
    const summaryStatus = document.querySelector('[aria-label="文献基础信息：较可信：自动提取或人工编辑，尚未确认"]');
    expect(summaryStatus?.classList).toContain("reviewable");
    const controls = [...document.querySelectorAll<HTMLButtonElement>(".literature-summary-controls button")];
    expect(controls.map((control) => control.getAttribute("aria-label"))).toEqual([
      "查看文献详情",
      "配置基本信息字段",
      "文献基础信息：较可信：自动提取或人工编辑，尚未确认",
    ]);
    expect(controls[0]?.classList).toContain("summary-hover-action");
    expect(controls[2]?.classList).not.toContain("summary-hover-action");
  });

  it("replaces the summary DOM when switching literature items", async () => {
    const summaryProps = {
      basicFields: DEFAULT_LITERATURE_BASIC_FIELDS,
      isFieldPickerOpen: false,
      onCloseFieldPicker: () => undefined,
      onOpenDetails: () => undefined,
      onOpenPendingDetails: () => undefined,
      onResetBasicFields: () => undefined,
      onToggleBasicField: () => undefined,
      onToggleFieldPicker: () => undefined,
    } as const;
    await act(async () => root.render(
      <LiteratureSummary {...summaryProps} item={item()} />,
    ));
    const previousSummary = document.querySelector<HTMLElement>(".literature-summary");
    const previousDoi = [...document.querySelectorAll(".metadata-list dd")]
      .find((node) => node.textContent === "10.1000/test");

    await act(async () => root.render(
      <LiteratureSummary
        {...summaryProps}
        item={{ ...item(), id: "paper-2", doi: "10.48550/arXiv.2409.00853" }}
      />,
    ));

    expect(previousSummary?.isConnected).toBe(false);
    expect(previousDoi?.isConnected).toBe(false);
    expect(document.querySelectorAll(".literature-summary")).toHaveLength(1);
    expect(document.body.textContent).toContain("10.48550/arXiv.2409.00853");
    expect(document.body.textContent).not.toContain("10.1000/test");
  });

  it("keeps incremental rendering for updates to the selected literature item", async () => {
    const summaryProps = {
      basicFields: DEFAULT_LITERATURE_BASIC_FIELDS,
      isFieldPickerOpen: false,
      onCloseFieldPicker: () => undefined,
      onOpenDetails: () => undefined,
      onOpenPendingDetails: () => undefined,
      onResetBasicFields: () => undefined,
      onToggleBasicField: () => undefined,
      onToggleFieldPicker: () => undefined,
    } as const;
    await act(async () => root.render(
      <LiteratureSummary {...summaryProps} item={item()} />,
    ));
    const summary = document.querySelector<HTMLElement>(".literature-summary");

    await act(async () => root.render(
      <LiteratureSummary
        {...summaryProps}
        item={{ ...item(), doi: "10.1000/reviewed" }}
      />,
    ));

    expect(document.querySelector(".literature-summary")).toBe(summary);
    expect(document.body.textContent).toContain("10.1000/reviewed");
    expect(document.body.textContent).not.toContain("10.1000/test");
  });

  it("configures basic fields from the anchored picker", async () => {
    const onToggleBasicField = vi.fn();
    await act(async () => root.render(
      <LiteratureSummary
        basicFields={DEFAULT_LITERATURE_BASIC_FIELDS}
        isFieldPickerOpen
        item={item()}
        onCloseFieldPicker={() => undefined}
        onOpenDetails={() => undefined}
        onOpenPendingDetails={() => undefined}
        onResetBasicFields={() => undefined}
        onToggleBasicField={onToggleBasicField}
        onToggleFieldPicker={() => undefined}
      />,
    ));
    await act(async () => button(document, "语言").click());
    expect(onToggleBasicField).toHaveBeenCalledWith("language");
  });

  it("shows the title once, groups details, and confirms a pending field from its dot", async () => {
    const onConfirmFields = vi.fn(async () => item());
    await act(async () => root.render(dialog({
      focusFieldName: "doi",
      item: {
        ...item(),
        metadataSources: [
          ...item().metadataSources,
          { fieldName: "abstractText", sourceKind: "ai", confirmedByUser: false },
        ],
      },
      onConfirmFields,
    })));

    expect([...document.querySelectorAll("h2")].map((node) => node.textContent)).toEqual(["Traceable research"]);
    expect([...document.querySelectorAll(".metadata-detail-section > h3")].map((node) => node.textContent)).toEqual([
      "创作者", "出版信息", "标识与链接", "标签", "摘要",
    ]);
    expect(document.body.textContent).not.toContain("crossref");
    expect(document.body.textContent).not.toContain("user");
    const doiRow = document.querySelector<HTMLElement>('[data-metadata-field="doi"]');
    const titleRow = document.querySelector<HTMLElement>('[data-metadata-field="title"]');
    const yearRow = document.querySelector<HTMLElement>('[data-metadata-field="issuedYear"]');
    const abstractRow = document.querySelector<HTMLElement>('[data-metadata-field="abstractText"]');
    expect(document.activeElement).toBe(doiRow);
    expect(titleRow?.querySelector(".content-trust-indicator")).toBeNull();
    expect(yearRow?.querySelector(".content-trust-indicator")).toBeNull();
    expect(doiRow?.querySelector(".content-trust-indicator.reviewable")).not.toBeNull();
    expect(abstractRow?.querySelector(".content-trust-indicator.untrusted")).not.toBeNull();
    expect(button(doiRow ?? document, "DOI：较可信：自动提取或人工编辑，尚未确认")).not.toBeNull();
    await act(async () => button(doiRow ?? container, "DOI：较可信：自动提取或人工编辑，尚未确认").click());
    expect(onConfirmFields).toHaveBeenCalledWith(["doi"]);
  });

  it("hides resolved green and neutral status dots throughout literature details", async () => {
    await act(async () => root.render(dialog({
      item: {
        ...item(),
        metadataSources: item().metadataSources.map((source) => ({
          ...source,
          confirmedByUser: true,
        })),
      },
    })));

    expect(document.querySelectorAll(".content-trust-indicator")).toHaveLength(0);
  });

  it("uses Zotero-style type-specific fields for conference items", async () => {
    await act(async () => root.render(dialog()));
    expect(document.querySelector('[data-metadata-field="conferenceName"]')).toBeNull();

    await act(async () => root.render(dialog({
      item: {
        ...item(),
        itemType: "conferencePaper",
        conferenceName: "AGI",
        proceedingsTitle: "Artificial General Intelligence",
        place: "Reykjavik, Iceland",
      },
    })));
    expect(document.querySelector('[data-metadata-field="conferenceName"]')?.textContent).toContain("AGI");
    expect(document.querySelector('[data-metadata-field="proceedingsTitle"]')?.textContent).toContain("Artificial General Intelligence");
    expect(document.querySelector('[data-metadata-field="place"]')?.textContent).toContain("Reykjavik, Iceland");
    expect(document.querySelector('[data-metadata-field="containerTitle"]')).toBeNull();
  });

  it("switches the visible field set as soon as an item type is selected", async () => {
    await act(async () => root.render(dialog({
      item: {
        ...item(),
        itemType: "conferencePaper",
        conferenceName: "AGI",
        proceedingsTitle: "Proceedings",
        place: "Reykjavik",
      },
    })));

    const itemType = document.querySelector<HTMLElement>('[data-metadata-field="itemType"]');
    await act(async () => itemType?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true })));
    const selector = document.querySelector<HTMLSelectElement>('select[aria-label="条目类型"]');
    await act(async () => {
      if (selector !== null) setSelectValue(selector, "journalArticle");
    });

    expect(document.querySelector('[data-metadata-field="conferenceName"]')).toBeNull();
    expect(document.querySelector('[data-metadata-field="proceedingsTitle"]')).toBeNull();
    expect(document.querySelector('[data-metadata-field="containerTitle"]')).not.toBeNull();
  });

  it("keeps secondary creator roles visible without mixing them into the paper author", async () => {
    await act(async () => root.render(dialog({
      item: {
        ...item(),
        itemType: "conferencePaper",
        creators: [
          { familyName: "Xu", givenName: "Bo", literalName: "", role: "author" },
          { familyName: "Iklé", givenName: "Matthew", literalName: "", role: "editor" },
        ],
      },
    })));

    const creators = document.querySelector('[data-metadata-field="creators"]');
    expect(creators?.textContent).toContain("Bo Xu");
    expect(creators?.textContent).toContain("编辑：Matthew Iklé");
  });

  it("edits creator roles from the selected item type without discarding other creators", async () => {
    const onUpdateField = vi.fn(async () => item());
    await act(async () => root.render(dialog({
      item: {
        ...item(),
        itemType: "conferencePaper",
        creators: [
          { familyName: "Xu", givenName: "Bo", literalName: "", role: "author" },
          { familyName: "Iklé", givenName: "Matthew", literalName: "", role: "editor" },
        ],
      },
      onUpdateField,
    })));

    const creatorField = document.querySelector<HTMLElement>('[data-metadata-field="creators"]');
    await act(async () => creatorField?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true })));
    const firstRole = document.querySelector<HTMLSelectElement>('select[aria-label="创作者角色 1"]');
    expect([...firstRole?.options ?? []].map((option) => option.value)).toEqual([
      "author", "contributor", "editor", "translator", "seriesEditor",
    ]);
    await act(async () => {
      if (firstRole !== null) setSelectValue(firstRole, "editor");
      button(creatorField ?? document, "保存").click();
    });
    expect(onUpdateField).toHaveBeenCalledWith({
      fieldName: "creators",
      value: [
        { familyName: "Xu", givenName: "Bo", literalName: "", role: "editor" },
        { familyName: "Iklé", givenName: "Matthew", literalName: "", role: "editor" },
      ],
    });
  });

  it("edits one field in place with Enter and ignores unchanged blur", async () => {
    const onUpdateField = vi.fn(async () => item());
    await act(async () => root.render(dialog({ onUpdateField })));
    const titleField = document.querySelector<HTMLElement>('[data-metadata-field="title"]');
    await act(async () => titleField?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true })));
    const titleInput = document.querySelector<HTMLInputElement>('input[aria-label="标题"]');
    expect(titleInput).not.toBeNull();
    await act(async () => {
      if (titleInput !== null) setInputValue(titleInput, "A precise title");
      titleInput?.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Enter" }));
    });
    expect(onUpdateField).toHaveBeenCalledWith({ fieldName: "title", value: "A precise title" });

    const yearField = document.querySelector<HTMLElement>('[data-metadata-field="issuedYear"]');
    await act(async () => yearField?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true })));
    const yearInput = document.querySelector<HTMLInputElement>('input[aria-label="年份"]');
    await act(async () => yearInput?.dispatchEvent(new FocusEvent("blur", { bubbles: true })));
    expect(onUpdateField).toHaveBeenCalledTimes(1);
  });

  it("uses Cmd/Ctrl+Enter for an abstract and Esc to cancel inline editing", async () => {
    const onUpdateField = vi.fn(async () => item());
    await act(async () => root.render(dialog({ onUpdateField })));
    const abstractField = document.querySelector<HTMLElement>('[data-metadata-field="abstractText"]');
    await act(async () => abstractField?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true })));
    const textarea = document.querySelector<HTMLTextAreaElement>('textarea[aria-label="摘要"]');
    await act(async () => {
      if (textarea !== null) setInputValue(textarea, "Updated abstract");
      textarea?.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Enter", metaKey: true }));
    });
    expect(onUpdateField).toHaveBeenCalledWith({ fieldName: "abstractText", value: "Updated abstract" });

    const volumeField = document.querySelector<HTMLElement>('[data-metadata-field="volume"]');
    await act(async () => volumeField?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true })));
    const volumeInput = document.querySelector<HTMLInputElement>('input[aria-label="卷"]');
    await act(async () => volumeInput?.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" })));
    expect(document.querySelector('input[aria-label="卷"]')).toBeNull();
    expect(onUpdateField).toHaveBeenCalledTimes(1);
  });

  it("keeps trash metadata read-only", async () => {
    const onUpdateField = vi.fn(async () => item());
    await act(async () => root.render(dialog({ isReadOnly: true, onUpdateField })));
    const titleField = document.querySelector<HTMLElement>('[data-metadata-field="title"]');
    await act(async () => titleField?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true })));
    expect(document.querySelector('input[aria-label="标题"]')).toBeNull();
    expect(document.querySelector('[aria-label="DOI：较可信：自动提取或人工编辑，尚未确认"]')).not.toBeNull();
    expect(onUpdateField).not.toHaveBeenCalled();
  });

  it("reviews DOI differences in place and applies explicit field choices", async () => {
    const preview: MetadataPreview = {
      id: "candidate-1",
      importJobId: "job-1",
      itemId: "paper-1",
      sourceKind: "crossref",
      sourceReference: "10.1000/test",
      draft: { ...item(), title: "Candidate title", doi: "10.1000/candidate" },
      diffs: [
        { fieldName: "title", currentValue: "Traceable research", candidateValue: "Candidate title", userConfirmed: true },
        { fieldName: "doi", currentValue: "10.1000/test", candidateValue: "10.1000/candidate", userConfirmed: false },
      ],
    };
    const onApplyCandidateFields = vi.fn(async () => item());
    await act(async () => root.render(dialog({
      onApplyCandidateFields,
      onPreviewDoi: vi.fn(async () => preview),
    })));
    await act(async () => button(document, "刷新 DOI 元数据").click());

    const titleCurrent = document.querySelector<HTMLInputElement>('input[name="candidate-title"][type="radio"]');
    const doiCandidate = [...document.querySelectorAll<HTMLInputElement>('input[name="candidate-doi"]')]
      .find((input) => input.parentElement?.textContent?.includes("采用候选"));
    expect(titleCurrent?.checked).toBe(true);
    expect(doiCandidate?.checked).toBe(true);
    await act(async () => button(document, "应用所选").click());
    expect(onApplyCandidateFields).toHaveBeenCalledWith("candidate-1", [
      { fieldName: "title", choice: "current" },
      { fieldName: "doi", choice: "candidate" },
    ], "reviewable");
  });

  it("applies every DOI candidate value with an explicit trusted state", async () => {
    const preview: MetadataPreview = {
      id: "candidate-all",
      importJobId: "job-all",
      itemId: "paper-1",
      sourceKind: "crossref",
      sourceReference: "10.1000/test",
      draft: { ...item(), title: "Candidate title", doi: "10.1000/candidate" },
      diffs: [
        { fieldName: "title", currentValue: "Traceable research", candidateValue: "Candidate title", userConfirmed: true },
        { fieldName: "doi", currentValue: "10.1000/test", candidateValue: "10.1000/candidate", userConfirmed: false },
      ],
    };
    const onApplyCandidateFields = vi.fn(async () => item());
    await act(async () => root.render(dialog({
      onApplyCandidateFields,
      onPreviewDoi: vi.fn(async () => preview),
    })));
    await act(async () => button(document, "刷新 DOI 元数据").click());
    const trusted = [...document.querySelectorAll<HTMLInputElement>('input[name="candidate-trust"]')]
      .find((input) => input.parentElement?.textContent?.includes("可信（绿）"));
    await act(async () => trusted?.click());
    await act(async () => button(document, "应用全部新值").click());
    expect(onApplyCandidateFields).toHaveBeenCalledWith("candidate-all", [
      { fieldName: "title", choice: "candidate" },
      { fieldName: "doi", choice: "candidate" },
    ], "trusted");
  });

  it("shows non-fatal DOI enrichment warnings beside candidate actions", async () => {
    const preview: MetadataPreview = {
      id: "candidate-warning",
      importJobId: "job-warning",
      itemId: "paper-1",
      sourceKind: "doi.org:crossref-unixref-xml",
      sourceReference: "10.1000/test",
      draft: { ...item(), itemType: "bookSection" },
      diffs: [{ fieldName: "itemType", currentValue: "journalArticle", candidateValue: "bookSection", userConfirmed: false }],
      warnings: ["出版商页面补充失败；已保留 DOI 基础元数据"],
    };
    await act(async () => root.render(dialog({ onPreviewDoi: vi.fn(async () => preview) })));
    await act(async () => button(document, "刷新 DOI 元数据").click());
    expect(document.querySelector('[role="status"]')?.textContent).toContain("已保留 DOI 基础元数据");
  });

  it("dismisses an identical DOI candidate without writing metadata", async () => {
    const onRejectCandidate = vi.fn(async () => undefined);
    const onApplyCandidateFields = vi.fn(async () => item());
    const onSuccess = vi.fn();
    await act(async () => root.render(dialog({
      onApplyCandidateFields,
      onPreviewDoi: vi.fn(async () => ({
        id: "candidate-identical",
        importJobId: "job-identical",
        itemId: "paper-1",
        sourceKind: "crossref",
        sourceReference: "10.1000/test",
        draft: item(),
        diffs: [],
      })),
      onRejectCandidate,
      onSuccess,
    })));
    await act(async () => button(document, "刷新 DOI 元数据").click());
    expect(onSuccess).toHaveBeenCalledWith("当前信息已是最新");
    expect(onRejectCandidate).toHaveBeenCalledWith("candidate-identical");
    expect(onApplyCandidateFields).not.toHaveBeenCalled();
  });

  it("routes structured DOI failures to the shared notification boundary", async () => {
    const onError = vi.fn();
    await act(async () => root.render(dialog({
      onError,
      onPreviewDoi: vi.fn().mockRejectedValue({
        code: "connector_error",
        message: "没有找到该 DOI 的元数据",
      }),
    })));

    await act(async () => button(document, "刷新 DOI 元数据").click());

    expect(onError).toHaveBeenCalledWith("没有找到该 DOI 的元数据");
    expect(document.querySelector(".metadata-dialog-error")).toBeNull();
    expect(document.body.textContent).not.toContain("[object Object]");
  });
});
