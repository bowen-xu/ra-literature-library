import {resolveNalQueryRuntimeGateway} from "@research-assistant/workbench-sdk/literature-runtime";
import {runtimeNalQueryGateway} from "./configureLiteratureServices";
import {isDesktopRuntime} from "@research-assistant/workbench-sdk/environment";
import {decodeNalQueryStore as decode} from "./transportValidation";
import { decodeNalQueryDefinitions } from "@research-assistant/core/nal";
import type { NalQueryGateway, NalQueryStore } from "@research-assistant/data/nal";
import { getAppStorage } from "@research-assistant/workbench-sdk/storage";
export const NAL_QUERY_STORE_KEY = "research-assistant:nal-query-collections:v1";
function browserRead(): NalQueryStore {
  const raw = getAppStorage().getItem(NAL_QUERY_STORE_KEY);
  return raw ? decode(JSON.parse(raw)) : { revision: 0, definitions: [], cache: null, legacyImported: false };
}

export function createNalQueryGateway(native: NalQueryGateway): NalQueryGateway {
  return {
  async read() { return isDesktopRuntime() ? await native.read() : browserRead(); },
  async save(value, expectedRevision) {
    decodeNalQueryDefinitions(value.definitions);
    if (isDesktopRuntime()) return native.save(value, expectedRevision);
    const save = () => {
      const latest = browserRead();
      if (latest.revision !== expectedRevision) throw new Error("查询集合已变化，请重试");
      const next = { ...value, revision: expectedRevision + 1 };
      getAppStorage().setItem(NAL_QUERY_STORE_KEY, JSON.stringify(next));
      return next;
    };
    // A synchronous read/write is atomic within this JS task; locks also cover other tabs.
    return navigator.locks ? navigator.locks.request(NAL_QUERY_STORE_KEY, save) : save();
  },
  };
}

const gateway = createNalQueryGateway({read: () => selectedNative().read(), save: (value, revision) => selectedNative().save(value, revision)});
function selectedNative(): NalQueryGateway {
  const selected = resolveNalQueryRuntimeGateway(gateway);
  if (selected === gateway) throw Object.assign(new Error("literature_gateway_unavailable：领域 native 适配尚未接入。"), {code: "literature_gateway_unavailable"});
  return selected;
}
export function getNalQueryGateway(): NalQueryGateway { return runtimeNalQueryGateway() ?? resolveNalQueryRuntimeGateway(gateway); }
