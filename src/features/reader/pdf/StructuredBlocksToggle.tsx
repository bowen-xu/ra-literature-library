import { Blocks, LoaderCircle } from "lucide-react";
import { ControlHint } from "@research-assistant/workbench-sdk/overlay";

export function StructuredBlocksToggle({ enabled, preparing, onToggle }: {
  readonly enabled: boolean;
  readonly preparing: boolean;
  readonly onToggle: () => void;
}): React.JSX.Element {
  return <ControlHint content={preparing ? "正在解析 PDF…" : enabled ? "隐藏结构化块" : "显示结构化块"}>
    <button
      aria-label={preparing ? "正在解析 PDF 结构化块" : enabled ? "隐藏 Docling 结构化块" : "显示 Docling 结构化块"}
      aria-pressed={enabled}
      aria-busy={preparing}
      className={enabled ? "reader-structured-toggle active" : "reader-structured-toggle"}
      disabled={preparing}
      onClick={onToggle}
      type="button"
    >
      {preparing ? <LoaderCircle aria-hidden="true" className="spinning" /> : <Blocks aria-hidden="true" />}
    </button>
  </ControlHint>;
}
