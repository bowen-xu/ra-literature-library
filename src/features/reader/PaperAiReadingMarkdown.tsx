import { ControlHint } from "@research-assistant/workbench-sdk/overlay";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import "katex/dist/katex.min.css";

import { splitPaperAiAnswer } from "./paperAiReadingModel";

// Local excerpt markers are not application resource addresses.
const CONTEXT_LINK_PREFIX = "#paper-context/";
const STREAM_RENDER_PACE_MS = 24;
const STREAM_RENDER_IMMEDIATE = 512;
const STREAM_RENDER_SNAP = /[\s.,!?;:)\]]/u;

interface MarkdownNode {
  readonly type: string;
  readonly value?: string;
  readonly url?: string;
  children?: MarkdownNode[];
}

function remarkPaperContextLinks(): (tree: MarkdownNode) => void {
  return (tree) => {
    function replaceTextChildren(parent: MarkdownNode): void {
      if (parent.type === "code" || parent.type === "inlineCode" || parent.type === "link"
        || parent.children === undefined) return;
      parent.children = parent.children.flatMap((child) => {
        if (child.type !== "text" || child.value === undefined) {
          replaceTextChildren(child);
          return [child];
        }
        return splitPaperAiAnswer(child.value).map((segment): MarkdownNode => segment.kind === "text"
          ? { type: "text", value: segment.value }
          : {
            type: "link",
            url: `${CONTEXT_LINK_PREFIX}${encodeURIComponent(segment.value)}`,
            children: [{ type: "text", value: `[${segment.value}]` }],
          });
      });
    }

    replaceTextChildren(tree);
  };
}

function pacedStep(size: number): number {
  if (size <= 12) return 2;
  if (size <= 48) return 4;
  if (size <= 96) return 8;
  return Math.min(256, Math.ceil(size / 4));
}

function nextPacedEnd(text: string, start: number): number {
  const end = Math.min(text.length, start + pacedStep(text.length - start));
  const max = Math.min(text.length, end + 8);
  for (let index = end; index < max; index += 1) {
    if (STREAM_RENDER_SNAP.test(text[index] ?? "")) return index + 1;
  }
  return end;
}

function streamingRenderValue(value: string): string {
  const lines = value.split("\n");
  let codeFence: { readonly character: string; readonly marker: string } | undefined;
  let blockMathOpen = false;
  for (const line of lines) {
    const fence = line.match(/^[ \t]{0,3}(`{3,}|~{3,})(.*)$/u);
    if (fence !== null) {
      const marker = fence[1] ?? "";
      const character = marker[0] ?? "";
      if (codeFence === undefined) {
        codeFence = { character, marker };
      } else if (character === codeFence.character
        && marker.length >= codeFence.marker.length
        && (fence[2] ?? "").trim().length === 0) {
        codeFence = undefined;
      }
      continue;
    }
    if (codeFence === undefined && line.trim() === "$$") blockMathOpen = !blockMathOpen;
  }
  if (codeFence !== undefined) return `${value}\n${codeFence.marker}`;
  if (blockMathOpen) return `${value}\n$$`;
  return value;
}

function streamingBlockFamily(value: string): "list" | "quote" | "indented" | undefined {
  const first = value.split("\n").find((line) => line.trim().length > 0) ?? "";
  if (/^[ \t]{0,3}(?:[-+*]|\d+[.)])[ \t]+/u.test(first)) return "list";
  if (/^[ \t]{0,3}>/u.test(first)) return "quote";
  if (/^(?: {2,}|\t)/u.test(first)) return "indented";
  return undefined;
}

function streamingMarkdownBlocks(value: string): readonly string[] {
  if (value.length === 0) return [];
  // Reference definitions can affect earlier blocks, so keep them in one live projection.
  if (/^[ \t]{0,3}\[[^\]]+\]:[ \t]*(?:\S+|$)/mu.test(value)) {
    return [streamingRenderValue(value)];
  }
  const lines = value.split(/(?<=\n)/u);
  const blocks: string[] = [];
  let current = "";
  let codeFence: { readonly character: string; readonly size: number } | undefined;
  let blockMathOpen = false;
  for (const line of lines) {
    current += line;
    const withoutNewline = line.replace(/\r?\n$/u, "");
    const fence = withoutNewline.match(/^[ \t]{0,3}(`{3,}|~{3,})(.*)$/u);
    if (fence !== null) {
      const marker = fence[1] ?? "";
      const character = marker[0] ?? "";
      if (codeFence === undefined) codeFence = { character, size: marker.length };
      else if (character === codeFence.character
        && marker.length >= codeFence.size
        && (fence[2] ?? "").trim().length === 0) codeFence = undefined;
      continue;
    }
    if (codeFence === undefined && withoutNewline.trim() === "$$") {
      blockMathOpen = !blockMathOpen;
      continue;
    }
    if (codeFence === undefined && !blockMathOpen && /^\s*$/u.test(withoutNewline)) {
      blocks.push(current);
      current = "";
    }
  }
  if (current.length > 0) blocks.push(current);
  if (blocks.length <= 1) return [streamingRenderValue(value)];

  const merged: string[] = [];
  for (const block of blocks) {
    const family = streamingBlockFamily(block);
    const previous = merged.at(-1);
    const previousFamily = previous === undefined ? undefined : streamingBlockFamily(previous);
    if (previous !== undefined
      && ((previousFamily === "list" && (family === "list" || family === "indented"))
        || (previousFamily === "quote" && family === "quote"))) {
      merged[merged.length - 1] = previous + block;
    } else {
      merged.push(block);
    }
  }
  const last = merged.length - 1;
  return merged.map((block, index) => index === last ? streamingRenderValue(block) : block);
}

function usePacedStreamingValue(value: string, streaming: boolean): string {
  const [visible, setVisible] = useState(streaming ? "" : value);
  const latestRef = useRef(value);
  const visibleRef = useRef(streaming ? "" : value);
  const streamingRef = useRef(streaming);
  const timerRef = useRef<number | undefined>(undefined);
  const tickRef = useRef<() => void>(() => undefined);

  const clearTimer = useCallback(() => {
    if (timerRef.current === undefined) return;
    window.clearTimeout(timerRef.current);
    timerRef.current = undefined;
  }, []);
  const sync = useCallback((next: string) => {
    visibleRef.current = next;
    setVisible(next);
  }, []);
  const schedule = useCallback(() => {
    if (timerRef.current !== undefined) return;
    timerRef.current = window.setTimeout(() => tickRef.current(), STREAM_RENDER_PACE_MS);
  }, []);

  tickRef.current = () => {
    timerRef.current = undefined;
    const latest = latestRef.current;
    const shown = visibleRef.current;
    if (!streamingRef.current || !latest.startsWith(shown) || latest.length <= shown.length) {
      sync(latest);
      return;
    }
    const backlog = latest.length - shown.length;
    const end = backlog <= STREAM_RENDER_IMMEDIATE
      ? latest.length
      : nextPacedEnd(latest, shown.length);
    sync(latest.slice(0, end));
    if (end < latest.length) schedule();
  };

  useEffect(() => {
    latestRef.current = value;
    streamingRef.current = streaming;
    const shown = visibleRef.current;
    if (!streaming || !value.startsWith(shown) || value.length < shown.length) {
      clearTimer();
      sync(value);
      return;
    }
    if (value.length > shown.length) schedule();
  }, [clearTimer, schedule, streaming, sync, value]);

  useEffect(() => clearTimer, [clearTimer]);
  return visible;
}

const MarkdownDocument = memo(function MarkdownDocument({
  value,
  onJump,
}: {
  readonly value: string;
  readonly onJump: (itemId: string) => void;
}): React.JSX.Element {
  return <ReactMarkdown
    components={{
      a: ({ children, href, ...props }) => {
        if (href?.startsWith(CONTEXT_LINK_PREFIX)) {
          const itemId = decodeURIComponent(href.slice(CONTEXT_LINK_PREFIX.length));
          return <ControlHint content={`跳转到来源 ${itemId}`}><button
            className="paper-ai-reading-citation"
            onClick={() => onJump(itemId)}
            type="button"
          >{children}</button></ControlHint>;
        }
        return <a {...props} href={href} rel="noreferrer" target="_blank">{children}</a>;
      },
    }}
    rehypePlugins={[rehypeKatex]}
    remarkPlugins={[remarkGfm, remarkMath, remarkPaperContextLinks]}
    urlTransform={(url) => url.startsWith(CONTEXT_LINK_PREFIX) ? url : defaultUrlTransform(url)}
  >{value}</ReactMarkdown>;
});

export function PaperAiReadingMarkdown({
  value,
  onJump,
  streaming = false,
}: {
  readonly value: string;
  readonly onJump: (itemId: string) => void;
  readonly streaming?: boolean;
}): React.JSX.Element {
  const visibleValue = usePacedStreamingValue(value, streaming);
  const onJumpRef = useRef(onJump);
  onJumpRef.current = onJump;
  const stableOnJump = useCallback((itemId: string) => onJumpRef.current(itemId), []);
  const blocks = streaming ? streamingMarkdownBlocks(visibleValue) : [visibleValue];
  return <div aria-busy={streaming} className="paper-ai-reading-assistant">
    {blocks.map((block, index) => <MarkdownDocument
      key={index}
      onJump={stableOnJump}
      value={block}
    />)}
  </div>;
}
