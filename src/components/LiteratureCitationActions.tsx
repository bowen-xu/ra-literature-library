import { ChevronDown, Copy, Download } from "lucide-react";
import type { CitationStyle, StructuredExportFormat } from "@research-assistant/core/citation";
import { ActionMenu, ActionMenuItem } from "@research-assistant/workbench-sdk/overlay";
import { CitationStyleSelect } from "@research-assistant/workbench-sdk/ui";
import "./LiteratureCitationActions.css";

export function LiteratureCitationActions({ style, onStyleChange, onCopy, onExport }: {
  readonly style: CitationStyle;
  readonly onStyleChange: (style: CitationStyle) => void;
  readonly onCopy: (kind: "citation" | "bibliography") => Promise<void>;
  readonly onExport: (format: StructuredExportFormat) => void;
}): React.JSX.Element {
  return <div className="literature-citation-actions" role="group" aria-label="引用与导出">
    <span className="literature-citation-heading">引用</span>
    <CitationStyleSelect value={style} onChange={onStyleChange} />
    <ActionMenu label="复制引用" className="literature-citation-menu" triggerClassName="literature-citation-trigger" contentClassName="literature-citation-popup" hint portal placement="bottom-end"
      trigger={<><Copy size={15} aria-hidden="true" /><ChevronDown size={10} aria-hidden="true" /></>}>
      <ActionMenuItem onClick={() => void onCopy("citation")}>复制文内引用</ActionMenuItem>
      <ActionMenuItem onClick={() => void onCopy("bibliography")}>复制参考文献</ActionMenuItem>
    </ActionMenu>
    <ActionMenu label="导出文献" className="literature-citation-menu" triggerClassName="literature-citation-trigger" contentClassName="literature-citation-popup" hint portal placement="bottom-end"
      trigger={<><Download size={15} aria-hidden="true" /><ChevronDown size={10} aria-hidden="true" /></>}>
      <ActionMenuItem onClick={() => onExport("bibtex")}>BibTeX</ActionMenuItem>
      <ActionMenuItem onClick={() => onExport("ris")}>RIS</ActionMenuItem>
      <ActionMenuItem onClick={() => onExport("csl-json")}>CSL JSON</ActionMenuItem>
    </ActionMenu>
  </div>;
}
