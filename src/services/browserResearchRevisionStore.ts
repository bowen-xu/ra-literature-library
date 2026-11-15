import { getAppStorage } from "@research-assistant/workbench-sdk/storage";
import type {
  ResearchObjectKind,
  ResearchObjectRevision,
} from "@research-assistant/core/knowledge";

import { decodeList, decodeResearchObjectRevision } from "./knowledgeDecoders";

const REVISION_KEY = "research-assistant.research-object-revisions.v1";

function readRevisions(): readonly ResearchObjectRevision[] {
  const raw = getAppStorage().getItem(REVISION_KEY);
  if (raw === null) return [];
  try {
    const revisions = decodeList(JSON.parse(raw) as unknown, decodeResearchObjectRevision);
    if (revisions === undefined) throw new Error("invalid stored revisions");
    return revisions;
  } catch {
    throw new Error("本地研究对象版本数据无法读取；原始记录未被修改。");
  }
}

export function appendBrowserResearchRevision(
  objectKind: ResearchObjectKind,
  objectId: string,
  revision: number,
  snapshot: object,
  changeReason: string,
): ResearchObjectRevision {
  const entry: ResearchObjectRevision = {
    id: crypto.randomUUID(),
    objectKind,
    objectId,
    revision,
    snapshot: snapshot as Readonly<Record<string, unknown>>,
    editorKind: "human",
    changeReason,
    createdAt: new Date().toISOString(),
  };
  getAppStorage().setItem(REVISION_KEY, JSON.stringify([entry, ...readRevisions()]));
  return entry;
}

export function listBrowserResearchRevisions(
  objectKind: ResearchObjectKind,
  objectId: string,
): readonly ResearchObjectRevision[] {
  return readRevisions()
    .filter((revision) => revision.objectKind === objectKind && revision.objectId === objectId)
    .sort((left, right) => right.revision - left.revision);
}
