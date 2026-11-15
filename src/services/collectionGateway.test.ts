// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getCollectionGateway } from "./collectionGateway";
import { getLiteratureGateway } from "./literatureGateway";
import { emptyLiteratureDraft } from "@research-assistant/core/literature";
import { COLLECTION_STORAGE_KEY } from "./browserCollectionStorage";
const gateway = getCollectionGateway();
beforeEach(() => {
  const values = new Map<string,string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key,value); }, removeItem: (key: string) => { values.delete(key); }, clear: () => values.clear() };
  vi.stubGlobal("localStorage", storage);
  Object.defineProperty(window, "localStorage", { configurable: true, value: storage });
});
afterEach(() => vi.unstubAllGlobals());
describe("browser collection persistence", () => {
  it("checks active items, preserves archival membership, and reloads tags", async () => {
    const item = await getLiteratureGateway().save({ ...emptyLiteratureDraft(), title: "Paper" });
    let state = await gateway.read();
    state = await gateway.mutate({ kind: "save_collection", collection: { id: "a", name: "A", description: "", conceptId: null } }, state.revision);
    state = await gateway.mutate({ kind: "classify", itemIds: [item.id], collectionId: "a", relationIds: [] }, state.revision);
    expect((await gateway.read()).memberships).toEqual(state.memberships);
    await getLiteratureGateway().archive(item.id);
    await expect(gateway.mutate({ kind: "classify", itemIds: [item.id], collectionId: "a", relationIds: [] }, state.revision)).rejects.toThrow("归档");
    expect((await gateway.read()).memberships).toHaveLength(1);
    await getLiteratureGateway().restore(item.id);
    await getLiteratureGateway().trash(item.id);
    expect((await gateway.read()).memberships).toHaveLength(1);
    await getLiteratureGateway().restoreTrash(item.id);
    expect((await gateway.read()).memberships).toHaveLength(1);
  });
  it("does not overwrite malformed storage or accept stale updates", async () => {
    let state = await gateway.read();
    state = await gateway.mutate({ kind: "save_collection", collection: { id: "a", name: "A", description: "", conceptId: null } }, state.revision);
    await expect(gateway.mutate({ kind: "delete_collection", id: "a" }, 0)).rejects.toThrow("变化");
    localStorage.setItem(COLLECTION_STORAGE_KEY, "broken");
    await expect(gateway.read()).rejects.toThrow();
    expect(localStorage.getItem(COLLECTION_STORAGE_KEY)).toBe("broken");
  });
});

it("batch trash validates every item and rolls back storage failure without losing classifications", async () => {
  const literature = getLiteratureGateway();
  const a = await literature.save({ ...emptyLiteratureDraft(), title: "A" });
  const b = await literature.save({ ...emptyLiteratureDraft(), title: "B" });
  let state = await gateway.read();
  state = await gateway.mutate({ kind: "save_collection", collection: { id: "a", name: "A", description: "", conceptId: null } }, state.revision);
  state = await gateway.mutate({ kind: "classify", itemIds: [a.id, b.id], collectionId: "a", relationIds: [] }, state.revision);
  await expect(literature.trashMany([a.id, "missing"])).rejects.toThrow("不存在");
  expect(await literature.list()).toHaveLength(2);
  const write = window.localStorage.setItem.bind(window.localStorage);
  const failure = vi.spyOn(window.localStorage, "setItem").mockImplementation((key, value) => {
    if (key === "research-assistant.literature.v1") throw new Error("storage failure");
    write(key, value);
  });
  await expect(literature.trashMany([a.id, b.id])).rejects.toThrow("storage failure");
  failure.mockRestore();
  expect(await literature.list()).toHaveLength(2);
  expect(await literature.listTrash()).toHaveLength(0);
  await literature.trashMany([a.id, b.id, a.id]);
  expect(await literature.list()).toHaveLength(0);
  expect(await literature.listTrash()).toHaveLength(2);
  expect(await gateway.read()).toEqual(state);
});
