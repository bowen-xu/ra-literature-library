import { expect, it } from "vitest";
import { selectionExplanationMessage } from "./selectionExplanationMessage";
import type { PdfPendingSelection } from "../../knowledge/PdfSelectionActions";
it("freezes exact multi-page text, printed page labels and the chosen attachment without adjacent text", () => {
  const selection: PdfPendingSelection = {
    text: "selected ﬁrst line\n第二页原文", rects: [], prefix: "private prefix", suffix: "private suffix",
    pageIndex: 0, pageLabel: "440", popupPageIndex: 1, popupRect: { x:0, y:0, width:.1, height:.1 },
    segments: [
      {pageIndex:0, pageLabel:"440", text:"selected ﬁrst line", prefix:"private prefix", suffix:"private suffix", rects:[]},
      {pageIndex:1, pageLabel:"441", text:"第二页原文", prefix:"", suffix:"", rects:[]},
    ],
  };
  const text = selectionExplanationMessage({id:"paper", title:"Paper title"}, {id:"supplement", displayName:"supplement.pdf", contentSha256:"a".repeat(64)}, selection);
  expect(text).toContain("文件：supplement.pdf");
  expect(text).toContain("文件 ID：supplement");
  expect(text).toContain("文献 ID：paper");
  expect(text).toContain("第 1 页（印刷 440）");
  expect(text).toContain("第 2 页（印刷 441）");
  expect(text).not.toContain("a".repeat(64));
  expect(text).toContain("【来源】Paper title");
  expect(text).toContain("原文：" + selection.text);
  expect(text).toContain("【定位引用】未提供");
  expect(text).not.toContain("Docling");
  expect(text).not.toContain("PDF");
  expect(text).toContain("未实际读取的内容不声称已读取");
  expect(text).not.toContain(selection.prefix); expect(text).not.toContain(selection.suffix);
});

it("keeps selected source text literal even when it contains template placeholders", () => {
  const selection: PdfPendingSelection = {
    text: "{{ title }}\n{{ missing }}", rects: [], prefix: "", suffix: "",
    pageIndex: 0, pageLabel: "440", popupPageIndex: 0,
    popupRect: { x: 0, y: 0, width: .1, height: .1 }, segments: [],
  };
  const text = selectionExplanationMessage({ id: "paper", title: "Paper" }, { id: "pdf", displayName: "paper.pdf", contentSha256: "a".repeat(64) }, selection);
  expect(text).toContain("原文：{{ title }}\n{{ missing }}");
  expect(text.endsWith("（请通过来源工具读取对应正文及上下文）")).toBe(true);
});
