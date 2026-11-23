import type { ReaderFocusOwner } from "@research-assistant/core/reader";

const GROUP_ATTRIBUTE = "data-reader-focus-group";

export class ReaderFocusController {
  readonly #workspace: () => HTMLElement | null;

  constructor(workspace: () => HTMLElement | null) {
    this.#workspace = workspace;
  }

  ownerForTarget(target: EventTarget | null): ReaderFocusOwner | undefined {
    if (!(target instanceof Element)) return undefined;
    const group = target.closest<HTMLElement>(`[${GROUP_ATTRIBUTE}]`)?.dataset.readerFocusGroup;
    return group === "toolbar" || group === "view" || group === "navigation-sidebar"
      || group === "notes-sidebar" || group === "popup"
      ? group
      : undefined;
  }

  focus(owner: ReaderFocusOwner): boolean {
    const group = this.#workspace()?.querySelector<HTMLElement>(`[${GROUP_ATTRIBUTE}="${owner}"]`);
    if (group === null || group === undefined) return false;
    const target = group.matches("button, input, textarea, select, [tabindex]")
      ? group
      : group.querySelector<HTMLElement>("button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex='-1'])");
    if (target === null) return false;
    target.focus({ preventScroll: true });
    return true;
  }
}
