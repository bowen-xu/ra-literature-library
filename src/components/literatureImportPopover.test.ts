import { describe, expect, it } from "vitest";

import { calculateImportPopoverPosition } from "./literatureImportPopover";

const anchor = { top: 40, right: 130, bottom: 70, left: 100, width: 30, height: 30 };

describe("literature import popover position", () => {
  it("anchors the manual editor below its toolbar button", () => {
    expect(calculateImportPopoverPosition("manual", anchor, { width: 1200, height: 800 })).toEqual({
      left: 72,
      top: 78,
      width: 720,
    });
  });

  it("keeps a floating editor within narrow viewport edges", () => {
    const position = calculateImportPopoverPosition(
      "manual",
      { ...anchor, left: 470, right: 500 },
      { width: 500, height: 700 },
    );

    expect(position.left).toBe(8);
    expect(position.width).toBe(484);
  });

  it("moves above its trigger when the measured panel would overflow below", () => {
    const position = calculateImportPopoverPosition(
      "doi",
      { top: 660, right: 130, bottom: 690, left: 100, width: 30, height: 30 },
      { width: 1200, height: 800 },
      300,
    );

    expect(position.top).toBe(352);
  });
});
