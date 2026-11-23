import { ControlHint } from "@research-assistant/workbench-sdk/overlay";
import type { AnnotationSaveState } from "./annotations/AnnotationController";

/** Successful saves stay quiet; pending and recoverable failures remain visible. */
export function AnnotationSaveFeedback({ state, error, onRetry }: {
  readonly state: AnnotationSaveState;
  readonly error: string | undefined;
  readonly onRetry: () => void;
}): React.JSX.Element | null {
  if (state === "saved") return null;
  return <div aria-live="polite" className={`annotation-save-state ${state}`}>
    <ControlHint content={error}><span>{state === "saving" ? "正在保存…" : state === "dirty" ? "有未保存更改" : state === "conflict" ? "版本冲突，需重试" : "保存失败"}</span></ControlHint>
    {(state === "failed" || state === "conflict") && <button onClick={onRetry} type="button">重试</button>}
  </div>;
}
