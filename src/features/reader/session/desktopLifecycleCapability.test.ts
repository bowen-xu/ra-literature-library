import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Electron desktop lifecycle bridge", () => {
  it("exposes hide and visibility without a renderer close operation", () => {
    const path = resolve(process.cwd(), "../../ra-workbench/apps/desktop/src/main/renderer-bridge.ts");
    const bridge = readFileSync(path, "utf8");
    expect(bridge).toContain("desktop:window-hide");
    expect(bridge).toContain("desktop:window-visible");
    expect(bridge).not.toContain("desktop:window-close");
  });
});
