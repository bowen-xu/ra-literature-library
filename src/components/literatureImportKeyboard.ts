import type { KeyboardEvent } from "react";

/** Explicit field navigation; ordinary application Tab traversal stays disabled. */
export function navigateManualImportFields(event: KeyboardEvent<HTMLFormElement>): void {
  if (event.key !== "Tab" || event.altKey || event.ctrlKey || event.metaKey
    || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
  const fields = [...event.currentTarget.querySelectorAll<HTMLElement>('.manual-grid :is(input, select, textarea)[data-tab-action="both"]:not(:disabled)')];
  const index = fields.indexOf(event.target as HTMLElement);
  if (index < 0) return;
  event.preventDefault();
  event.stopPropagation();
  fields[(index + (event.shiftKey ? -1 : 1) + fields.length) % fields.length]?.focus();
}
