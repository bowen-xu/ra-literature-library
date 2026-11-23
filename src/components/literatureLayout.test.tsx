// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { useLiteratureDetailLayout } from "./useLiteratureDetailLayout";
import { useLiteratureTableLayout } from "./useLiteratureTableLayout";
import { DEFAULT_LITERATURE_COLUMNS } from "./literatureTableModel";


let root: ReturnType<typeof createRoot> | undefined;
let host: HTMLDivElement;
const resizes: { run: () => void; disconnect: ReturnType<typeof vi.fn> }[] = [];
let width = 1_200;

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = undefined; host?.remove(); resizes.length = 0;
  vi.restoreAllMocks(); vi.unstubAllGlobals();
});

function setup() {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("ResizeObserver", class {
    disconnect = vi.fn();
    constructor(run: () => void) { resizes.push({ run, disconnect: this.disconnect }); }
    observe() {}
  });
  width = 1_200;
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    return this.closest("[hidden]") ? new DOMRect() : new DOMRect(0, 0, width, 600);
  });
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(function (this: HTMLElement) {
    return this.closest("[hidden]") ? 0 : width;
  });
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
}

function Library({ hidden }: { readonly hidden: boolean }) {
  const detail = useLiteratureDetailLayout();
  const table = useLiteratureTableLayout(DEFAULT_LITERATURE_COLUMNS);
  return <section hidden={hidden}><div ref={detail.gridRef} style={detail.gridStyle}>
    <div ref={table.scrollRef} data-table-width={table.tableWidth} />
  </div></section>;
}

it("preserves library geometry while hidden and corrects changed bounds on reveal without an observer delivery", async () => {
  setup();
  await act(async () => root!.render(<Library hidden={false} />));
  const grid = host.querySelector<HTMLDivElement>("section > div")!;
  const table = grid.firstElementChild!;
  expect(grid.style.getPropertyValue("--literature-detail-width")).toBe("450px");
  const tableWidth = table.getAttribute("data-table-width");
  await act(async () => root!.render(<Library hidden />));
  await act(async () => resizes.forEach(observer => observer.run()));
  expect(grid.style.getPropertyValue("--literature-detail-width")).toBe("450px");
  expect(table.getAttribute("data-table-width")).toBe(tableWidth);
  width = 800;
  await act(async () => root!.render(<Library hidden={false} />));
  expect(grid.style.getPropertyValue("--literature-detail-width")).toBe("300px");
  expect(table.getAttribute("data-table-width")).not.toBe(tableWidth);
  expect(host.querySelector("section > div")).toBe(grid);
});

it("does not replace initial geometry when the library first mounts hidden", async () => {
  setup();
  await act(async () => root!.render(<Library hidden />));
  const grid = host.querySelector<HTMLDivElement>("section > div")!;
  await act(async () => resizes.forEach(observer => observer.run()));
  expect(grid.style.getPropertyValue("--literature-detail-width")).toBe("450px");
  width = 1_600;
  await act(async () => root!.render(<Library hidden={false} />));
  expect(grid.style.getPropertyValue("--literature-detail-width")).toBe("600px");
});