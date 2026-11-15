import { DEFAULT_PORTRAIT_CATALOG, decodePortraitCatalog, type PortraitCatalog } from "@research-assistant/core/ai";
import { getAppStorage } from "@research-assistant/workbench-sdk/storage";
const KEY = "research-assistant.portrait-catalog.v1";
export function loadPortraitCatalog(): PortraitCatalog {
  const raw = getAppStorage().getItem(KEY);
  return raw === null ? DEFAULT_PORTRAIT_CATALOG : decodePortraitCatalog(JSON.parse(raw) as unknown);
}
export function savePortraitCatalog(catalog: PortraitCatalog): void {
  const serialized = JSON.stringify(decodePortraitCatalog(catalog));
  if (new TextEncoder().encode(serialized).length > 60_000) throw new Error("标签与模板配置超过容量，请缩短说明或减少模板。");
  getAppStorage().setItem(KEY, serialized);
}
