import { ActionMenuItem } from "@research-assistant/workbench-sdk/overlay";
import type { LiteratureType } from "@research-assistant/core/literature";

import {
  LITERATURE_BASIC_FIELDS,
  basicFieldLabel,
  isBasicFieldApplicable,
  type LiteratureBasicFieldKey,
} from "./literatureDetailModel";

interface LiteratureBasicFieldPickerProps {
  readonly itemType: LiteratureType;
  readonly selectedFields: readonly LiteratureBasicFieldKey[];
  readonly onToggle: (field: LiteratureBasicFieldKey) => void;
  readonly onReset: () => void;
}

export function LiteratureBasicFieldPicker({
  itemType,
  selectedFields,
  onToggle,
  onReset,
}: LiteratureBasicFieldPickerProps): React.JSX.Element {
  return (
    <>
      {LITERATURE_BASIC_FIELDS.filter((field) => isBasicFieldApplicable(itemType, field.key)).map((field) => (
        <ActionMenuItem hideOnClick={false}
          aria-checked={selectedFields.includes(field.key)}
          key={field.key}
          onClick={() => onToggle(field.key)}
          role="menuitemcheckbox"
          type="button"
        >
          <span aria-hidden="true">{selectedFields.includes(field.key) ? "✓" : ""}</span>
          {basicFieldLabel(field.key, itemType)}
        </ActionMenuItem>
      ))}
      <ActionMenuItem hideOnClick={false} className="basic-field-reset" onClick={onReset} role="menuitem" type="button">
        恢复默认
      </ActionMenuItem>
    </>
  );
}
