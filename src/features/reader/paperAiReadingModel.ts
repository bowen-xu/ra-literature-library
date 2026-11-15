export interface PaperAiAnswerSegment {
  readonly kind: "text" | "context";
  readonly value: string;
}

const CONTEXT_ID_PATTERN = /\[(P\d+-(?:T|F|TABLE|G|KV|FORM|FIELD|REGION)\d+)\]/g;

export function splitPaperAiAnswer(value: string): readonly PaperAiAnswerSegment[] {
  const segments: PaperAiAnswerSegment[] = [];
  let cursor = 0;
  for (const match of value.matchAll(CONTEXT_ID_PATTERN)) {
    if (match.index === undefined) continue;
    if (match.index > cursor) {
      segments.push({ kind: "text", value: value.slice(cursor, match.index) });
    }
    segments.push({ kind: "context", value: match[1]! });
    cursor = match.index + match[0].length;
  }
  if (cursor < value.length) {
    segments.push({ kind: "text", value: value.slice(cursor) });
  }
  return segments;
}
