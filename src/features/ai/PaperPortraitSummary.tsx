import type { Ref } from "react";
import { portraitDimensions, type PaperPortraitCandidateV1 } from "@research-assistant/core/ai";
import { MessagesSquare, ScanText, Sparkles, X } from "lucide-react";
import { ControlHint } from "@research-assistant/workbench-sdk/overlay";

export function PaperPortraitSummary({ payload, loading, failed, adopted, rejected, running, canceling = false, buttonRef, onOpen, onGenerate, onCancel, onOpenConversation, generateDisabled }: {
  readonly payload: PaperPortraitCandidateV1 | undefined;
  readonly loading: boolean;
  readonly failed: boolean;
  readonly adopted: boolean;
  readonly rejected: boolean;
  readonly running: boolean;
  readonly canceling?: boolean;
  readonly buttonRef: Ref<HTMLButtonElement>;
  readonly onOpen: () => void;
  readonly onGenerate: () => void;
  readonly onCancel?: () => void;
  readonly onOpenConversation?: () => void;
  readonly generateDisabled: boolean;
}): React.JSX.Element {
  const showCancel = running && onCancel !== undefined;
  return <section className="paper-portrait-panel paper-portrait-summary" aria-label="文献画像">
    <header><h3>文献画像{!running && !loading && !failed && payload === undefined && "（待生成）"}</h3><div>
      {(showCancel || !loading && !failed && payload === undefined) && <ControlHint content={showCancel ? canceling ? "正在取消生成" : "取消生成" : "生成画像"}><button type="button" className="portrait-icon-action" aria-label={showCancel ? "取消生成" : "生成画像"} disabled={showCancel ? canceling : generateDisabled} onClick={showCancel ? onCancel : onGenerate}>{showCancel ? <X size={15} aria-hidden="true" /> : <Sparkles size={15} aria-hidden="true" />}</button></ControlHint>}
      {onOpenConversation && <ControlHint content="打开画像内部对话"><button type="button" className="portrait-icon-action" data-agent-conversation-trigger aria-label="打开画像内部对话" onClick={onOpenConversation}><MessagesSquare size={15} aria-hidden="true"/></button></ControlHint>}
      <ControlHint content="查看画像详情"><button type="button" className="portrait-icon-action" aria-label="查看画像详情" ref={buttonRef} onClick={onOpen}><ScanText size={15} aria-hidden="true" /></button></ControlHint>
    </div></header>
    {loading ? <p className="portrait-summary-status" role="status">正在读取画像…</p> : failed ? <p className="portrait-summary-status" role="status">画像读取失败，请进入详情重试。</p>
      : payload === undefined ? null : <>
        {(rejected || adopted) && <small>{rejected ? "已丢弃 · 历史画像" : "人工已采纳"}</small>}
        <dl>{portraitDimensions(payload).map(({ id: dimension, title }) => <div key={dimension}>
          <dt>{title}</dt>
          <dd>{payload.claims.filter(claim => claim.dimension === dimension).map(claim => claim.label).join("、") || "不确定"}</dd>
        </div>)}</dl>
      </>}
    {running && <p className="portrait-summary-status" role="status">{canceling ? "正在取消画像生成…" : "正在生成画像…"}</p>}
  </section>;
}
