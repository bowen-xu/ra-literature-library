import { useNotificationState } from "@research-assistant/workbench-sdk/feedback";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  ReferenceRecord,
  ReferenceUsageKind,
} from "@research-assistant/core/synthesis";

import {
  getReferenceRecordGateway,
} from "../../services/referenceRecordGateway";

export type ReferenceCaptureValue =
  | { readonly kind: "new_reference"; readonly rawText: string }
  | {
      readonly kind: "usage";
      readonly record: ReferenceRecord;
      readonly usageKind: ReferenceUsageKind;
      readonly usageSummary: string;
    };

export interface ReferenceCaptureDraftState {
  readonly rawText: string;
  readonly mode: "new_reference" | "usage";
  readonly recordId: string;
  readonly usageKind: ReferenceUsageKind;
  readonly usageSummary: string;
}

interface ReferenceCapturePanelProps {
  readonly paperId: string;
  readonly selectedText: string;
  readonly rawText: string;
  readonly saving: boolean;
  readonly initialDraft?: ReferenceCaptureDraftState;
  readonly onCancel: () => void;
  readonly onDirtyChange?: (dirty: boolean) => void;
  readonly onDraftChange?: (draft: ReferenceCaptureDraftState) => void;
  readonly onRawTextChange: (value: string) => void;
  readonly onSave: (value: ReferenceCaptureValue) => void;
  readonly onStartAiExtraction: () => void;
}

export function ReferenceCapturePanel({
  paperId,
  selectedText,
  rawText,
  saving,
  initialDraft,
  onCancel,
  onDirtyChange,
  onDraftChange,
  onRawTextChange,
  onSave,
  onStartAiExtraction,
}: ReferenceCapturePanelProps): React.JSX.Element {
  const gateway = useMemo(() => getReferenceRecordGateway(), []);
  const [records, setRecords] = useState<readonly ReferenceRecord[]>([]);
  const [mode, setMode] = useState<"new_reference" | "usage">(initialDraft?.mode ?? "new_reference");
  const [recordId, setRecordId] = useState(initialDraft?.recordId ?? "");
  const [usageKind, setUsageKind] = useState<ReferenceUsageKind>(initialDraft?.usageKind ?? "mentions");
  const [usageSummary, setUsageSummary] = useState(initialDraft?.usageSummary ?? selectedText);
  const [, setError] = useNotificationState("error");
  const onDraftChangeRef = useRef(onDraftChange);

  useEffect(() => {
    onDraftChangeRef.current = onDraftChange;
  }, [onDraftChange]);

  useEffect(() => {
    onDraftChangeRef.current?.({ rawText, mode, recordId, usageKind, usageSummary });
  }, [mode, rawText, recordId, usageKind, usageSummary]);

  useEffect(() => {
    let active = true;
    void gateway.list(paperId).then((next) => {
      if (!active) return;
      setRecords(next);
      setRecordId((current) => next.some((record) => record.id === current) ? current : next[0]?.id ?? "");
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : String(reason));
    });
    return () => {
      active = false;
    };
  }, [gateway, paperId]);

  const selectedRecord = records.find((record) => record.id === recordId);
  const canSave = mode === "new_reference"
    ? rawText.trim() !== ""
    : selectedRecord !== undefined && usageSummary.trim() !== "";

  function submit(): void {
    if (mode === "new_reference") {
      onSave({ kind: mode, rawText: rawText.trim() });
      return;
    }
    if (selectedRecord !== undefined) {
      onSave({
        kind: mode,
        record: selectedRecord,
        usageKind,
        usageSummary: usageSummary.trim(),
      });
    }
  }

  return (
    <div className="selection-card reference-capture-card">
      <blockquote>{selectedText}</blockquote>
      <label>
        这段选区是
        <select
          disabled={saving}
          onChange={(event) => { onDirtyChange?.(true); setMode(event.target.value as typeof mode); }}
          value={mode}
        >
          <option value="new_reference">参考文献表中的原始条目</option>
          <option disabled={records.length === 0} value="usage">正文如何使用已有参考条目</option>
        </select>
      </label>
      {mode === "new_reference" ? (
        <label>
          原始参考条目（可修改识别错误）
          <textarea
            disabled={saving}
            onChange={(event) => { onDirtyChange?.(true); onRawTextChange(event.target.value); }}
            rows={4}
            value={rawText}
          />
        </label>
      ) : (
        <>
          <label>
            对应参考条目
            <select
              disabled={saving}
              onChange={(event) => { onDirtyChange?.(true); setRecordId(event.target.value); }}
              value={recordId}
            >
              {records.map((record) => (
                <option key={record.id} value={record.id}>{record.rawText.slice(0, 120)}</option>
              ))}
            </select>
          </label>
          <label>
            使用关系
            <select
              disabled={saving}
              onChange={(event) => { onDirtyChange?.(true); setUsageKind(event.target.value as ReferenceUsageKind); }}
              value={usageKind}
            >
              <option value="mentions">提及</option>
              <option value="uses_method">使用方法</option>
              <option value="supports">支持</option>
              <option value="opposes">反对</option>
              <option value="extends">扩展</option>
              <option value="background">背景</option>
            </select>
          </label>
          <label>
            你对“文中如何使用”的判断
            <textarea
              disabled={saving}
              onChange={(event) => { onDirtyChange?.(true); setUsageSummary(event.target.value); }}
              rows={3}
              value={usageSummary}
            />
          </label>
        </>
      )}

      <div className="form-actions">
        <button disabled={saving} onClick={onCancel} type="button">取消</button>
        {mode === "new_reference" && <button disabled={saving} onClick={onStartAiExtraction} type="button">AI 解析所选原文为候选</button>}
        <button disabled={saving || !canSave} onClick={submit} type="button">
          {mode === "new_reference" ? "保存原始条目" : "保存语义关系"}
        </button>
      </div>
      <small>你始终可以直接保存或修改原始条目；AI 只读取最初所选原文，当前人工修正会保留在此编辑器中。AI 解析、身份核验和正文语义是独立状态，AI 不会自动确认 DOI。</small>
    </div>
  );
}
