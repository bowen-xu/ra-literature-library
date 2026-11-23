import { NalQueryCollections, decodeNalQueryCache, decodeNalQueryDefinitions, parseNalConditions,
  type NalQueryCollection, type NalState, type NalVocabulary } from "@research-assistant/core/nal";
import { getNalQueryGateway } from "./nalQueryGateway";
import { getAppStorage } from "@research-assistant/workbench-sdk/storage";

/** The CAS retry reloads both definitions and projection, so another window's saves survive. */
export async function loadNalQueryCollections(state: NalState, papers: ReadonlySet<string>, vocabulary: readonly NalVocabulary[],
  edit?: (definitions: readonly NalQueryCollection[]) => readonly NalQueryCollection[]): Promise<NalQueryCollections> {
  const gateway = getNalQueryGateway();
  for (let attempt = 0; attempt < 3; attempt++) {
    const stored = await gateway.read();
    let definitions = stored.definitions;
    if (!stored.legacyImported) {
      const raw: unknown = JSON.parse(getAppStorage().getItem("research-assistant:nal-queries:v1") ?? "[]");
      if (Array.isArray(raw)) for (const entry of raw.slice(0, 100)) {
        if (!entry || typeof entry.id !== "string" || typeof entry.name !== "string" || typeof entry.expression !== "string" || definitions.some(d => d.id === entry.id)) continue;
        // Old identity expressions are resolved against the current catalog, never labels alone.
        const legacyVocabulary = [...vocabulary];
        for (const token of entry.expression.match(/(?:concept|paper):[^\s()×→"]+/gu) ?? []) {
          const separator = token.indexOf(":"), kind = token.slice(0,separator) as "concept" | "paper", id=token.slice(separator+1);
          if (!legacyVocabulary.some(v=>v.atom.kind === kind && v.atom.id === id)) legacyVocabulary.push({atom:{kind,id},label:token});
        }
        definitions = [...definitions, { id: entry.id, name: entry.name, conditions: parseNalConditions(entry.expression, legacyVocabulary) }];
      }
    }
    if (edit) definitions = edit(definitions);
    decodeNalQueryDefinitions(definitions);
    const projection = new NalQueryCollections(decodeNalQueryCache(stored.cache));
    projection.sync(state, papers, definitions);
    const cache = projection.export();
    if (stored.legacyImported && JSON.stringify(definitions) === JSON.stringify(stored.definitions) && JSON.stringify(cache) === JSON.stringify(stored.cache)) return projection;
    try {
      await gateway.save({ definitions, cache, legacyImported: true }, stored.revision);
      return projection;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes("查询集合已变化") || attempt === 2) throw error;
    }
  }
  throw new Error("查询集合已变化，请重试");
}
