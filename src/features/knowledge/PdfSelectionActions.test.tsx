/** @vitest-environment happy-dom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { AiRun } from "@research-assistant/core/ai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ResearchKnowledgeGateway } from "../../services/knowledgeGateway";
import type { DictionaryGateway, WordExplanationGateway, WordExplanation } from "@research-assistant/core/dictionary";

vi.mock("../ai/AiReferenceExtractionPreview", () => ({
  AiReferenceExtractionPreview: ({
    onCancel,
    onStarted,
  }: {
    readonly onCancel: () => void;
    readonly onStarted: (run: AiRun) => void;
  }) => <div>
    <button onClick={onCancel} type="button">取消 AI 预览</button>
    <button onClick={() => onStarted({
      taskKind: "reference_extraction",
    } as AiRun)} type="button">启动 AI 候选</button>
  </div>,
}));

vi.mock("../../services/referenceRecordGateway", () => ({
  getReferenceRecordGateway: () => ({
    list: () => Promise.resolve([]),
  }),
}));

import { notify } from "@research-assistant/workbench-sdk/feedback";
import { PdfSelectionActions } from "./PdfSelectionActions";

describe("PDF selection reference draft", () => {
  let container: HTMLDivElement;
  let root: Root;
  const writeNote = vi.fn(async (_color?: string) => undefined);

  beforeEach(() => {
    writeNote.mockClear();
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
      .IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  async function renderActions(
    onAiRunStarted = vi.fn(),
    selectionText = "Original reference",
    onDraftStateChange = vi.fn(),
    onHighlight = vi.fn(async (_color: string) => undefined),
    onExplain: () => Promise<void> = vi.fn(async () => undefined),
    onEnsureAiAnchor = vi.fn(async () => "anchor"),
    positionOnly = false,
    editingNote = false,
    onDeleteNote = vi.fn(async () => undefined),
    dictionaryGateway?: DictionaryGateway<AbortSignal>,
    wordExplanationGateway?: WordExplanationGateway<AbortSignal>,
    existingWordExplanation?: WordExplanation,
    onWordExplanation?: (result: WordExplanation) => Promise<void>,
    onAnnotate?: (comment: string) => Promise<void>,
    active = true,
  ): Promise<void> {
    await act(async () => root.render(<PdfSelectionActions
      active={active}
      {...(dictionaryGateway ? { dictionaryGateway } : {})}
      {...(wordExplanationGateway ? { wordExplanationGateway } : {})}
      {...(existingWordExplanation ? { existingWordExplanation } : {})}
      {...(onWordExplanation ? { onWordExplanation } : {})}
      {...(onAnnotate ? {onAnnotate} : {})}
      positionOnly={positionOnly}
      editingNote={editingNote}
      onDeleteNote={onDeleteNote}
      knowledgeGateway={{} as ResearchKnowledgeGateway}
      onAiRunStarted={onAiRunStarted}
      onCaptureConcept={() => Promise.resolve()}
      onCaptureReference={() => Promise.resolve()}
      onEnsureAiAnchor={onEnsureAiAnchor}
      onExplain={onExplain}
      onHighlight={onHighlight}
      onWriteNote={writeNote}
      onClose={vi.fn()}
      onDraftStateChange={onDraftStateChange}
      paperId="paper"
      pending={{
        text: selectionText,
        rects: [],
        prefix: "",
        suffix: "",
        context: { before: "In this ", after: ", we study vision." },
        pageIndex: 0,
        pageLabel: "1",
        segments: [{ pageIndex: 0, pageLabel: "1", rects: [], text: selectionText, prefix: "", suffix: "" }],
        popupPageIndex: 0,
        popupRect: { x: 0, y: 0, width: 0.1, height: 0.1 },
      }}
    />));
  }

  function clickButton(label: string): void {
    const button = [...document.querySelectorAll("button")]
      .find((item) => item.getAttribute("aria-label") === label || item.textContent === label);
    expect(button).toBeDefined();
    button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  }

  it("opens only its local comment form and transfers the selection only on confirmation", async () => {
    const annotate=vi.fn(async (_comment:string)=>undefined), explain=vi.fn(async()=>undefined), dirty=vi.fn();
    await renderActions(undefined,"Original reference",dirty,undefined,explain,undefined,false,false,undefined,undefined,undefined,undefined,undefined,annotate);
    await act(async()=>clickButton("问AI"));
    expect(container.querySelector("textarea")).not.toBeNull();
    expect(annotate).not.toHaveBeenCalled();expect(explain).not.toHaveBeenCalled();
    await act(async()=>container.querySelector("textarea")!.dispatchEvent(new KeyboardEvent("keydown",{key:"Tab",bubbles:true,cancelable:true})));
    expect(annotate).not.toHaveBeenCalled();
    await act(async()=>{
      const editor=container.querySelector("textarea")!;
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,"value")!.set!.call(editor,"我的评论");
      editor.dispatchEvent(new Event("input",{bubbles:true}));
    });
    expect(dirty).toHaveBeenLastCalledWith(false);
    await act(async()=>container.querySelector("textarea")!.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true,cancelable:true})));
    expect(annotate).toHaveBeenCalledExactlyOnceWith("我的评论", "silent");
    expect(container.querySelector("textarea")?.value).toBe("我的评论");
  });
  it("disables the shared speech input and commit controls while an annotation draft is folded away",async()=>{
    await renderActions(undefined,"Original reference",undefined,undefined,undefined,undefined,false,false,undefined,undefined,undefined,undefined,undefined,vi.fn(async()=>undefined),false);
    await act(async()=>clickButton("问AI"));
    expect(container.querySelector("textarea")?.disabled).toBe(true);
    expect(container.querySelector<HTMLButtonElement>(".paper-ai-reading-voice")?.disabled).toBe(true);
  });

  async function enterCorrectedReference(): Promise<void> {
    await act(async () => clickButton("记录参考文献"));
    const editor = container.querySelector("textarea");
    expect(editor).not.toBeNull();
    await act(async () => {
      if (editor === null) return;
      const valueSetter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      )?.set;
      valueSetter?.call(editor, "Human corrected reference");
      editor.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(editor?.value).toBe("Human corrected reference");
    await act(async () => clickButton("AI 解析所选原文为候选"));
  }

  it("preserves manual corrections when the AI preview is canceled", async () => {
    await renderActions();
    await enterCorrectedReference();
    await act(async () => clickButton("取消 AI 预览"));
    expect(container.querySelector("textarea")?.value).toBe("Human corrected reference");
  });

  it("preserves manual corrections after a reference candidate starts", async () => {
    const onAiRunStarted = vi.fn();
    await renderActions(onAiRunStarted);
    await enterCorrectedReference();
    await act(async () => clickButton("启动 AI 候选"));
    expect(onAiRunStarted).toHaveBeenCalledOnce();
    expect(container.querySelector("textarea")?.value).toBe("Human corrected reference");
  });

  it("does not carry a reference draft into a newly selected source", async () => {
    await renderActions();
    await enterCorrectedReference();
    await act(async () => clickButton("取消 AI 预览"));

    await renderActions(vi.fn(), "A different selected reference");
    await act(async () => clickButton("记录参考文献"));
    expect(container.querySelector("textarea")?.value).toBe("A different selected reference");
  });

  it("reports a draft only after the user edits selection content", async () => {
    const onDraftStateChange = vi.fn();
    await renderActions(vi.fn(), "Selected source", onDraftStateChange);
    expect(onDraftStateChange).toHaveBeenLastCalledWith(false);

    expect(container.querySelector("textarea")).toBeNull();
    await act(async () => clickButton("记录参考文献"));
    const note = container.querySelector("textarea");
    await act(async () => {
      if (note === null) return;
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(note, "My note");
      note.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(onDraftStateChange).toHaveBeenLastCalledWith(true);
  });

  it("uses the shared note button for document positions and only deletion for existing sticky notes", async () => {
    const deleted = vi.fn(async () => undefined);
    await renderActions(vi.fn(), "", vi.fn(), vi.fn(), vi.fn(), vi.fn(), true);
    expect([...container.querySelectorAll('.selection-actions-toolbar button:not([role="menuitemradio"])')].map(button => button.getAttribute("aria-label"))).toEqual(["写笔记", "选择便签颜色"]);
    await act(async () => clickButton("选择便签颜色"));
    await act(async () => clickButton("蓝色便签"));
    expect(writeNote).not.toHaveBeenCalled();
    expect(container.querySelector<HTMLSpanElement>(".selection-highlight-apply .selection-color-swatch")?.style.background).toBe("#91bde8");
    await act(async () => clickButton("写笔记"));
    expect(writeNote).toHaveBeenCalledExactlyOnceWith("#91bde8");
    await renderActions(vi.fn(), "", vi.fn(), vi.fn(), vi.fn(), vi.fn(), true, true, deleted);
    expect([...container.querySelectorAll(".selection-actions-toolbar button")].map(button => button.getAttribute("aria-label"))).toEqual(["删除便签"]);
    await act(async () => clickButton("删除便签")); expect(deleted).toHaveBeenCalledOnce();
  });

  it("places the highlight split control before the other selection actions", async () => {
    await renderActions();
    const primaryActions = [...container.querySelectorAll(".selection-primary-actions button")]
      .filter(button => !button.closest(".selection-highlight-picker"))
      .map((button) => button.getAttribute("aria-label"));

    expect(primaryActions).toEqual(["高亮", "写笔记", "离线查词", "添加概念", "记录参考文献"]);
    expect(container.querySelector("blockquote")).toBeNull();
    expect(container.querySelector('[aria-label="关闭选区操作"]')).toBeNull();
    expect(container.textContent).not.toContain("Original reference");
    const buttons = [...container.querySelectorAll(".selection-actions-toolbar button")];
    expect(buttons.every(button => button.textContent === "" && button.hasAttribute("aria-label"))).toBe(true);
  });

  it("chooses preset colors without saving and applies the current color through the shared callback", async () => {
    const highlight = vi.fn(async (_color: string) => undefined);
    await renderActions(vi.fn(), "Original reference", vi.fn(), highlight);
    await act(async () => clickButton("高亮")); expect(highlight).toHaveBeenLastCalledWith("#f4cf65");
    for (const [label, color] of [["黄色高亮", "#f4cf65"], ["绿色高亮", "#91d5a3"], ["蓝色高亮", "#91bde8"], ["粉色高亮", "#efa4bf"], ["紫色高亮", "#c3a5e8"]]) {
      const calls = highlight.mock.calls.length;
      await act(async () => clickButton("选择高亮颜色"));
      await act(async () => clickButton(label!));
      expect(highlight).toHaveBeenCalledTimes(calls);
      expect(container.querySelector<HTMLSpanElement>(".selection-highlight-apply .selection-color-swatch")?.style.background).toBe(color);
      await act(async () => clickButton("高亮")); expect(highlight).toHaveBeenLastCalledWith(color);
    }
  });

  it("opens a dictionary after the note button without sending to AI or saving an anchor", async () => {
    const explain = vi.fn(), anchor = vi.fn(), highlight = vi.fn();
    const lookup = vi.fn(async (query: string) => ({ query, entries: [] }));
    const dirty = vi.fn();
    await renderActions(vi.fn(), "word", dirty, highlight, explain, anchor, false, false, undefined, { lookup });
    expect(lookup).not.toHaveBeenCalled();
    await act(async () => clickButton("离线查词"));
    expect(container.querySelector('[aria-label="离线词典"]')).not.toBeNull();
    expect(lookup).toHaveBeenCalledWith("word", expect.any(AbortSignal));
    expect(explain).not.toHaveBeenCalled(); expect(anchor).not.toHaveBeenCalled(); expect(highlight).not.toHaveBeenCalled();
    expect(dirty).toHaveBeenLastCalledWith(false);
    await act(async () => clickButton("离线查词"));
    expect(container.querySelector('[aria-label="离线词典"]')).toBeNull();
  });

  it("sends AI explanation without opening a preview or creating a highlight/anchor", async () => {
    let finish!: () => void;
    const explain = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
    const highlight = vi.fn(), anchor = vi.fn();
    await renderActions(vi.fn(), "Selected text", vi.fn(), highlight, explain, anchor);
    await act(async () => { clickButton("AI 解释"); clickButton("AI 解释"); });
    expect(explain).toHaveBeenCalledOnce();
    expect(highlight).not.toHaveBeenCalled(); expect(anchor).not.toHaveBeenCalled();
    expect(container.querySelector(".ai-selection-preview")).toBeNull();
    await act(async () => finish());
  });

  it("shows an existing occurrence explanation on reopening the dictionary without generation", async () => {
    const explain = vi.fn(), existing = { translation: "本研究", explanation: "这里指本文的研究工作。", providerId: "fixture", modelId: "test" };
    await renderActions(vi.fn(), "work", vi.fn(), vi.fn(), vi.fn(), vi.fn(), false, false, undefined,
      { lookup: async query => ({ query, entries: [] }) }, { explain, followUp: vi.fn() }, existing);
    await act(async () => clickButton("离线查词"));
    expect(container.querySelector(".dictionary-context-translation")?.textContent).toBe("本研究");
    await act(async () => clickButton("离线查词")); await act(async () => clickButton("离线查词"));
    expect(container.textContent).toContain("这里指本文的研究工作。"); expect(explain).not.toHaveBeenCalled();
  });

  it("retains generated output and retries only storage when saving fails", async () => {
    vi.spyOn(notify,"error").mockImplementation(()=>"toast");
    const explain = vi.fn(async()=>({translation:"本研究",explanation:"指本文研究工作。",providerId:"test",modelId:"test"}));
    const save = vi.fn().mockRejectedValueOnce(new Error("Cannot save")).mockResolvedValue(undefined);
    await renderActions(vi.fn(), "work", vi.fn(), vi.fn(), vi.fn(), vi.fn(), false, false, undefined,
      {lookup:async query=>({query,entries:[]})},{explain,followUp:vi.fn()},undefined,save);
    await act(async()=>clickButton("离线查词")); await act(async()=>clickButton("AI 语境释义"));
    expect(container.textContent).toContain("指本文研究工作。"); expect(container.textContent).toContain("重试保存解释");
    await act(async()=>clickButton("重试保存解释")); expect(save).toHaveBeenCalledTimes(2); expect(explain).toHaveBeenCalledOnce();
    expect(container.textContent).not.toContain("重试保存解释");
  });

  it("explains a dictionary word inline only on explicit click without chat or source writes", async () => {
    let finish!: (value: WordExplanation) => void;
    const explain = vi.fn(() => new Promise<WordExplanation>(resolve => { finish = resolve; }));
    const chat = vi.fn(), highlight = vi.fn(), anchor = vi.fn(), dirty = vi.fn();
    await renderActions(vi.fn(), "work", dirty, highlight, chat, anchor, false, false, undefined,
      { lookup: async query => ({ query, entries: [] }) }, { explain, followUp: vi.fn() });
    await act(async () => clickButton("离线查词"));
    expect(container.querySelector('[aria-label="AI 语境释义"]')).not.toBeNull();
    expect(container.querySelector(".dictionary-context-explanation")).toBeNull();
    expect(container.querySelector("input")).toBeNull(); expect(explain).not.toHaveBeenCalled();
    await act(async () => { clickButton("AI 语境释义"); clickButton("AI 语境释义"); });
    expect(explain).toHaveBeenCalledOnce();
    expect(explain).toHaveBeenCalledWith({ word: "work", before: "In this ", after: ", we study vision." }, expect.any(AbortSignal));
    expect(container.textContent).toContain("正在结合语境解释");
    await act(async () => finish({ translation: "本研究", explanation: "这里的 work 指本文开展的研究工作。", providerId: "fixture", modelId: "test" }));
    expect(container.querySelector(".dictionary-context-explanation")?.textContent).toContain("本文开展的研究工作");
    expect(chat).not.toHaveBeenCalled(); expect(highlight).not.toHaveBeenCalled(); expect(anchor).not.toHaveBeenCalled();
    expect(dirty).toHaveBeenLastCalledWith(false);
    await act(async () => clickButton("离线查词"));
    expect(container.querySelector('[aria-label="AI 解释"]')).not.toBeNull();
  });

  it("cancels dictionary generation when closed, ignores late output and retries errors explicitly", async () => {
    let finish!: (value: WordExplanation) => void; let signal: AbortSignal | undefined;
    const explain = vi.fn((_request, inputSignal?: AbortSignal) => { signal = inputSignal; return new Promise<WordExplanation>(resolve => { finish = resolve; }); });
    const lookup = { lookup: async (query: string) => ({ query, entries: [] }) };
    await renderActions(vi.fn(), "work", vi.fn(), vi.fn(), vi.fn(), vi.fn(), false, false, undefined, lookup, { explain, followUp: vi.fn() });
    await act(async () => clickButton("离线查词")); await act(async () => clickButton("AI 语境释义"));
    await act(async () => clickButton("离线查词")); expect(signal?.aborted).toBe(true);
    await act(async () => finish({ translation: "Late", explanation: "Late", providerId: "fixture", modelId: "test" }));
    await act(async () => clickButton("离线查词")); expect(container.textContent).not.toContain("Late");
    const error = vi.spyOn(notify, "error").mockImplementation(() => "toast");
    explain.mockImplementationOnce(async () => { throw new Error("Model unavailable"); });
    await act(async () => clickButton("AI 语境释义")); expect(error).toHaveBeenCalledWith("Model unavailable");
    expect(container.querySelector(".dictionary-context-explanation")).toBeNull();
    await act(async () => clickButton("AI 语境释义")); expect(explain).toHaveBeenCalledTimes(3);
  });

  it("preserves selection actions and allows retry if chat submission fails", async () => {
    const error = vi.spyOn(notify, "error").mockImplementation(() => "toast");
    const explain = vi.fn().mockRejectedValueOnce(new Error("Chat offline")).mockResolvedValue(undefined);
    await renderActions(vi.fn(), "Selected text", vi.fn(), vi.fn(), explain);
    await act(async () => clickButton("AI 解释"));
    expect(error).toHaveBeenCalledWith("Chat offline");
    expect(container.querySelector(".selection-actions-toolbar")).not.toBeNull();
    await act(async () => clickButton("AI 解释"));
    expect(explain).toHaveBeenCalledTimes(2);
    error.mockRestore();
  });

  it("restores the full selection action draft when the same PDF is reopened", async () => {
    const draft = vi.fn();
    await act(async () => root.render(<PdfSelectionActions
      initialDraft={{
        mode: "actions",
        note: "Recovered interpretation",
        referenceRawText: "Human corrected reference",
        conceptDirty: false,
        referenceDirty: true,
        reference: {
          rawText: "Human corrected reference",
          mode: "new_reference",
          recordId: "",
          usageKind: "mentions",
          usageSummary: "Original reference",
        },
      }}
      knowledgeGateway={{} as ResearchKnowledgeGateway}
      onAiRunStarted={vi.fn()}
      onCaptureConcept={() => Promise.resolve()}
      onCaptureReference={() => Promise.resolve()}
      onEnsureAiAnchor={() => Promise.resolve("anchor")}
      onHighlight={() => Promise.resolve()}
      onWriteNote={() => Promise.resolve()}
      onDraftChange={draft}
      paperId="paper"
      pending={{
        text: "Original reference",
        rects: [],
        prefix: "",
        suffix: "",
        pageIndex: 0,
        pageLabel: "1",
        segments: [{ pageIndex: 0, pageLabel: "1", rects: [], text: "Original reference", prefix: "", suffix: "" }],
        popupPageIndex: 0,
        popupRect: { x: 0, y: 0, width: 0.1, height: 0.1 },
      }}
    />));
    expect(container.querySelector("textarea")).toBeNull();
    expect(draft).toHaveBeenLastCalledWith(expect.objectContaining({ note: "Recovered interpretation" }), true);
    await act(async () => clickButton("记录参考文献"));
    expect(container.querySelector("textarea")?.value).toBe("Human corrected reference");
  });
});
