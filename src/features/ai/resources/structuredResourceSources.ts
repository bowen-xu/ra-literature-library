import type { AiEvidenceItem } from "@research-assistant/core/ai";
import { structuredResourceDiffFields } from "@research-assistant/core/structured-resources";
import { readingFieldColor, type ReadingFieldSource } from "../readingFieldSources";

/** Resolve references against the resource's frozen source set, never the newest candidate. */
export function structuredResourceSources(
  resourceId: string,
  content: unknown,
  evidence: readonly (AiEvidenceItem & {readonly fieldIds?: readonly string[]})[],
): readonly ReadingFieldSource[] {
  return structuredResourceDiffFields(content).flatMap(field => {
    const originalId = field.id.startsWith("$retained:") ? field.id.slice(10) : field.id;
    const value = field.value as {
      evidence?: readonly {evidenceItemId: string; quote: string}[];
      statements?: readonly {
        evidenceItemIds: readonly string[];
        evidenceQuotes?: readonly {evidenceItemId: string; quote: string}[];
      }[];
    };
    const refs = value.evidence ?? value.statements?.flatMap(statement =>
      (statement.evidenceItemIds ?? []).map(key => ({
        evidenceItemId: key,
        quote: statement.evidenceQuotes?.find(ref => ref.evidenceItemId === key)?.quote ?? "",
      }))) ?? [];
    return [...new Map(refs.flatMap(ref => {
      const source = evidence.find(source => (source.fieldIds === undefined ||
        source.fieldIds.includes(field.id) || source.fieldIds.includes(originalId)) &&
        source.citationKey === ref.evidenceItemId);
      if (!source || ref.quote && !source.quoteExact.includes(ref.quote)) return [];
      const quote = ref.quote || source.quoteExact;
      const index = source.quoteExact.indexOf(quote);
      const unique = index >= 0 && index === source.quoteExact.lastIndexOf(quote);
      const narrowed = {
        ...source, quoteExact: quote,
        quotePrefix: unique ? (source.quotePrefix + source.quoteExact.slice(0, index)).slice(-160) : "",
        quoteSuffix: unique ? (source.quoteExact.slice(index + quote.length) + source.quoteSuffix).slice(0, 160) : "",
      };
      const id = `${resourceId}:${field.id}:${source.id}:${quote}`;
      return [[id, {id, fieldId: field.id, fieldTitle: field.title,
        color: readingFieldColor(originalId, field.color), evidence: narrowed}] as const];
    })).values()];
  });
}
