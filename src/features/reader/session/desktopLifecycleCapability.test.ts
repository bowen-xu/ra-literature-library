import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

interface CapabilityDocument {
  readonly permissions: readonly string[];
}

describe("desktop lifecycle capability", () => {
  it("allows hiding the main window without granting native close", () => {
    const path = resolve(process.cwd(), "apps/desktop/src-tauri/capabilities/main.json");
    const capability = JSON.parse(readFileSync(path, "utf8")) as CapabilityDocument;

    expect(capability.permissions).toContain("core:window:allow-hide");
    expect(capability.permissions).not.toContain("core:window:allow-close");
  });
});
