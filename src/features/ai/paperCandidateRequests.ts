import type { AiCandidate } from "@research-assistant/core/ai";
import type { AiAssistanceGateway } from "@research-assistant/workbench-sdk/ai-assistance";
import { subscribePaperReadingChanged } from "./readingPanelEvents";

type Gateway = Pick<AiAssistanceGateway, "listCandidates">;
// Runtime gateway owns pending reads. Completed/failed reads are never cached;
// concurrent portrait/reading mounts share only the current paper's request.
// Performance invariant: these views mount together (also under StrictMode), so
// keep their reads shared and paper-scoped all the way to SQL. Fetching the whole
// catalog and filtering here caused repeated selection stalls in dev:desktop.
// The filter below is defensive, not a replacement for native query scoping.
// paperCandidateRequests.test.ts covers sharing, release and write invalidation;
// PaperPortraitCandidates.test.tsx covers StrictMode and late paper responses.
const requests = new WeakMap<Gateway, Map<string, Promise<readonly AiCandidate[]>>>();

export function invalidatePaperCandidateRequest(gateway: Gateway, paperId: string): void {
  requests.get(gateway)?.delete(paperId);
}

export function loadPaperCandidates(gateway: Gateway, paperId: string): Promise<readonly AiCandidate[]> {
  let papers = requests.get(gateway);
  if (!papers) { papers = new Map(); requests.set(gateway, papers); }
  const existing = papers.get(paperId);
  if (existing) return existing;
  const pending = Promise.resolve().then(() => gateway.listCandidates(undefined, { paperId }))
    .then(candidates => candidates.filter(candidate => candidate.evidenceBundle.items.length > 0 &&
      candidate.evidenceBundle.items.every(source => source.paperId === paperId)))
    .finally(() => { unsubscribe(); if (papers.get(paperId) === pending) papers.delete(paperId); });
  // Invalidate in capture phase before any view's refresh listener can reuse it.
  const unsubscribe = subscribePaperReadingChanged(paperId, () => {
    if (papers.get(paperId) === pending) papers.delete(paperId);
  }, "paper-candidate-request", { capture: true });
  papers.set(paperId, pending);
  return pending;
}
