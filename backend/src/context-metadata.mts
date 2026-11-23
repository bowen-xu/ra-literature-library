/** Caller-captured context metadata projection migrated from native/context_metadata.rs. */

export type MetadataPair = readonly [string, string];
export interface ContextMetadataInput {readonly paperId: string; readonly base: unknown; readonly creators: readonly MetadataPair[]; readonly identifiers: readonly MetadataPair[]}
export type ContextMetadataProjection = {readonly status: 'projected'; readonly bodyJson: string} | {readonly status: 'rejected'; readonly reason: 'invalidBase'};

function plainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function projectContextMetadata(input: ContextMetadataInput): ContextMetadataProjection {
  if (input.base !== null && !plainObject(input.base)) return {status: 'rejected', reason: 'invalidBase'};
  const value: Record<string, unknown> = input.base === null ? {} : structuredClone(input.base);
  value.creators = input.creators.map(pair => [pair[0], pair[1]]);
  value.identifiers = input.identifiers.map(pair => [pair[0], pair[1]]);
  return {status: 'projected', bodyJson: JSON.stringify(value)};
}
