// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { useAttachmentTextIndex } from "./useAttachmentTextIndex";

vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
let dispose: (() => Promise<void>) | undefined;
afterEach(async () => { await dispose?.(); dispose = undefined; });
function setup() {
  const host = document.createElement("div"), root = createRoot(host);
  const gateway = {isAttachmentIndexed: vi.fn(async () => true), indexAttachment: vi.fn(async () => {})};
  const controller = {setStatus: vi.fn(), extractPageTexts: vi.fn(async () => [])};
  function Observer({active, hash}: {active: boolean; hash: string}) {
    useAttachmentTextIndex({active, ready: true, attachment: {id: "pdf", contentSha256: hash}, itemId: "paper", pageCount: 10, gateway, controller});
    return null;
  }
  dispose = () => act(async () => root.unmount());
  const render = (active: boolean, hash = "hash") => act(async () => root.render(<Observer active={active} hash={hash}/>));
  return {gateway, controller, render};
}
it("checks a completed attachment once across repeated switches and rechecks changed content", async () => {
  const f = setup(); await f.render(true);
  for (let i = 0; i < 5; i++) { await f.render(false); await f.render(true); }
  expect(f.gateway.isAttachmentIndexed).toHaveBeenCalledTimes(1);
  expect(f.controller.extractPageTexts).not.toHaveBeenCalled();
  await f.render(true, "changed"); expect(f.gateway.isAttachmentIndexed).toHaveBeenCalledTimes(2);
});
it("does not extract text after a hidden tab's late check, and retries on activation", async () => {
  const f = setup(); let resolve!: (indexed: boolean) => void;
  f.gateway.isAttachmentIndexed.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  await f.render(true); await f.render(false); await act(async () => resolve(false));
  expect(f.controller.extractPageTexts).not.toHaveBeenCalled();
  f.gateway.isAttachmentIndexed.mockResolvedValue(false);
  await f.render(true);
  expect(f.controller.extractPageTexts).toHaveBeenCalledTimes(1);
  expect(f.gateway.indexAttachment).toHaveBeenCalledTimes(1);
  await f.render(false); await f.render(true);
  expect(f.gateway.isAttachmentIndexed).toHaveBeenCalledTimes(2);
});
it("retries a failed index instead of caching failure", async () => {
  const f = setup(); f.gateway.isAttachmentIndexed.mockResolvedValue(false);
  f.gateway.indexAttachment.mockRejectedValueOnce(new Error("unavailable"));
  await f.render(true); expect(f.controller.setStatus).toHaveBeenLastCalledWith("全文索引失败：unavailable");
  await f.render(false); await f.render(true);
  expect(f.gateway.indexAttachment).toHaveBeenCalledTimes(2);
});
