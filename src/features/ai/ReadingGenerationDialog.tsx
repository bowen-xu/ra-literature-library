import { Dialog } from "@research-assistant/workbench-sdk/overlay";
import { DialogHeading } from "@ariakit/react";
import { useState, type RefObject } from "react";
import type { ReadingOverwriteScope } from "./readingPresentation";

export function ReadingGenerationDialog({ mode, finalFocus, onClose, onConfirm }: {
  readonly mode: "regenerate" | "clear";
  readonly finalFocus: RefObject<HTMLButtonElement | null>;
  readonly onClose: () => void;
  readonly onConfirm: (scope: ReadingOverwriteScope) => void;
}): React.JSX.Element {
  const [scope, setScope] = useState<ReadingOverwriteScope>("ai_unreviewed");
  return <Dialog open onClose={onClose} finalFocus={finalFocus} className="portrait-tag-dialog reading-generation-dialog" backdrop={<div className="portrait-detail-backdrop" />}>
    <DialogHeading>{mode === "clear" ? "清空结构化阅读记录" : "重新生成结构化阅读"}</DialogHeading>
    <p>{mode === "clear" ? "将清空当前结构化阅读记录。模板绑定与审核记录保留；重新生成的内容将作为新增差异显示。" : "新结果将覆盖所选范围的当前阅读内容。生成失败或取消时保留原有数据，新内容通过 Keep／Undo 审阅。"}</p>
    {mode === "regenerate" && <fieldset><legend>覆盖范围</legend>
      <label><input type="radio" name="reading-overwrite" checked={scope === "ai_unreviewed"} onChange={() => setScope("ai_unreviewed")} />仅未审核的 AI 数据</label>
      <label><input type="radio" name="reading-overwrite" checked={scope === "human_unreviewed"} onChange={() => setScope("human_unreviewed")} />人工编辑但未审核的数据</label>
      <label><input type="radio" name="reading-overwrite" checked={scope === "all"} onChange={() => setScope("all")} />所有数据（包括已审核和人工编辑）</label>
    </fieldset>}
    <footer><button type="button" onClick={onClose}>取消</button><button type="button" onClick={() => onConfirm(scope)}>{mode === "clear" ? "确认清空" : "确认重新生成"}</button></footer>
  </Dialog>;
}
