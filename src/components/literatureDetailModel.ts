import type { LiteratureType, MetadataSource } from "@research-assistant/core/literature";
import type { ContentTrustNode, ContentTrustStatus } from "@research-assistant/core/content-trust";

export const LITERATURE_DETAIL_PREFERENCES_STORAGE_KEY =
  "research-assistant:literature-detail-preferences:v1";

export type LiteratureBasicFieldKey =
  | "itemType"
  | "issuedYear"
  | "containerTitle"
  | "conferenceName"
  | "proceedingsTitle"
  | "place"
  | "volumeIssuePages"
  | "doi"
  | "tags"
  | "language"
  | "url"
  | "bibtexKey"
  | "abstractText";

export interface LiteratureBasicFieldDefinition {
  readonly key: LiteratureBasicFieldKey;
  readonly label: string;
  readonly provenanceFields: readonly string[];
}

/**
 * The local metadata model deliberately exposes only the Zotero fields that it
 * can represent.  Zotero resolves its item-pane rows from
 * `ItemFields.getItemTypeFields(itemTypeID)`, rather than rendering one
 * universal form; these profiles preserve that rule at our smaller boundary.
 */
const COMMON_BASIC_FIELDS = [
  "itemType",
  "issuedYear",
  "doi",
  "tags",
  "language",
  "url",
  "bibtexKey",
  "abstractText",
] as const satisfies readonly LiteratureBasicFieldKey[];

const LITERATURE_BASIC_FIELDS_BY_TYPE = {
  journalArticle: [...COMMON_BASIC_FIELDS, "containerTitle", "volumeIssuePages"],
  magazineArticle: [...COMMON_BASIC_FIELDS, "containerTitle", "volumeIssuePages"],
  newspaperArticle: [...COMMON_BASIC_FIELDS, "containerTitle", "place", "volumeIssuePages"],
  conferencePaper: [...COMMON_BASIC_FIELDS, "conferenceName", "proceedingsTitle", "place", "volumeIssuePages"],
  book: [...COMMON_BASIC_FIELDS, "place", "volumeIssuePages"],
  bookSection: [...COMMON_BASIC_FIELDS, "containerTitle", "place", "volumeIssuePages"],
  preprint: [...COMMON_BASIC_FIELDS],
  manuscript: [...COMMON_BASIC_FIELDS, "place", "volumeIssuePages"],
  thesis: [...COMMON_BASIC_FIELDS, "place"],
  report: [...COMMON_BASIC_FIELDS, "place", "volumeIssuePages"],
  dataset: [...COMMON_BASIC_FIELDS],
  computerProgram: [...COMMON_BASIC_FIELDS, "place"],
  webpage: [...COMMON_BASIC_FIELDS, "containerTitle"],
  standard: [...COMMON_BASIC_FIELDS, "place"],
  patent: [...COMMON_BASIC_FIELDS, "place", "volumeIssuePages"],
  document: [...COMMON_BASIC_FIELDS, "place"],
} as const satisfies Readonly<Record<LiteratureType, readonly LiteratureBasicFieldKey[]>>;



/**
 * Creator choices are the subset of Zotero's `itemTypeCreatorTypes` schema
 * represented by the local creator model. Imported legacy roles remain
 * displayable and editable; this list only controls new selections.
 */
const CREATOR_ROLES_BY_TYPE = {
  journalArticle: ["author", "contributor", "editor", "translator", "reviewedAuthor"],
  magazineArticle: ["author", "contributor", "translator", "reviewedAuthor"],
  newspaperArticle: ["author", "contributor", "translator", "reviewedAuthor"],
  conferencePaper: ["author", "contributor", "editor", "translator", "seriesEditor"],
  book: ["author", "contributor", "editor", "translator", "seriesEditor"],
  bookSection: ["author", "contributor", "editor", "bookAuthor", "translator", "seriesEditor"],
  preprint: ["author", "contributor", "editor", "translator"],
  manuscript: ["author", "contributor", "translator"],
  thesis: ["author", "contributor"],
  report: ["author", "contributor", "translator", "seriesEditor"],
  dataset: ["author", "contributor"],
  computerProgram: ["programmer", "contributor"],
  webpage: ["author", "contributor", "translator"],
  standard: ["author", "contributor"],
  patent: ["inventor", "attorneyAgent", "contributor"],
  document: ["author", "contributor", "editor", "translator", "reviewedAuthor"],
} as const satisfies Readonly<Record<LiteratureType, readonly string[]>>;

export interface LiteratureDetailPreferences {
  readonly detailPaneRatio: number;
  readonly basicFields: readonly LiteratureBasicFieldKey[];
}

export type MetadataReviewStatus = "confirmed" | "pending" | "unknown";

export const DEFAULT_DETAIL_PANE_RATIO = 0.375;
export const MINIMUM_DETAIL_PANE_WIDTH = 300;
export const MINIMUM_LITERATURE_LIST_WIDTH = 420;
export const MAXIMUM_DETAIL_PANE_RATIO = 0.55;

export const LITERATURE_BASIC_FIELDS: readonly LiteratureBasicFieldDefinition[] = [
  { key: "itemType", label: "条目类型", provenanceFields: ["itemType"] },
  { key: "issuedYear", label: "年份", provenanceFields: ["issuedYear"] },
  { key: "containerTitle", label: "来源 / 容器", provenanceFields: ["containerTitle"] },
  { key: "conferenceName", label: "会议名称", provenanceFields: ["conferenceName"] },
  { key: "proceedingsTitle", label: "会议录标题", provenanceFields: ["proceedingsTitle"] },
  { key: "place", label: "地点", provenanceFields: ["place"] },
  { key: "volumeIssuePages", label: "卷期页", provenanceFields: ["volume", "issue", "pages"] },
  { key: "doi", label: "DOI", provenanceFields: ["doi"] },
  { key: "tags", label: "标签", provenanceFields: ["tags"] },
  { key: "language", label: "语言", provenanceFields: ["language"] },
  { key: "url", label: "URL", provenanceFields: ["url"] },
  { key: "bibtexKey", label: "BibTeX Key", provenanceFields: ["bibtexKey"] },
  { key: "abstractText", label: "摘要", provenanceFields: ["abstractText"] },
];

export const DEFAULT_LITERATURE_BASIC_FIELDS: readonly LiteratureBasicFieldKey[] = [
  "issuedYear",
  "containerTitle",
  "volumeIssuePages",
  "doi",
  "tags",
];

export const DEFAULT_LITERATURE_DETAIL_PREFERENCES: LiteratureDetailPreferences = {
  detailPaneRatio: DEFAULT_DETAIL_PANE_RATIO,
  basicFields: DEFAULT_LITERATURE_BASIC_FIELDS,
};

const BASIC_FIELD_KEYS = new Set(LITERATURE_BASIC_FIELDS.map((field) => field.key));

export function basicFieldsForLiteratureType(itemType: LiteratureType): readonly LiteratureBasicFieldKey[] {
  return LITERATURE_BASIC_FIELDS_BY_TYPE[itemType];
}

export function isBasicFieldApplicable(
  itemType: LiteratureType,
  field: LiteratureBasicFieldKey,
): boolean {
  return basicFieldsForLiteratureType(itemType).includes(field);
}

export function defaultBasicFieldsForLiteratureType(
  itemType: LiteratureType,
): readonly LiteratureBasicFieldKey[] {
  const applicable = basicFieldsForLiteratureType(itemType);
  if (itemType === "conferencePaper") {
    const defaults: readonly LiteratureBasicFieldKey[] = [
      "issuedYear", "proceedingsTitle", "volumeIssuePages", "doi", "tags",
    ];
    return defaults
      .filter((field) => applicable.includes(field));
  }
  return DEFAULT_LITERATURE_BASIC_FIELDS.filter((field) => applicable.includes(field));
}

export {primaryCreatorRoleForLiteratureType} from "@research-assistant/core/literature";

export function creatorRolesForLiteratureType(itemType: LiteratureType): readonly string[] {
  return CREATOR_ROLES_BY_TYPE[itemType];
}

export function creatorRoleLabel(role: string): string {
  const normalized = role.trim().toLowerCase();
  const labels: Readonly<Record<string, string>> = {
    author: "作者",
    contributor: "贡献者",
    editor: "编辑",
    translator: "译者",
    serieseditor: "丛书编辑",
    bookauthor: "书籍作者",
    inventor: "发明人",
    attorneyagent: "专利代理人",
    programmer: "程序员",
    reviewedauthor: "被评作者",
  };
  return labels[normalized] ?? "贡献者";
}

export function basicFieldLabel(
  field: LiteratureBasicFieldKey,
  itemType: LiteratureType,
): string {
  if (field !== "containerTitle") {
    return LITERATURE_BASIC_FIELDS.find((definition) => definition.key === field)?.label ?? field;
  }
  const labels: Partial<Record<LiteratureType, string>> = {
    journalArticle: "期刊",
    magazineArticle: "杂志",
    newspaperArticle: "报纸",
    bookSection: "书名",
    webpage: "网站标题",
  };
  return labels[itemType] ?? "来源 / 容器";
}

export function normalizeLiteratureDetailPreferences(
  value: unknown,
): LiteratureDetailPreferences {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return DEFAULT_LITERATURE_DETAIL_PREFERENCES;
  }
  const record = value as Record<string, unknown>;
  const detailPaneRatio = typeof record.detailPaneRatio === "number" && Number.isFinite(record.detailPaneRatio)
    ? Math.min(Math.max(record.detailPaneRatio, 0), MAXIMUM_DETAIL_PANE_RATIO)
    : DEFAULT_DETAIL_PANE_RATIO;
  const rawFields = Array.isArray(record.basicFields) ? record.basicFields : undefined;
  const basicFields = rawFields === undefined
    ? DEFAULT_LITERATURE_BASIC_FIELDS
    : [...new Set(rawFields.filter((field): field is LiteratureBasicFieldKey => (
      typeof field === "string" && BASIC_FIELD_KEYS.has(field as LiteratureBasicFieldKey)
    )))];
  return { detailPaneRatio, basicFields };
}

export function resolveLiteratureDetailWidth(
  containerWidth: number,
  preferredRatio: number,
): number {
  const maximumByList = Math.max(
    MINIMUM_DETAIL_PANE_WIDTH,
    containerWidth - MINIMUM_LITERATURE_LIST_WIDTH,
  );
  const maximumByRatio = containerWidth * MAXIMUM_DETAIL_PANE_RATIO;
  const preferredWidth = containerWidth * preferredRatio;
  return Math.round(Math.min(
    Math.max(preferredWidth, MINIMUM_DETAIL_PANE_WIDTH),
    maximumByList,
    maximumByRatio,
  ));
}

export function detailPaneRatioFromWidth(containerWidth: number, detailWidth: number): number {
  if (!Number.isFinite(containerWidth) || containerWidth <= 0) return DEFAULT_DETAIL_PANE_RATIO;
  return resolveLiteratureDetailWidth(containerWidth, detailWidth / containerWidth) / containerWidth;
}

export function metadataReviewStatus(
  sources: readonly MetadataSource[],
  fieldNames?: readonly string[],
): MetadataReviewStatus {
  const included = fieldNames === undefined
    ? sources
    : sources.filter((source) => fieldNames.includes(source.fieldName));
  if (included.length === 0) return "unknown";
  return included.some((source) => !source.confirmedByUser) ? "pending" : "confirmed";
}

export function metadataSourceTrustStatus(source: MetadataSource): ContentTrustStatus {
  if (source.confirmedByUser) return "trusted";
  const sourceKind = source.sourceKind.trim().toLowerCase();
  if (["ai", "llm", "model", "codex"].some((token) => sourceKind.includes(token))) {
    return "untrusted";
  }
  return "reviewable";
}

export function metadataTrustTree(
  sources: readonly MetadataSource[],
  labels: Readonly<Record<string, string>> = {},
): ContentTrustNode {
  return {
    id: "literature-metadata",
    label: "文献基础信息",
    children: sources.map((source) => ({
      id: source.fieldName,
      label: labels[source.fieldName] ?? source.fieldName,
      directStatus: metadataSourceTrustStatus(source),
      confirmable: !source.confirmedByUser,
    })),
  };
}

export function firstPendingMetadataField(sources: readonly MetadataSource[]): string | undefined {
  return sources.find((source) => !source.confirmedByUser)?.fieldName;
}
