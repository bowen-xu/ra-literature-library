import {resolveCollectionRuntimeGateway} from "@research-assistant/workbench-sdk/literature-runtime";
import {isDesktopRuntime} from "@research-assistant/workbench-sdk/environment";
import {collectionCommandError as safeError} from "./transportValidation";
import { getAppStorage } from "@research-assistant/workbench-sdk/storage";
import { applyCollectionMutation, type CollectionMutation, type CollectionState } from "@research-assistant/core/collections";
import type { CollectionGateway } from "@research-assistant/data/collections";
import { getLiteratureGateway } from "./literatureGateway";
import { getResearchKnowledgeGateway } from "./knowledgeGateway";

import { COLLECTION_STORAGE_KEY, readBrowserCollections } from "./browserCollectionStorage";
async function mutateBrowser(mutation: CollectionMutation, expectedRevision: number): Promise<CollectionState> {
  if ("itemIds" in mutation) {
    const active = new Set((await getLiteratureGateway().list()).map((i) => i.id));
    if (!mutation.itemIds.length || mutation.itemIds.some((id) => !active.has(id))) throw new Error("部分文献已归档、删除或不存在，请刷新");
  }
  if (mutation.kind === "save_collection" && mutation.collection.conceptId !== null) {
    const concepts = await getResearchKnowledgeGateway().searchConcepts("");
    if (!concepts.some((c) => c.id === mutation.collection.conceptId)) throw new Error("关联概念已不存在，请重新选择");
  }
  // One storage write is atomic; a Web Lock serializes competing preview tabs.
  const commit = () => {
    const next = applyCollectionMutation(readBrowserCollections(), mutation, expectedRevision);
    getAppStorage().setItem(COLLECTION_STORAGE_KEY, JSON.stringify(next));
    return next;
  };
  return navigator.locks ? navigator.locks.request(COLLECTION_STORAGE_KEY, commit) : commit();
}

export function createCollectionGateway(native: CollectionGateway): CollectionGateway {
  return {
  async read() {
    try { return isDesktopRuntime() ? await native.read() : readBrowserCollections(); }
    catch (e) { throw safeError(e); }
  },
  async mutate(mutation, expectedRevision) {
    try { return isDesktopRuntime() ? await native.mutate(mutation, expectedRevision) : await mutateBrowser(mutation, expectedRevision); }
    catch (e) { throw safeError(e); }
  },
  };
}

const gateway = createCollectionGateway({read: () => selectedNative().read(), mutate: (mutation, revision) => selectedNative().mutate(mutation, revision)});
function selectedNative(): CollectionGateway {
  const selected = resolveCollectionRuntimeGateway(gateway);
  if (selected === gateway) throw Object.assign(new Error("literature_gateway_unavailable：领域 native 适配尚未接入。"), {code: "literature_gateway_unavailable"});
  return selected;
}
export function getCollectionGateway(): CollectionGateway { return resolveCollectionRuntimeGateway(gateway); }
