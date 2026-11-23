import type { LiteratureDraft, LiteratureItem, LiteratureMetadataPatch } from "@research-assistant/core/literature";
import { creatorRoleLabel, primaryCreatorRoleForLiteratureType } from "./literatureDetailModel";
import { typeLabel } from "./literatureWorkspaceModel";
type MetadataFieldName = LiteratureMetadataPatch["fieldName"];

export interface DetailField {
  readonly name: MetadataFieldName;
  readonly label: string;
  readonly hideLabel?: boolean;
  readonly wide?: boolean;
}

interface DetailSection {
  readonly title: string;
  readonly fields: readonly DetailField[];
}

export const TITLE_FIELD: DetailField = { name: "title", label: "标题" };
export const DETAIL_SECTIONS: readonly DetailSection[] = [
  { title: "创作者", fields: [{ name: "creators", label: "作者", hideLabel: true, wide: true }] },
  {
    title: "出版信息",
    fields: [
      { name: "itemType", label: "条目类型" },
      { name: "issuedYear", label: "年份" },
      { name: "containerTitle", label: "来源 / 容器", wide: true },
      { name: "conferenceName", label: "会议名称", wide: true },
      { name: "proceedingsTitle", label: "会议录标题", wide: true },
      { name: "place", label: "地点" },
      { name: "volume", label: "卷" },
      { name: "issue", label: "期" },
      { name: "pages", label: "页码" },
    ],
  },
  {
    title: "标识与链接",
    fields: [
      { name: "doi", label: "DOI", wide: true },
      { name: "url", label: "URL", wide: true },
      { name: "language", label: "语言" },
      { name: "bibtexKey", label: "BibTeX Key" },
    ],
  },
  { title: "标签", fields: [{ name: "tags", label: "标签", hideLabel: true, wide: true }] },
  { title: "摘要", fields: [{ name: "abstractText", label: "摘要", hideLabel: true, wide: true }] },
];

export const METADATA_FIELD_LABELS: Readonly<Record<string, string>> = Object.fromEntries([
  TITLE_FIELD,
  ...DETAIL_SECTIONS.flatMap((section) => section.fields),
].map((field) => [field.name, field.label]));

function creatorName(creator: LiteratureDraft["creators"][number]): string {
  return `${creator.givenName} ${creator.familyName}`.trim() || creator.literalName;
}

function creatorsValue(item: Pick<LiteratureDraft, "creators" | "itemType">): string {
  const primaryRole = primaryCreatorRoleForLiteratureType(item.itemType);
  const groups = new Map<string, string[]>();
  for (const creator of item.creators) {
    const name = creatorName(creator);
    if (name.length === 0) continue;
    groups.set(creator.role, [...(groups.get(creator.role) ?? []), name]);
  }
  const primaryNames = groups.get(primaryRole) ?? [];
  const secondary = [...groups.entries()]
    .filter(([role]) => role !== primaryRole)
    .map(([role, names]) => `${creatorRoleLabel(role)}：${names.join("、")}`);
  return [...primaryNames, ...secondary].join("；") || "—";
}

export function detailValue(item: LiteratureDraft, field: DetailField): string {
  if (field.name === "itemType") return typeLabel(item.itemType);
  if (field.name === "creators") return creatorsValue(item);
  if (field.name === "issuedYear") return item.issuedYear?.toString() ?? "—";
  if (field.name === "tags") return item.tags.join("、") || "—";
  const value = item[field.name];
  return typeof value === "string" && value.length > 0 ? value : "—";
}

export function editorValue(item: LiteratureItem, fieldName: Exclude<MetadataFieldName, "creators">): string {
  if (fieldName === "tags") return item.tags.join(", ");
  if (fieldName === "issuedYear") return item.issuedYear?.toString() ?? "";
  return item[fieldName] ?? "";
}

export function patchFromEditor(
  fieldName: Exclude<MetadataFieldName, "creators">,
  value: string,
): LiteratureMetadataPatch {
  if (fieldName === "issuedYear") {
    return { fieldName, value: value.trim() === "" ? null : Number(value) };
  }
  if (fieldName === "tags") {
    return {
      fieldName,
      value: value.split(",").map((tag) => tag.trim()).filter(Boolean),
    };
  }
  if (fieldName === "itemType") return { fieldName, value: value as LiteratureDraft["itemType"] };
  return { fieldName, value };
}

export function patchMatchesItem(item: LiteratureItem, patch: LiteratureMetadataPatch): boolean {
  if (patch.fieldName === "issuedYear") return (item.issuedYear ?? null) === patch.value;
  if (patch.fieldName === "creators" || patch.fieldName === "tags") {
    return JSON.stringify(item[patch.fieldName]) === JSON.stringify(patch.value);
  }
  return item[patch.fieldName] === patch.value.trim();
}
