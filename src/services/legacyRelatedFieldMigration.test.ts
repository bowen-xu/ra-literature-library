/** @vitest-environment happy-dom */
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { getCollectionGateway } from "./collectionGateway";
import { getNalGateway } from "./nalGateway";

beforeEach(() => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => values.delete(key),
  };
  vi.stubGlobal("localStorage", storage);
  Object.defineProperty(window, "localStorage", { configurable: true, value: storage });
});
afterEach(() => vi.unstubAllGlobals());

async function legacyCollections() {
  const gateway = getCollectionGateway();
  let state = await gateway.read();
  for (const id of ["first", "second"]) {
    state = await gateway.mutate({ kind: "save_collection", collection: {
      id, name: id, description: "测试迁移", conceptId: null,
    } }, state.revision);
  }
  return { gateway, state };
}

it("does not create the unused default related-field concept during migration", async () => {
  await legacyCollections();
  expect((await getNalGateway().read()).concepts.some(c => c.label === "related-field")).toBe(false);
});

it("preserves a related-field concept and both directions when old relations use it", async () => {
  const { gateway, state } = await legacyCollections();
  await gateway.mutate({ kind: "add_relation", relation: {
    id: "used", sourceId: "first", targetId: "second", typeId: "related-field",
  } }, state.revision);
  const migrated = await getNalGateway().read();
  const related = migrated.concepts.find(c => c.label === "related-field");
  expect(related).toBeDefined();
  expect(migrated.statements.filter(s => s.predicate.kind === "concept"
    && s.predicate.id === related!.id)).toHaveLength(2);
});
