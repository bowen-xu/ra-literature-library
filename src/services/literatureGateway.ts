import {resolveLiteratureRuntimeGateway} from "@research-assistant/workbench-sdk/literature-runtime";
import {runtimeLiteratureGateway} from "./configureLiteratureServices";
import type { LiteratureGateway } from "../public/contracts/literatureGateway";
export type { LiteratureGateway } from "../public/contracts/literatureGateway";
import { getAppStorage } from "@research-assistant/workbench-sdk/storage";
import { purgeBrowserCollections } from "./browserCollectionStorage";
import { purgeBrowserNal } from "./browserNalStorage";
import { trashBrowserLiterature } from "./browserLiteratureTrash";
import type {LiteratureItem} from "@research-assistant/core/literature";
import {
  decodeReaderViewStateV2,
  type ReaderViewStateV2,
} from "@research-assistant/core/reader";

const BROWSER_STORAGE_KEY = "research-assistant.literature.v1";
const BROWSER_ANNOTATION_KEY = "research-assistant.annotations.v1";
const BROWSER_ARCHIVE_KEY = "research-assistant.literature-archive.v1";
const BROWSER_TRASH_KEY = "research-assistant.literature-trash.v1";
const BROWSER_READING_STATE_KEY = "research-assistant.reader-view-state.v2";
const TRASH_RETENTION_MS = 14 * 24 * 60 * 60 * 1000;

function readBrowserItems(): readonly LiteratureItem[] {
  const raw = getAppStorage().getItem(BROWSER_STORAGE_KEY);
  if (raw === null) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? (parsed as LiteratureItem[]).map((item) => ({
          ...item,
          projectIds: item.projectIds ?? [],
          metadataSources: item.metadataSources ?? [],
        }))
      : [];
  } catch {
    return [];
  }
}

function readBrowserReadingStates(): Record<string, ReaderViewStateV2> {
  const raw = getAppStorage().getItem(BROWSER_READING_STATE_KEY);
  if (raw === null) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed)
      .map(([key, value]) => [key, decodeReaderViewStateV2(value)] as const)
      .filter((entry): entry is readonly [string, ReaderViewStateV2] => entry[1] !== undefined));
  } catch {
    return {};
  }
}

interface LegacyBrowserAnnotation {
  readonly id: string;
  readonly itemId: string;
}

function readBrowserAnnotations(): readonly LegacyBrowserAnnotation[] {
  const raw = getAppStorage().getItem(BROWSER_ANNOTATION_KEY);
  if (raw === null) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as LegacyBrowserAnnotation[]) : [];
  } catch {
    return [];
  }
}

function readBrowserArchive(): readonly LiteratureItem[] {
  const raw = getAppStorage().getItem(BROWSER_ARCHIVE_KEY);
  if (raw === null) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as LiteratureItem[]) : [];
  } catch {
    return [];
  }
}

function readBrowserTrash(): readonly LiteratureItem[] {
  const raw = getAppStorage().getItem(BROWSER_TRASH_KEY);
  if (raw === null) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const items = parsed as LiteratureItem[];
    const retained = items.filter((item) => {
      const trashedAt = item.trashedAt === undefined ? Number.NaN : Date.parse(item.trashedAt);
      return Number.isFinite(trashedAt) && Date.now() - trashedAt < TRASH_RETENTION_MS;
    });
    if (retained.length !== items.length) {
      const retainedIds = new Set(retained.map((item) => item.id));
      purgeBrowserCollections(items.filter((item) => !retainedIds.has(item.id)).map((item) => item.id));
      purgeBrowserNal(items.filter((item) => !retainedIds.has(item.id)).map((item) => item.id));
      getAppStorage().setItem(BROWSER_TRASH_KEY, JSON.stringify(retained));
      getAppStorage().setItem(
        BROWSER_ANNOTATION_KEY,
        JSON.stringify(readBrowserAnnotations().filter((annotation) => retainedIds.has(annotation.itemId)
          || !items.some((item) => item.id === annotation.itemId))),
      );
    }
    return retained;
  } catch {
    return [];
  }
}

function normalizeLiteratureSearchText(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("zh-CN");
}

export function literatureItemMatchesQuery(item: LiteratureItem, query: string): boolean {
  const needle = normalizeLiteratureSearchText(query.trim());
  if (needle === "") return true;
  const haystack = [
    item.title,
    item.issuedYear?.toString() ?? "",
    ...item.creators.flatMap((creator) => [creator.familyName, creator.givenName]),
  ].join(" ");
  return normalizeLiteratureSearchText(haystack).includes(needle);
}

const browserGateway: LiteratureGateway = {
  async list(query = "") {
    return readBrowserItems().filter((item) => literatureItemMatchesQuery(item, query));
  },
  async listTrash(query = "") {
    return readBrowserTrash().filter((item) => literatureItemMatchesQuery(item, query));
  },
  async get(id) {
    const item = readBrowserItems().find((candidate) => candidate.id === id);
    if (item === undefined) throw new Error("找不到文献");
    return item;
  },
  async save(draft) {
    const now = new Date().toISOString();
    const existing = draft.id === undefined
      ? undefined
      : readBrowserItems().find((item) => item.id === draft.id);
    const item: LiteratureItem = {
      ...draft,
      id: draft.id ?? crypto.randomUUID(),
      readingStatus: existing?.readingStatus ?? "unread",
      attachments: existing?.attachments ?? [],
      projectIds: existing?.projectIds ?? [],
      metadataSources: existing?.metadataSources ?? ["title", "creators", "issuedYear", "doi"].map((fieldName) => ({ fieldName, sourceKind: draft.sourceKind ?? "user", confirmedByUser: (draft.sourceKind ?? "user") === "user" })),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    const items = [item, ...readBrowserItems().filter((candidate) => candidate.id !== item.id)];
    getAppStorage().setItem(BROWSER_STORAGE_KEY, JSON.stringify(items));
    return item;
  },
  async updateMetadataField(itemId, patch) {
    const items = readBrowserItems();
    const current = items.find((candidate) => candidate.id === itemId);
    if (current === undefined) throw new Error("找不到文献");
    if (patch.fieldName === "title" && patch.value.trim().length === 0) throw new Error("标题不能为空");
    const previousSource = current.metadataSources.find((source) => source.fieldName === patch.fieldName);
    const wasUnconfirmed = previousSource?.confirmedByUser === false;
    const updated: LiteratureItem = {
      ...current,
      [patch.fieldName]: patch.value,
      metadataSources: [
        ...current.metadataSources.filter((source) => source.fieldName !== patch.fieldName),
        {
          fieldName: patch.fieldName,
          sourceKind: wasUnconfirmed ? "user_edit" : "user",
          confirmedByUser: !wasUnconfirmed,
        },
      ],
      updatedAt: new Date().toISOString(),
    };
    getAppStorage().setItem(BROWSER_STORAGE_KEY, JSON.stringify([
      updated,
      ...items.filter((candidate) => candidate.id !== itemId),
    ]));
    return updated;
  },
  async confirmMetadataFields(itemId, fieldNames) {
    if (fieldNames.length === 0) throw new Error("至少选择一个待确认字段");
    const items = readBrowserItems();
    const item = items.find((candidate) => candidate.id === itemId);
    if (item === undefined) throw new Error("找不到文献");
    const sourceFields = new Set(item.metadataSources.map((source) => source.fieldName));
    const missing = fieldNames.find((fieldName) => !sourceFields.has(fieldName));
    if (missing !== undefined) throw new Error(`字段 ${missing} 没有可确认的来源`);
    const updated: LiteratureItem = {
      ...item,
      metadataSources: item.metadataSources.map((source) => fieldNames.includes(source.fieldName)
        ? { ...source, confirmedByUser: true }
        : source),
      updatedAt: new Date().toISOString(),
    };
    getAppStorage().setItem(BROWSER_STORAGE_KEY, JSON.stringify([
      updated,
      ...items.filter((candidate) => candidate.id !== itemId),
    ]));
    return updated;
  },
  async importPdfs() {
    throw new Error("PDF 文件导入只在 Tauri 桌面模式中可用");
  },
  async importBibtex(drafts) {
    const started = new Date().toISOString();
    const results = [];
    for (const draft of drafts) {
      try {
        const item = await this.save({ ...draft, sourceKind: "bibtex" });
        results.push({
          inputLabel: draft.bibtexKey || draft.title,
          rawInput: JSON.stringify(draft),
          state: "imported" as const,
          itemId: item.id,
        });
      } catch (reason: unknown) {
        results.push({
          inputLabel: draft.bibtexKey || draft.title,
          rawInput: JSON.stringify(draft),
          state: "failed" as const,
          errorMessage: reason instanceof Error ? reason.message : String(reason),
        });
      }
    }
    return {
      id: crypto.randomUUID(),
      state: results.some((result) => result.state === "failed") ? "completed_with_errors" : "completed",
      sourceKind: "bibtex",
      totalCount: results.length,
      completedCount: results.length,
      cancellationRequested: false,
      results,
      createdAt: started,
      updatedAt: new Date().toISOString(),
    };
  },
  async getImportJob() {
    throw new Error("导入任务只在 Tauri 桌面模式中可用");
  },
  async listImportJobs() { return []; },
  async cancelImportJob() {},
  async attachPdf() {
    throw new Error("PDF 附件只可在 Tauri 桌面模式中添加");
  },
  async renameAttachment(itemId, attachmentId, displayName) {
    const name = displayName.trim();
    if (!name || [...name].length > 255 || /\p{Cc}/u.test(name)) throw new Error("attachment_name_invalid：附件名称无效");
    const items = readBrowserItems(), item = items.find(value => value.id === itemId);
    if (!item?.attachments.some(value => value.id === attachmentId)) throw new Error("not_found：附件不存在");
    getAppStorage().setItem(BROWSER_STORAGE_KEY, JSON.stringify(items.map(value => value.id !== itemId ? value : {
      ...value, attachments: value.attachments.map(attachment => attachment.id === attachmentId ? {...attachment, displayName: name} : attachment),
    })));
  },
  async removeAttachment(itemId, attachmentId) {
    const items = readBrowserItems(), item = items.find(value => value.id === itemId);
    if (!item?.attachments.some(value => value.id === attachmentId)) throw new Error("not_found：附件不存在");
    getAppStorage().setItem(BROWSER_STORAGE_KEY, JSON.stringify(items.map(value => value.id !== itemId ? value : {
      ...value, attachments: value.attachments.filter(attachment => attachment.id !== attachmentId),
    })));
    return {fileStatus: "retained", warning: null};
  },
  async previewDoi() {
    throw new Error("DOI 元数据预览只在 Tauri 桌面模式中可用");
  },
  async applyMetadataCandidate(_candidateId, draft) { return this.save(draft); },
  async applyMetadataCandidateFields() {
    throw new Error("DOI 元数据审阅只在 Tauri 桌面模式中可用");
  },
  async rejectMetadataCandidate() {},
  async readAttachment() {
    throw new Error("PDF 阅读只在 Tauri 桌面模式中可用");
  },
  async revealAttachments() {
    throw new Error("在文件管理器中显示附件只在 Tauri 桌面模式中可用");
  },
  async saveReadingState(_itemId, attachmentId, viewState) {
    getAppStorage().setItem(BROWSER_READING_STATE_KEY, JSON.stringify({
      ...readBrowserReadingStates(),
      [attachmentId]: viewState,
    }));
  },
  async getReadingState(_itemId, attachmentId) {
    return readBrowserReadingStates()[attachmentId];
  },
  async listDuplicates() { return []; },
  async decideDuplicate() {},
  async mergeDuplicate() {
    throw new Error("重复文献合并只在 Tauri 桌面模式中可用");
  },
  async listMergeOperations() { return []; },
  async undoMerge() {},
  async setProjects(itemId, projectIds) {
    const items = readBrowserItems().map((item) => item.id === itemId ? { ...item, projectIds } : item);
    getAppStorage().setItem(BROWSER_STORAGE_KEY, JSON.stringify(items));
  },
  async archive(itemId) {
    const archived = readBrowserItems().find((item) => item.id === itemId);
    if (archived !== undefined) {
      getAppStorage().setItem(BROWSER_ARCHIVE_KEY, JSON.stringify([archived, ...readBrowserArchive()]));
    }
    getAppStorage().setItem(BROWSER_STORAGE_KEY, JSON.stringify(readBrowserItems().filter((item) => item.id !== itemId)));
  },
  async restore(itemId) {
    const archived = readBrowserArchive().find((item) => item.id === itemId);
    if (archived === undefined) return;
    getAppStorage().setItem(BROWSER_STORAGE_KEY, JSON.stringify([archived, ...readBrowserItems()]));
    getAppStorage().setItem(BROWSER_ARCHIVE_KEY, JSON.stringify(readBrowserArchive().filter((item) => item.id !== itemId)));
  },
  async trash(itemId) {
    trashBrowserLiterature([itemId], readBrowserItems(), readBrowserTrash(), { items: BROWSER_STORAGE_KEY, trash: BROWSER_TRASH_KEY });
  },
  async trashMany(itemIds) {
    trashBrowserLiterature(itemIds, readBrowserItems(), readBrowserTrash(), { items: BROWSER_STORAGE_KEY, trash: BROWSER_TRASH_KEY });
  },
  async restoreTrash(itemId) {
    const trashed = readBrowserTrash().find((candidate) => candidate.id === itemId);
    if (trashed === undefined) throw new Error("找不到回收站条目");
    const { trashedAt: _trashedAt, ...restored } = trashed;
    getAppStorage().setItem(BROWSER_STORAGE_KEY, JSON.stringify([restored, ...readBrowserItems()]));
    getAppStorage().setItem(
      BROWSER_TRASH_KEY,
      JSON.stringify(readBrowserTrash().filter((candidate) => candidate.id !== itemId)),
    );
  },
  async isAttachmentIndexed() { return true; },
  async indexAttachment() {},
};

export function getLiteratureGateway(): LiteratureGateway {
  return runtimeLiteratureGateway(() => resolveLiteratureRuntimeGateway(browserGateway)) ?? resolveLiteratureRuntimeGateway(browserGateway);
}
