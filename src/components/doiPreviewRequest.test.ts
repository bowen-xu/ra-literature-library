import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyLiteratureDraft, type MetadataPreview } from "@research-assistant/core/literature";
import { DoiPreviewRequest } from "./doiPreviewRequest";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function preview(id: string): MetadataPreview {
  return { id, importJobId: `job-${id}`, sourceKind: "datacite", sourceReference: "10.1234/test",
    draft: { ...emptyLiteratureDraft(), title: id }, diffs: [] };
}
function setup() {
  const first = deferred<MetadataPreview>();
  const previewDoi = vi.fn(() => first.promise);
  const rejectMetadataCandidate = vi.fn(async () => undefined);
  const busy = vi.fn(), error = vi.fn();
  const request = new DoiPreviewRequest({ previewDoi, rejectMetadataCandidate }, busy, error);
  return { request, first, previewDoi, rejectMetadataCandidate, busy, error };
}
afterEach(() => vi.useRealTimers());

describe("DOI lookup ownership", () => {
  it("does not dispatch a request cancelled before its adapter starts", async () => {
    const { request, previewDoi } = setup();
    const pending = request.load("10.1234/cancel");
    request.cancel();
    expect(await pending).toBeUndefined();
    expect(previewDoi).not.toHaveBeenCalled();
  });

  it("allows only one lookup across repeated submissions", async () => {
    const { request, first, previewDoi, busy } = setup();
    const result = request.load("10.1234/one");
    expect(request.isLoading).toBe(true);
    expect(await request.load("10.1234/one")).toBeUndefined();
    first.resolve(preview("one"));
    expect(await result).toEqual(preview("one"));
    expect(previewDoi).toHaveBeenCalledOnce();
    expect(busy.mock.calls).toEqual([[true], [false]]);
  });

  it("cancels immediately and cleans up an old response without replacing a newer lookup", async () => {
    const { request, first, previewDoi, rejectMetadataCandidate } = setup();
    const second = deferred<MetadataPreview>();
    const old = request.load("10.1234/old");
    await Promise.resolve();
    request.cancel();
    expect(await old).toBeUndefined();
    previewDoi.mockReturnValueOnce(second.promise);
    const current = request.load("10.1234/current");
    first.resolve(preview("old"));
    await vi.waitFor(() => expect(rejectMetadataCandidate).toHaveBeenCalledWith("old"));
    expect(request.isLoading).toBe(true);
    second.resolve(preview("current"));
    expect(await current).toEqual(preview("current"));
  });

  it("bounds a hung platform call and rejects its late candidate", async () => {
    vi.useFakeTimers();
    const { request, first, rejectMetadataCandidate } = setup();
    const result = request.load("10.1234/hung");
    const rejection = expect(result).rejects.toThrow("DOI_LOOKUP_TIMEOUT");
    await vi.advanceTimersByTimeAsync(50_000);
    await rejection;
    expect(request.isLoading).toBe(false);
    first.resolve(preview("late"));
    await vi.advanceTimersByTimeAsync(0);
    expect(rejectMetadataCandidate).toHaveBeenCalledWith("late");
  });

  it("preserves the actual request error and permits retry", async () => {
    const { request, first, previewDoi } = setup();
    const result = request.load("10.1234/error");
    first.reject(new Error("HTTP 503 · request-123"));
    await expect(result).rejects.toThrow("HTTP 503 · request-123");
    previewDoi.mockResolvedValueOnce(preview("retry"));
    expect(await request.load("10.1234/retry")).toEqual(preview("retry"));
  });

  it("ignores an abandoned request's failure", async () => {
    const { request, first, error } = setup();
    const result = request.load("10.1234/cancel");
    await Promise.resolve();
    request.cancel();
    first.reject(new Error("stale HTTP 503"));
    expect(await result).toBeUndefined();
    await Promise.resolve();
    expect(error).not.toHaveBeenCalled();
  });

  it("does not report stale network errors, but reports failed candidate cleanup with identities", async () => {
    const { request, first, rejectMetadataCandidate, error } = setup();
    const result = request.load("10.1234/cancel");
    await Promise.resolve();
    request.cancel(); await result;
    rejectMetadataCandidate.mockRejectedValueOnce(new Error("storage unavailable"));
    first.resolve(preview("abandoned"));
    await vi.waitFor(() => expect(error).toHaveBeenCalledWith(expect.stringContaining("abandoned · job-abandoned：storage unavailable")));
  });
});
