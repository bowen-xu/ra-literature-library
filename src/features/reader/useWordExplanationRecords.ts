import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { normalizeDictionaryQuery, type StoredWordExplanation, type WordExplanation, type WordExplanationStore } from "@research-assistant/core/dictionary";
import type { PdfPendingSelection } from "../knowledge/PdfSelectionActions";
import { getWordExplanationStore } from "@research-assistant/workbench-sdk/dictionary";
import { notify } from "@research-assistant/workbench-sdk/feedback";

export function useWordExplanationRecords(attachmentId: string, contentSha256: string, supplied?: WordExplanationStore): {
  readonly records: readonly StoredWordExplanation[];
  readonly save: (selection: PdfPendingSelection, explanation: WordExplanation) => Promise<void>;
  readonly remove: (record: StoredWordExplanation) => Promise<void>;
} {
  const store = useMemo(() => supplied ?? getWordExplanationStore(), [supplied]);
  const [records, setRecords] = useState<readonly StoredWordExplanation[]>([]);
  const identity = `${attachmentId}:${contentSha256}`;
  const current = useRef(identity); current.current = identity;
  useEffect(() => {
    let disposed = false; setRecords([]);
    void store.list(attachmentId, contentSha256).then(values => { if (!disposed) setRecords(current => [...values.filter(value => !current.some(saved => saved.id === value.id)), ...current]); })
      .catch(error => { if (!disposed) notify.error(error instanceof Error ? error.message : "词义解释读取失败，请重新打开文章重试。"); });
    return () => { disposed = true; };
  }, [attachmentId, contentSha256, store]);
  const save = useCallback(async (selection: PdfPendingSelection, explanation: WordExplanation): Promise<void> => {
    const record = await store.save({ attachmentId, contentSha256,
      context: { word: normalizeDictionaryQuery(selection.text), before: selection.context?.before ?? selection.prefix, after: selection.context?.after ?? selection.suffix },
      segments: selection.segments.map(segment => ({ pageIndex: segment.pageIndex, text: segment.text, rects: segment.rects, prefix: segment.prefix, suffix: segment.suffix })), explanation });
    if (current.current === identity) setRecords(values => [...values.filter(value => value.id !== record.id), record]);
  }, [attachmentId, contentSha256, identity, store]);
  const remove = useCallback(async (record: StoredWordExplanation): Promise<void> => {
    await store.remove(record);
    if (current.current === identity) setRecords(values => values.filter(value => value.id !== record.id));
  }, [identity, store]);
  return { records, save, remove };
}
