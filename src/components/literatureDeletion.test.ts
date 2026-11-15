import { describe, expect, it } from "vitest";

import { formatLiteratureTrashConfirmation, trashRetentionLabel } from "./literatureDeletion";

describe("literature trash interaction", () => {
  it("explains the recoverable 14-day retention policy", () => {
    const message = formatLiteratureTrashConfirmation("Recoverable paper");

    expect(message).toContain("移入回收站");
    expect(message).toContain("完整保留");
    expect(message).toContain("14 天内恢复");
    expect(message).toContain("自动永久清理");
  });

  it("reports remaining retention days", () => {
    const now = Date.parse("2026-08-15T00:00:00.000Z");
    expect(trashRetentionLabel("2026-08-02T00:00:00.000Z", now)).toBe("还可保留 1 天");
    expect(trashRetentionLabel("2026-08-01T00:00:00.000Z", now)).toBe("即将自动清理");
  });
});
