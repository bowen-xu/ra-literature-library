import { useEffect, useState } from "react";
import type { AiCandidate } from "@research-assistant/core/ai";

/**
 * Mirrors durable inspection events into the current review card. The database remains the
 * source of truth so leaving the inbox to inspect a PDF does not reset the acceptance gate.
 */
export function useEvidenceInspectionState(candidate: AiCandidate): readonly [
  ReadonlySet<string>,
  (evidenceItemId: string) => void,
] {
  const [inspectedIds, setInspectedIds] = useState<ReadonlySet<string>>(
    () => new Set(candidate.inspectedEvidenceItemIds ?? []),
  );

  useEffect(() => {
    setInspectedIds(new Set(candidate.inspectedEvidenceItemIds ?? []));
  }, [candidate.id, candidate.currentRevision, candidate.inspectedEvidenceItemIds]);

  function markInspected(evidenceItemId: string): void {
    setInspectedIds((current) => new Set([...current, evidenceItemId]));
  }

  return [inspectedIds, markInspected] as const;
}
