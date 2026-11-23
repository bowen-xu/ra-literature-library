/** @vitest-environment happy-dom */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { emptyNalState, type NalStatement, type NalVocabulary } from "@research-assistant/core/nal";
import { NalStatements } from "./NalStatements";

it("updates visible concept names after a rename and keeps annotation/deletion targets on their IDs", async () => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const statement: NalStatement = { id: "statement-id", subject: { kind: "concept", id: "domain-id" }, predicate: { kind: "concept", id: "parent-id" }, origin: "human" };
  const vocabulary: readonly NalVocabulary[] = [
    { atom: { kind: "concept", id: "domain-id" }, label: "AI领域" },
    { atom: { kind: "concept", id: "legacy-id" }, label: "AI领域" },
    { atom: { kind: "concept", id: "parent-id" }, label: "领域" },
  ];
  const mutate = vi.fn(async () => true), annotate = vi.fn();
  const controller = { state: { ...emptyNalState(), revision: 4, statements: [statement] }, vocabulary, busy: false, mutate };
  const previousConfirm = Object.getOwnPropertyDescriptor(window, "confirm");
  Object.defineProperty(window, "confirm", { configurable: true, value: vi.fn(() => true) });
  try {
    await act(async () => root.render(<NalStatements controller={controller} statements={[statement]} onAnnotate={annotate}/>));
    expect(host.querySelector("code")?.textContent).toBe("AI领域 → 领域");
    expect(host.textContent).not.toContain("domain-id");
    const renamed = vocabulary.map(v => v.atom.id === "domain-id" ? { ...v, label: "人工智能领域" } : v);
    await act(async () => root.render(<NalStatements controller={{ ...controller, vocabulary: renamed }} statements={[statement]} onAnnotate={annotate}/>));
    expect(host.querySelector("code")?.textContent).toBe("人工智能领域 → 领域");
    const buttons = host.querySelectorAll<HTMLButtonElement>("button");
    await act(async () => buttons[0]?.click());
    expect(annotate).toHaveBeenCalledWith({ kind: "statement", id: "statement-id", label: "人工智能领域 → 领域" });
    await act(async () => buttons[1]?.click());
    expect(mutate).toHaveBeenCalledWith({ kind: "delete_statement", id: "statement-id" }, 4);
    expect(statement.subject).toEqual({ kind: "concept", id: "domain-id" });
  } finally {
    await act(async () => root.unmount());
    host.remove();
    if (previousConfirm) Object.defineProperty(window, "confirm", previousConfirm);
    else Reflect.deleteProperty(window, "confirm");
  }
});
