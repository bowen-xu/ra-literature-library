// @vitest-environment happy-dom
import { expect, it, vi } from "vitest";
import type { AiCandidate } from "@research-assistant/core/ai";
import { overviewCandidate } from "./paperOverviewTestFixtures";
import { invalidatePaperCandidateRequest, loadPaperCandidates } from "./paperCandidateRequests";
import { publishPaperReadingChanged, subscribePaperReadingChanged } from "./readingPanelEvents";

function deferred() {
  let resolve!: (value: readonly AiCandidate[]) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<readonly AiCandidate[]>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

it("shares concurrent paper reads, isolates papers and runtimes, and releases completed reads", async () => {
  const wait = deferred(), candidate = overviewCandidate("one", "paper");
  const gateway = { listCandidates: vi.fn(() => wait.promise) };
  const first = loadPaperCandidates(gateway, "paper"), second = loadPaperCandidates(gateway, "paper");
  expect(second).toBe(first);
  const otherPaper = loadPaperCandidates(gateway, "other"), otherRuntime = loadPaperCandidates({ ...gateway }, "paper");
  await Promise.resolve();
  expect(gateway.listCandidates).toHaveBeenCalledTimes(3);
  expect(gateway.listCandidates).toHaveBeenCalledWith(undefined, { paperId: "paper" });
  wait.resolve([candidate, overviewCandidate("foreign", "other")]);
  await expect(first).resolves.toEqual([candidate]);
  await expect(otherPaper).resolves.toEqual([expect.objectContaining({ id: "foreign" })]);
  await otherRuntime;
  await loadPaperCandidates(gateway, "paper");
  expect(gateway.listCandidates).toHaveBeenCalledTimes(4);
});

it("releases failed reads so retry can contact the gateway", async () => {
  const gateway = { listCandidates: vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue([]) };
  await expect(loadPaperCandidates(gateway, "paper")).rejects.toThrow("offline");
  await expect(loadPaperCandidates(gateway, "paper")).resolves.toEqual([]);
  expect(gateway.listCandidates).toHaveBeenCalledTimes(2);
});

it("invalidates before view listeners refresh and keeps a newer request after an old one settles", async () => {
  const old = deferred(), fresh = deferred();
  const gateway = { listCandidates: vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise) };
  let refreshed: Promise<readonly AiCandidate[]> | undefined;
  const unsubscribe = subscribePaperReadingChanged("paper", () => { refreshed = loadPaperCandidates(gateway, "paper"); }, "view");
  try {
    const initial = loadPaperCandidates(gateway, "paper");
    await Promise.resolve();
    publishPaperReadingChanged("paper", "mutation");
    await Promise.resolve();
    expect(gateway.listCandidates).toHaveBeenCalledTimes(2);
    expect(refreshed).not.toBe(initial);
    old.resolve([]); await initial;
    expect(loadPaperCandidates(gateway, "paper")).toBe(refreshed);
    fresh.resolve([overviewCandidate("new", "paper")]);
    await expect(refreshed).resolves.toEqual([expect.objectContaining({ id: "new" })]);
  } finally { unsubscribe(); }
});

it("allows a committed local mutation to invalidate its pending read explicitly", async () => {
  const gateway = { listCandidates: vi.fn(async () => []) };
  const old = loadPaperCandidates(gateway, "paper");
  invalidatePaperCandidateRequest(gateway, "paper");
  const fresh = loadPaperCandidates(gateway, "paper");
  expect(fresh).not.toBe(old);
  await Promise.all([old, fresh]);
  expect(gateway.listCandidates).toHaveBeenCalledTimes(2);
});
