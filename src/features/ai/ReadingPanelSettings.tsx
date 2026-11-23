import { Popover } from "@research-assistant/workbench-sdk/overlay";
import { PopoverDisclosure, PopoverProvider, usePopoverStore } from "@ariakit/react";
import { Settings2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import type { LlmModelSelection } from "@research-assistant/core/ai";
import { ControlHint } from "@research-assistant/workbench-sdk/overlay";
import { getAppStorage } from "@research-assistant/workbench-sdk/storage";
import { notify } from "@research-assistant/workbench-sdk/feedback";
import type { AiAssistanceGateway } from "@research-assistant/workbench-sdk/ai-assistance";
import { LlmRoutePicker } from "@research-assistant/workbench-sdk/model-route-picker";

export type ReadingTextSize = "small" | "default" | "large";
const textSizeKey = "research-assistant.reading-text-size.v1";

export function useReadingTextSize(): readonly [ReadingTextSize, (size: ReadingTextSize) => void] {
  const [size, setSize] = useState<ReadingTextSize>(() => {
    try { const saved = getAppStorage().getItem(textSizeKey); return saved === "small" || saved === "large" ? saved : "default"; }
    catch { return "default"; }
  });
  return [size, next => {
    setSize(next);
    try { getAppStorage().setItem(textSizeKey, next); }
    catch { notify.error("阅读字号未能保存，当前显示已调整。"); }
  }];
}

function SettingsPopover({ label, icon, children, kind }: {
  readonly label: string;
  readonly icon: ReactNode;
  readonly children: ReactNode;
  readonly kind: "model" | "display";
}): React.JSX.Element {
  const popover = usePopoverStore({ placement: "bottom-end" });
  return <PopoverProvider store={popover}>
    <div className="reading-settings-control">
      <ControlHint content={label} wrap><PopoverDisclosure store={popover} type="button" aria-label={label} className="reading-icon-action">{icon}</PopoverDisclosure></ControlHint>
      <Popover store={popover} portal fixed modal={false} unmountOnHide gutter={6} fitViewport overflowPadding={12}
        aria-label={label} className={`reading-settings-popover reading-settings-${kind}`}
        hideOnEscape={event => { event.stopPropagation(); return true; }}>
        {children}
      </Popover>
    </div>
  </PopoverProvider>;
}

export function ReadingModelSettings({ gateway, busy, onSelection }: {
  readonly gateway: AiAssistanceGateway;
  readonly busy: boolean;
  readonly onSelection: (selection: LlmModelSelection | undefined) => void;
}): React.JSX.Element {
  return <SettingsPopover label="辅助阅读模型设置" kind="model" icon={<Settings2 aria-hidden="true" size={15} />}>
    <LlmRoutePicker disabled={busy} gateway={gateway} legend="结构化阅读模型" onSelection={onSelection} taskKind="paper_overview" />
  </SettingsPopover>;
}

export function ReadingDisplaySettings({ textSize, onTextSizeChanged, highlightsVisible, onHighlightsChanged }: {
  readonly textSize: ReadingTextSize;
  readonly onTextSizeChanged: (size: ReadingTextSize) => void;
  readonly highlightsVisible: boolean | undefined;
  readonly onHighlightsChanged: (() => void) | undefined;
}): React.JSX.Element {
  return <SettingsPopover label="结构化阅读显示设置" kind="display" icon={<Settings2 aria-hidden="true" size={15} />}>
    <h4>阅读显示</h4>
    <label className="reading-settings-row">正文字号
      <select aria-label="结构化阅读正文字号" value={textSize} onChange={event => {
        const next = event.target.value;
        if (next === "small" || next === "default" || next === "large") onTextSizeChanged(next);
      }}><option value="small">较小</option><option value="default">默认</option><option value="large">较大</option></select>
    </label>
    {onHighlightsChanged !== undefined && <label className="reading-settings-toggle"><span>显示原文标记</span><input type="checkbox" role="switch" checked={highlightsVisible ?? false} onChange={onHighlightsChanged} /></label>}
  </SettingsPopover>;
}
