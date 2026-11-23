// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { RetainedPaperReader } from "./RetainedPaperReader";
import { ReaderSessionRegistry } from "./session/ReaderSessionRegistry";
import { panelItem } from "../ai/paperOverviewTestFixtures";
import type { LiteratureGateway } from "../../services/literatureGateway";
const rendered = vi.hoisted(() => vi.fn());
vi.mock("./PaperReadingReader", () => ({PaperReadingReader: ({attachment, active}: {attachment: {id: string}; active: boolean}) => {
  rendered(attachment.id, active); return <input aria-label={attachment.id} defaultValue="draft"/>;
}}));
it("switches two readers without rendering a third hidden PDF or losing its draft", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div"), root = createRoot(host);
  const item = panelItem(), source = item.attachments[0]!;
  let registry = new ReaderSessionRegistry();
  for (const id of ["a", "b", "c"]) registry = registry.open({item, attachment: {...source, id}});
  const gateway = {} as LiteratureGateway, onOpen = vi.fn(), onClose = vi.fn(), onReviewChanged = vi.fn(async () => {});
  const render = (id: string) => act(async () => {
    registry = registry.activate(`reader:${id}`);
    root.render(<>{registry.sessions.map(reader => <RetainedPaperReader key={reader.id} reader={reader}
      selected={reader === registry.activeSession} active={reader === registry.activeSession} gateway={gateway}
      onOpen={onOpen} onClose={onClose} onReviewChanged={onReviewChanged}/>)}</>);
  });
  try {
    await render("a"); await act(async () => {});
    const draft = host.querySelector<HTMLInputElement>('[aria-label="c"]')!; draft.value = "unfinished";
    rendered.mockClear();
    for (let i = 0; i < 3; i++) { await render("b"); await render("a"); }
    expect(rendered.mock.calls.filter(([id]) => id === "c")).toHaveLength(0);
    expect(rendered.mock.calls.filter(([id]) => id === "a")).toHaveLength(6);
    expect(onReviewChanged).not.toHaveBeenCalled();
    expect(host.querySelector('[aria-label="c"]')).toBe(draft); expect(draft.value).toBe("unfinished");
  } finally {await act(async () => root.unmount()); vi.unstubAllGlobals();}
});
