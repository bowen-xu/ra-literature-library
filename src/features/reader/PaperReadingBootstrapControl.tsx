import type {
  LlmModelSelection,
  PaperAiReadingSessionSummary,
  PaperReadingBootstrapOptions,
} from "@research-assistant/core/ai";

interface ControlProps {
  readonly checked: boolean;
  readonly currentModel?: LlmModelSelection;
  readonly disabled: boolean;
  readonly onChange: (checked: boolean) => void;
  readonly options?: PaperReadingBootstrapOptions;
}

export function PaperReadingBootstrapControl({
  checked,
  currentModel,
  disabled,
  onChange,
  options,
}: ControlProps): React.JSX.Element {
  const history = options?.structuredHistory;
  const canReuse = history !== undefined;
  return (
    <section aria-label="新会话启动方式" className="paper-reading-bootstrap-control">
      <label>
        <input
          checked={checked && canReuse}
          disabled={disabled || !canReuse}
          onChange={(event) => onChange(event.target.checked)}
          type="checkbox"
        />
        包含本次结构化阅读历史
      </label>
      {history === undefined
        ? <small>{options?.unavailableReason ?? "正在检查可复用的结构化阅读历史…"}</small>
        : <div>
          <small>
            已完成：{history.completedTurns.includes("paper_concept_map")
              ? "结构化阅读、关键概念抽取" : "结构化阅读"}
          </small>
          <small>
            来源：{history.attachmentCount} 个 PDF · 历史模型：{history.providerId} / {history.modelId}
          </small>
          {currentModel !== undefined && (
            <small>当前聊天模型：{currentModel.providerId} / {currentModel.modelId}</small>
          )}
          {checked && <small className="warning">包含未经人工确认的 AI 候选；它们不是事实。</small>}
        </div>}
      {!checked && <small>全新论文会话：仅发送论文内容，不包含概要和概念候选。</small>}
    </section>
  );
}

export function PaperReadingBootstrapBadge({
  session,
}: { readonly session: PaperAiReadingSessionSummary }): React.JSX.Element {
  return (
    <span className="paper-reading-bootstrap-badge">
      {session.bootstrapKind === "structured_history" ? "复用结构化历史" : "全新论文会话"}
    </span>
  );
}
