import { getAppStorage } from "@research-assistant/workbench-sdk/storage";
export const CONCEPT_DELETION_KEY = "research-assistant.concept-deletions.v1";
/** Preserve source/history records while excluding deleted identities from active catalogs. */
export function deletedBrowserConceptIds(): ReadonlySet<string> {
  const value:unknown=JSON.parse(getAppStorage().getItem(CONCEPT_DELETION_KEY) ?? "[]");
  if(!Array.isArray(value) || value.some(id=>typeof id !== "string"))throw new Error("概念删除记录格式无效");
  return new Set(value as string[]);
}
