import { useState, type ReactNode } from "react";
import { ChevronDown, Highlighter, NotebookPen } from "lucide-react";
import { ActionMenu, ActionMenuItem } from "@research-assistant/workbench-sdk/overlay";
import { ControlHint } from "@research-assistant/workbench-sdk/overlay";

const colors = [
  { label: "黄色", color: "#f4cf65" }, { label: "绿色", color: "#91d5a3" },
  { label: "蓝色", color: "#91bde8" }, { label: "粉色", color: "#efa4bf" }, { label: "紫色", color: "#c3a5e8" },
] as const;

export function PdfSelectionHighlightControl({ disabled, onHighlight, initialColor = "#f4cf65" }: {
  readonly disabled: boolean;
  readonly onHighlight: (color: string) => void;
  readonly initialColor?: string;
}): React.JSX.Element {
  return <PdfSelectionColorControl disabled={disabled} onApply={onHighlight} initialColor={initialColor} label="高亮" actionLabel="高亮" icon={<Highlighter aria-hidden="true" size={16} />} />;
}

export function PdfSelectionNoteControl({ disabled, onWriteNote, initialColor = "#f4cf65" }: {
  readonly disabled: boolean; readonly onWriteNote: (color: string) => void; readonly initialColor?: string;
}): React.JSX.Element {
  return <PdfSelectionColorControl disabled={disabled} onApply={onWriteNote} initialColor={initialColor} label="便签" actionLabel="写笔记" icon={<NotebookPen aria-hidden="true" size={16} />} anchorAction />;
}

function PdfSelectionColorControl({ disabled, onApply, initialColor, label, actionLabel, icon, anchorAction = false }: {
  readonly disabled: boolean; readonly onApply: (color: string) => void; readonly initialColor: string;
  readonly label: string; readonly actionLabel: string; readonly icon: ReactNode; readonly anchorAction?: boolean;
}): React.JSX.Element {
  const [selected, setSelected] = useState<{ readonly label: string; readonly color: string }>(() => colors.find(option => option.color === initialColor) ?? { label: "当前颜色", color: initialColor });
  return <div className="selection-highlight-control">
    <ControlHint content={actionLabel}>
      <button aria-label={actionLabel} data-popup-anchor={anchorAction ? "true" : undefined} className="selection-highlight-apply" disabled={disabled} onClick={() => onApply(selected.color)} type="button">
        {icon}<span aria-hidden="true" className="selection-color-swatch" style={{ background: selected.color }} />
      </button>
    </ControlHint>
    <ActionMenu label={`选择${label}颜色`} menuLabel={`${label}预设颜色`} hint disabled={disabled} className="selection-highlight-picker"
      triggerClassName="selection-highlight-options" contentClassName="selection-highlight-color-menu" trigger={<ChevronDown aria-hidden="true" size={12} />}>
      {colors.map(option => <ControlHint key={option.color} content={`${option.label}${label}`}>
        <ActionMenuItem role="menuitemradio" aria-label={`${option.label}${label}`} aria-checked={selected.color === option.color} onClick={() => setSelected(option)}>
          <span aria-hidden="true" className="selection-color-swatch" style={{ background: option.color }} />
        </ActionMenuItem>
      </ControlHint>)}
    </ActionMenu>
  </div>;
}
