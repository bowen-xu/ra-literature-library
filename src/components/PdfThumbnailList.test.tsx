// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { PdfThumbnailList } from "./PdfThumbnailList";
import type { PdfThumbnailSource } from "./PdfPageThumbnail";

interface ObservedTarget {
  readonly observer: TestIntersectionObserver;
  readonly target: Element;
}

const observedTargets: ObservedTarget[] = [];

class TestIntersectionObserver implements IntersectionObserver {
  readonly root: Element | Document | null;
  readonly rootMargin: string;
  readonly thresholds = [0];

  constructor(
    private readonly callback: IntersectionObserverCallback,
    options: IntersectionObserverInit = {},
  ) {
    this.root = options.root ?? null;
    this.rootMargin = options.rootMargin ?? "0px";
  }

  disconnect(): void {}

  observe(target: Element): void {
    observedTargets.push({ observer: this, target });
  }

  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }

  unobserve(): void {}

  trigger(target: Element, isIntersecting = true): void {
    this.callback([{
      boundingClientRect: target.getBoundingClientRect(),
      intersectionRatio: 1,
      intersectionRect: { ...target.getBoundingClientRect(), height: isIntersecting ? 100 : 0 },
      isIntersecting,
      rootBounds: null,
      target,
      time: 0,
    }], this);
  }
}

function setVisibility(target: Element, near = true, visible = near): void {
  for (const registration of observedTargets.filter(entry => entry.target === target)) {
    registration.observer.trigger(target, registration.observer.rootMargin === "0px" ? visible : near);
  }
}

describe("PDF thumbnail list", () => {
  let container: HTMLDivElement;
  let source: PdfThumbnailSource;
  let renderThumbnail: Mock<PdfThumbnailSource["renderThumbnail"]>;
  let root: Root;
  let scrollIntoView: ReturnType<typeof vi.fn<(arg?: boolean | ScrollIntoViewOptions) => void>>;

  beforeEach(() => {
    observedTargets.length = 0;
    globalThis.IntersectionObserver = TestIntersectionObserver;
    scrollIntoView = vi.fn<(arg?: boolean | ScrollIntoViewOptions) => void>();
    HTMLElement.prototype.scrollIntoView = scrollIntoView;
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({} as CanvasRenderingContext2D);
    renderThumbnail = vi.fn<PdfThumbnailSource["renderThumbnail"]>().mockImplementation(async (_page, canvas) => {
      canvas.width = 100;
      canvas.height = 140;
    });
    source = { pageCount: 12, renderThumbnail };
    container = window.document.createElement("div");
    container.className = "reader-navigation";
    window.document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  async function renderList(
    currentPageNumber: number,
    renderingEnabled = true,
    revisionForPage?: (pageIndex: number) => string | number,
  ): Promise<void> {
    await act(async () => root.render(
      <PdfThumbnailList
        currentPageNumber={currentPageNumber}
        onSelectPage={() => undefined}
        renderingEnabled={renderingEnabled}
        {...(revisionForPage === undefined ? {} : { revisionForPage })}
        source={source}
      />,
    ));
  }

  it("keeps every page placeholder mounted and minimally reveals the active page", async () => {
    await renderList(1);
    const initialOptions = [...container.querySelectorAll<HTMLElement>('[role="option"]')];
    expect(initialOptions).toHaveLength(12);
    expect(renderThumbnail).not.toHaveBeenCalled();

    scrollIntoView.mockClear();
    await renderList(6);
    const updatedOptions = [...container.querySelectorAll<HTMLElement>('[role="option"]')];
    expect(updatedOptions).toHaveLength(12);
    expect(updatedOptions.every((option, index) => option === initialOptions[index])).toBe(true);
    expect(updatedOptions[5]?.getAttribute("aria-selected")).toBe("true");
    expect(scrollIntoView).toHaveBeenCalledOnce();
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", inline: "nearest" });
  });

  it("renders thumbnail pixels only after their stable placeholder approaches the viewport", async () => {
    await renderList(1);
    const sixthPage = container.querySelector<HTMLElement>('[aria-label="第 6 页"]');
    if (sixthPage === null) throw new Error("sixth thumbnail placeholder is missing");
    const registration = observedTargets.find(({ target }) => target === sixthPage);
    if (registration === undefined) throw new Error("sixth thumbnail was not observed");
    expect(registration.observer.root).toBe(container);
    expect(registration.observer.rootMargin).toBe("200px 0px");
    expect(renderThumbnail).not.toHaveBeenCalled();

    await act(async () => {
      setVisibility(sixthPage);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(renderThumbnail).toHaveBeenCalledWith(6, expect.any(HTMLCanvasElement), expect.any(AbortSignal));
    expect(sixthPage.querySelector(".thumbnail-placeholder")).toBeNull();
  });

  it("defers near-viewport rendering while the reader session is hidden", async () => {
    await renderList(1, false);
    const firstPage = container.querySelector<HTMLElement>('[aria-label="第 1 页"]');
    if (firstPage === null) throw new Error("first thumbnail placeholder is missing");
    const registration = observedTargets.find(({ target }) => target === firstPage);
    if (registration === undefined) throw new Error("first thumbnail was not observed");
    await act(async () => setVisibility(firstPage));
    expect(renderThumbnail).not.toHaveBeenCalled();

    await renderList(1, true);
    await act(async () => setVisibility(firstPage));
    expect(renderThumbnail).toHaveBeenCalledWith(1, expect.any(HTMLCanvasElement), expect.any(AbortSignal));
  });

  it("invalidates only a generated thumbnail whose page annotation revision changed", async () => {
    await renderList(1, true, () => "v1");
    const sixthPage = container.querySelector<HTMLElement>('[aria-label="第 6 页"]');
    if (sixthPage === null) throw new Error("sixth thumbnail placeholder is missing");
    const registration = observedTargets.find(({ target }) => target === sixthPage);
    if (registration === undefined) throw new Error("sixth thumbnail was not observed");
    await act(async () => setVisibility(sixthPage));
    renderThumbnail.mockClear();

    await renderList(1, true, (pageIndex) => pageIndex === 5 ? "v2" : "v1");
    expect(renderThumbnail).toHaveBeenCalledOnce();
    expect(renderThumbnail).toHaveBeenCalledWith(6, expect.any(HTMLCanvasElement), expect.any(AbortSignal));
  });

  it("retains painted thumbnails across tab hiding and activation instead of flashing or repainting", async () => {
    await renderList(1);
    const registration=observedTargets[0];if(!registration)throw new Error("thumbnail not observed");
    await act(async()=>setVisibility(registration.target));
    expect(registration.target.querySelector(".thumbnail-placeholder")).toBeNull();
    renderThumbnail.mockClear();
    await renderList(1,false);await renderList(1,true);
    expect(registration.target.querySelector(".thumbnail-placeholder")).toBeNull();
    expect(renderThumbnail).not.toHaveBeenCalled();
  });

  it("aborts pending thumbnails as they leave lookahead and does not requeue them on activation", async () => {
    renderThumbnail.mockImplementation(()=>new Promise(()=>undefined));
    await renderList(1);
    const registration=observedTargets[5];if(!registration)throw new Error("thumbnail not observed");
    await act(async()=>setVisibility(registration.target));
    const signal=renderThumbnail.mock.calls[0]?.[2];expect(signal?.aborted).toBe(false);
    await act(async()=>setVisibility(registration.target,false));
    expect(signal?.aborted).toBe(true);renderThumbnail.mockClear();
    await renderList(1,false);await renderList(1,true);expect(renderThumbnail).not.toHaveBeenCalled();
    await act(async()=>setVisibility(registration.target));
    expect(renderThumbnail).toHaveBeenCalledOnce();
  });

  it("shows independently completed pixels while another thumbnail is still pending", async () => {
    renderThumbnail.mockImplementation(page=>page===1 ? new Promise(()=>undefined) : Promise.resolve());
    await renderList(1);
    await act(async()=>{for(const registration of observedTargets.slice(0,2))setVisibility(registration.target);});
    expect(container.querySelector('[aria-label="第 1 页"] .thumbnail-placeholder')).not.toBeNull();
    expect(container.querySelector('[aria-label="第 2 页"] .thumbnail-placeholder')).toBeNull();
    expect(renderThumbnail).toHaveBeenCalledTimes(2);
  });

  it("caps bitmap allocation at the smaller of twice the viewport page count and the fixed limit", async () => {
    await renderList(12);
    const pages = [...container.querySelectorAll<HTMLElement>('[role="option"]')];
    await act(async () => pages.forEach(page => setVisibility(page)));
    expect(renderThumbnail).toHaveBeenCalledTimes(8);
    expect(renderThumbnail).toHaveBeenCalledWith(12, expect.any(HTMLCanvasElement), expect.any(AbortSignal));
    expect([...container.querySelectorAll("canvas")].filter(canvas => canvas.width > 0)).toHaveLength(8);

    // Two visible thumbnails allow four slots, regardless of the PDF's twelve pages.
    await act(async () => pages.slice(0, 10).forEach(page => setVisibility(page, true, false)));
    expect([...container.querySelectorAll("canvas")].filter(canvas => canvas.width > 0)).toHaveLength(4);
    expect(pages[11]?.querySelector(".thumbnail-placeholder")).toBeNull();
  });

  it("retains an adjacent bitmap and releases it only when it leaves the doubled cache window", async () => {
    await renderList(1);
    const pages = [...container.querySelectorAll<HTMLElement>('[role="option"]')];
    const first = pages[0];
    const second = pages[1];
    const fifth = pages[4];
    if (!first || !second || !fifth) throw new Error("thumbnail missing");
    await act(async () => { setVisibility(first); setVisibility(second, true, false); });
    expect(renderThumbnail).toHaveBeenCalledTimes(2);
    expect(first.querySelector("canvas")?.width).toBe(100);

    await act(async () => { setVisibility(first, true, false); setVisibility(second); });
    expect(first.querySelector("canvas")?.width).toBe(100);
    expect(first.querySelector(".thumbnail-placeholder")).toBeNull();
    expect(renderThumbnail).toHaveBeenCalledTimes(2);

    await act(async () => { setVisibility(second, false); setVisibility(fifth); });
    expect(first.querySelector("canvas")?.width).toBe(0);
    expect(first.querySelector("canvas")?.height).toBe(0);
    expect(first.querySelector(".thumbnail-placeholder")).not.toBeNull();
    expect(fifth.querySelector("canvas")?.width).toBe(100);
    renderThumbnail.mockClear();

    await act(async () => { setVisibility(fifth, false); setVisibility(first); });
    expect(renderThumbnail).toHaveBeenCalledOnce();
    expect(renderThumbnail).toHaveBeenCalledWith(1, expect.any(HTMLCanvasElement), expect.any(AbortSignal));
    expect(second.querySelector("canvas")?.width).toBe(0);
  });

  it("clears a late bitmap from an evicted render without painting it as completed", async () => {
    let finish = (): void => undefined;
    renderThumbnail.mockImplementation((_page, canvas) => new Promise(resolve => {
      finish = () => { canvas.width = 100; canvas.height = 140; resolve(); };
    }));
    await renderList(1);
    const first = container.querySelector('[aria-label="第 1 页"]');
    if (!first) throw new Error("thumbnail missing");
    await act(async () => setVisibility(first));
    const signal = renderThumbnail.mock.calls[0]?.[2];
    await act(async () => setVisibility(first, true, false));
    expect(signal?.aborted).toBe(true);
    await act(async () => finish());
    expect(first.querySelector("canvas")?.width).toBe(0);
    expect(first.querySelector(".thumbnail-placeholder")).not.toBeNull();
  });
});
