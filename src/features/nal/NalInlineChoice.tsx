import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { NoteActionMenu, NoteActionMenuItem } from "@research-assistant/workbench-sdk/block-controls";

/** Enum choices are atomic commands: choosing an item commits and closes. */
export function NalInlineChoice<T extends string>({ value, label, display, choices, onChange, onClear, disabled, children }: {
  readonly value: T | undefined;
  readonly label: string;
  readonly display: string;
  readonly choices: readonly { readonly value: T; readonly label: string; readonly disabled?: boolean }[];
  readonly onChange: (value: T) => void;
  readonly onClear?: () => void;
  readonly disabled: boolean;
  readonly children?: ReactNode;
}): React.JSX.Element {
  return <NoteActionMenu className="nal-inline-choice" label={label} trigger={display} triggerClassName="nal-inline-token"
    triggerRender={<button onDoubleClick={event => event.stopPropagation()} />} disabled={disabled} portal>
    {choices.map(choice => <NoteActionMenuItem key={choice.value} role="menuitemradio" aria-checked={value === choice.value} disabled={choice.disabled ?? false}
      onClick={() => { if (value !== choice.value) onChange(choice.value); }}><span>{choice.label}</span>{value === choice.value && <Check aria-hidden="true" />}</NoteActionMenuItem>)}
    {onClear && <NoteActionMenuItem disabled={value === undefined} onClick={onClear}>清空</NoteActionMenuItem>}
    {children}
  </NoteActionMenu>;
}
