import { describe, expect, it } from "vitest";

import { splitPaperAiAnswer } from "./paperAiReadingModel";

describe("paper AI reading answer model", () => {
  it("splits traceable context IDs from prose", () => {
    expect(splitPaperAiAnswer("结论来自 [P1-T3] 和图 [P1-F2]。")).toEqual([
      { kind: "text", value: "结论来自 " },
      { kind: "context", value: "P1-T3" },
      { kind: "text", value: " 和图 " },
      { kind: "context", value: "P1-F2" },
      { kind: "text", value: "。" },
    ]);
  });

  it("leaves unknown citation-like text as prose", () => {
    expect(splitPaperAiAnswer("未知 [X1-T3] 不应变成跳转。")).toEqual([
      { kind: "text", value: "未知 [X1-T3] 不应变成跳转。" },
    ]);
  });
});
