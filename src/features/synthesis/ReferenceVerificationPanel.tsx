import { notify } from "@research-assistant/workbench-sdk/feedback";
import { useEffect, useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import type { LiteratureItem } from "@research-assistant/core/literature";
import type {
  ReferenceFieldName,
  ReferenceIdentityState,
  ReferenceMetadataField,
  ReferenceParseState,
  ReferenceRecord,
} from "@research-assistant/core/synthesis";

import { DetectedReferences } from "./DetectedReferences";
import { getDoclingParserGateway, type DoclingParserGateway } from "@research-assistant/workbench-sdk/docling";
import { getLiteratureGateway } from "../../services/literatureGateway";
import { getReferenceRecordGateway } from "../../services/referenceRecordGateway";

interface ReferenceVerificationPanelProps {
  readonly onInitialLoadSettled?: (settled: boolean) => void;
  readonly doclingGateway?: DoclingParserGateway;
  readonly item: LiteratureItem;
  readonly onOpenAttachment: (attachment: LiteratureItem["attachments"][number]) => void;
}

const fieldLabels: Readonly<Record<ReferenceFieldName, string>> = {
  title: "标题",
  authors: "作者",
  year: "年份",
  doi: "DOI",
};

const identityLabels: Readonly<Record<ReferenceIdentityState, string>> = {
  unverified: "身份未核验",
  matched_existing: "已链接库内文献",
  verified_external: "已用外部元数据核验",
  ambiguous: "存在多个可能身份",
  not_found: "尚未找到可靠身份",
};

function fieldValue(record: ReferenceRecord, name: ReferenceFieldName): string {
  return record.fields.find((field) => field.name === name)?.value ?? "";
}

export function ReferenceVerificationPanel({
  item,
  doclingGateway: providedDoclingGateway,
  onOpenAttachment,
  onInitialLoadSettled,
}: ReferenceVerificationPanelProps): React.JSX.Element {
  const defaultDoclingGateway = useMemo(() => getDoclingParserGateway(), []);
  const doclingGateway = providedDoclingGateway ?? defaultDoclingGateway;
  const gateway = useMemo(() => getReferenceRecordGateway(), []);
  const literatureGateway = useMemo(() => getLiteratureGateway(), []);
  const [records, setRecords] = useState<readonly ReferenceRecord[]>([]);
  const [recordsLoaded, setRecordsLoaded] = useState(false);
  const [recordsSettled, setRecordsSettled] = useState(false);
  const [detectionSettled, setDetectionSettled] = useState(false);
  const [detectionOpened, setDetectionOpened] = useState(false);
  const [detectedCount, setDetectedCount] = useState<number>();
  const [editing, setEditing] = useState<ReferenceRecord>();
  const [rawText, setRawText] = useState("");
  const [fields, setFields] = useState<Readonly<Record<ReferenceFieldName, string>>>({
    title: "",
    authors: "",
    year: "",
    doi: "",
  });
  const [parseState, setParseState] = useState<ReferenceParseState>("unparsed");
  const [identityState, setIdentityState] = useState<ReferenceIdentityState>("unverified");
  const [matchedItemId, setMatchedItemId] = useState<string>();
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<readonly LiteratureItem[]>([]);
  const [busy, setBusy] = useState(false);

  async function refresh(): Promise<void> {
    setRecords(await gateway.list(item.id));
  }

  useEffect(() => {
    let active = true;
    setRecordsLoaded(false);
    setRecordsSettled(false);
    setDetectedCount(undefined);
    void gateway.list(item.id).then((next) => {
      if (active) { setRecords(next); setRecordsLoaded(true); }
    }).catch((reason: unknown) => {
      if (active) notify.error(reason instanceof Error ? reason.message : String(reason));
    }).finally(() => { if (active) setRecordsSettled(true); });
    return () => {
      active = false;
    };
  }, [gateway, item.id]);

  useEffect(() => {
    onInitialLoadSettled?.(recordsSettled && (!detectionOpened || detectionSettled));
  }, [recordsSettled, detectionSettled, detectionOpened, onInitialLoadSettled]);

  function startEdit(record: ReferenceRecord): void {
    setEditing(record);
    setRawText(record.rawText);
    setFields({
      title: fieldValue(record, "title"),
      authors: fieldValue(record, "authors"),
      year: fieldValue(record, "year"),
      doi: fieldValue(record, "doi"),
    });
    setParseState(record.parseState);
    setIdentityState(record.identityState);
    setMatchedItemId(record.matchedItemId);
    setQuery(fieldValue(record, "title") || record.rawText.slice(0, 120));
    setMatches([]);

  }

  async function searchMatches(): Promise<void> {
    setBusy(true);

    try {
      const candidates = await literatureGateway.list(query);
      setMatches(candidates.filter((candidate) => candidate.id !== item.id));
    } catch (reason) {
      notify.error(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  }

  async function save(): Promise<void> {
    if (editing === undefined) return;
    const nextFields = (Object.entries(fields) as [ReferenceFieldName, string][])
      .filter((entry) => entry[1].trim() !== "")
      .map(([name, value]) => ({
        name,
        value: value.trim(),
        sourceKind: "human",
        confirmedByUser: true,
      }) satisfies ReferenceMetadataField);
    setBusy(true);

    try {
      await gateway.save({
        id: editing.id,
        citingPaperId: editing.citingPaperId,
        sourceAnchorId: editing.sourceAnchorId,
        rawText,
        fields: nextFields,
        parseState,
        identityState,
        ...(identityState === "matched_existing" && matchedItemId !== undefined
          ? { matchedItemId }
          : {}),
        semanticState: editing.semanticState,
        ...(editing.usageKind === undefined ? {} : { usageKind: editing.usageKind }),
        usageSummary: editing.usageSummary,
        ...(editing.usageAnchorId === undefined ? {} : { usageAnchorId: editing.usageAnchorId }),
        expectedRevision: editing.revision,
        changeReason: "manual_reference_verification",
      });
      setEditing(undefined);
      await refresh();
    } catch (reason) {
      notify.error(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="paper-overview-ai reference-verification-panel" onToggle={event => {
      if (event.currentTarget.open) setDetectionOpened(true);
    }}>
      <summary><ChevronRight aria-hidden="true" size={14} /><span>参考文献{recordsLoaded && records.length === 0 && detectedCount === 0 && <span className="reference-empty-label">（未识别）</span>}</span></summary>
      {detectionOpened && <DetectedReferences key={item.id} item={item} gateway={doclingGateway} savedTexts={records.map(record => record.rawText)} onOpen={onOpenAttachment} onCountChanged={setDetectedCount} onInitialLoadSettled={setDetectionSettled} />}
      <div className="reference-record-list">
        {records.map((record) => (
          <article key={record.id}>
            <header>
              <b>{fieldValue(record, "title") || record.rawText.slice(0, 120)}</b>
              <small>v{record.revision} · {record.provenanceKind}</small>
            </header>
            <q>{record.rawText}</q>
            <div className="reference-state-row">
              <span>解析：{record.parseState}</span>
              <span>身份：{identityLabels[record.identityState]}</span>
              <span>语义：{record.semanticState === "reviewed" ? record.usageKind : "未审查"}</span>
            </div>
            {record.semanticState === "reviewed" && <p>{record.usageSummary}</p>}
            <button disabled={busy} onClick={() => startEdit(record)} type="button">编辑／核验</button>
          </article>
        ))}
      </div>
      {editing !== undefined && (
        <div className="reference-record-editor">
          <h4>核验参考条目 v{editing.revision}</h4>
          <label>
            原始条目
            <textarea onChange={(event) => setRawText(event.target.value)} rows={4} value={rawText} />
          </label>
          <div className="reference-field-grid">
            {(Object.keys(fieldLabels) as ReferenceFieldName[]).map((name) => (
              <label key={name}>
                {fieldLabels[name]}
                <input
                  onChange={(event) => setFields((current) => ({
                    ...current,
                    [name]: event.target.value,
                  }))}
                  value={fields[name]}
                />
              </label>
            ))}
          </div>
          <label>
            解析状态
            <select
              onChange={(event) => setParseState(event.target.value as ReferenceParseState)}
              value={parseState}
            >
              <option value="unparsed">未解析</option>
              <option value="parsed">已人工解析</option>
              <option value="failed">暂时无法解析</option>
            </select>
          </label>
          <label>
            身份状态
            <select
              onChange={(event) => {
                const state = event.target.value as ReferenceIdentityState;
                setIdentityState(state);
                if (state !== "matched_existing") setMatchedItemId(undefined);
              }}
              value={identityState}
            >
              {Object.entries(identityLabels).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          {identityState === "matched_existing" && (
            <div className="reference-match-picker">
              <label>
                检索库内文献
                <span>
                  <input onChange={(event) => setQuery(event.target.value)} value={query} />
                  <button disabled={busy || query.trim() === ""} onClick={() => void searchMatches()} type="button">
                    检索
                  </button>
                </span>
              </label>
              {matches.map((candidate) => (
                <button
                  aria-pressed={candidate.id === matchedItemId}
                  key={candidate.id}
                  onClick={() => setMatchedItemId(candidate.id)}
                  type="button"
                >
                  {candidate.title} · {candidate.issuedYear ?? "年份未知"} · {candidate.doi || "无 DOI"}
                </button>
              ))}
            </div>
          )}
          <div className="form-actions">
            <button disabled={busy} onClick={() => setEditing(undefined)} type="button">取消</button>
            <button
              disabled={busy || rawText.trim() === ""
                || identityState === "matched_existing" && matchedItemId === undefined}
              onClick={() => void save()}
              type="button"
            >
              保存新版本
            </button>
          </div>
        </div>
      )}
    </details>
  );
}
