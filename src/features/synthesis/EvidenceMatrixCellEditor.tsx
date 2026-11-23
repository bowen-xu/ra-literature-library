import { notify } from "@research-assistant/workbench-sdk/feedback";
import { useEffect, useState } from "react";
import type { SourceAnchorSummary } from "@research-assistant/core/evidence";
import type { LiteratureItem } from "@research-assistant/core/literature";
import type {
  EvidenceMatrix,
  EvidenceMatrixCell,
  EvidenceMatrixDimension,
  EvidenceMatrixStatement,
} from "@research-assistant/core/synthesis";

import type { EvidenceMatrixGateway } from "../../services/evidenceMatrixGateway";

interface EvidenceMatrixCellEditorProps {
  readonly matrix: EvidenceMatrix;
  readonly cell: EvidenceMatrixCell | undefined;
  readonly paper: LiteratureItem;
  readonly dimension: EvidenceMatrixDimension;
  readonly sources: readonly SourceAnchorSummary[];
  readonly gateway: EvidenceMatrixGateway;
  readonly onClose: () => void;
  readonly onOpenSource: (source: SourceAnchorSummary) => Promise<void>;
  readonly onSaved: (cell: EvidenceMatrixCell) => void;
}

export function EvidenceMatrixCellEditor({
  matrix,
  cell,
  paper,
  dimension,
  sources,
  gateway,
  onClose,
  onOpenSource,
  onSaved,
}: EvidenceMatrixCellEditorProps): React.JSX.Element {
  const [coverageState, setCoverageState] = useState<EvidenceMatrixCell["coverageState"]>(
    cell?.coverageState ?? "unreviewed",
  );
  const [coverageNote, setCoverageNote] = useState(cell?.coverageNote ?? "");
  const [statements, setStatements] = useState<readonly EvidenceMatrixStatement[]>(
    cell?.statements ?? [],
  );
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setCoverageState(cell?.coverageState ?? "unreviewed");
    setCoverageNote(cell?.coverageNote ?? "");
    setStatements(cell?.statements ?? []);

  }, [cell?.id, cell?.revision, dimension.id, paper.id]);

  function updateStatement(id: string, patch: Partial<EvidenceMatrixStatement>): void {
    setStatements((current) => current.map((statement) =>
      statement.id === id ? { ...statement, ...patch } : statement));
  }

  function addStatement(): void {
    setCoverageState("populated");
    setStatements((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        text: "",
        epistemicRole: "source_paraphrase",
        evidenceAnchorIds: [],
      },
    ]);
  }

  function setCoverage(value: EvidenceMatrixCell["coverageState"]): void {
    setCoverageState(value);
    if (value !== "populated") setStatements([]);
  }

  function toggleEvidence(statementId: string, anchorId: string): void {
    const statement = statements.find((item) => item.id === statementId);
    if (statement === undefined) return;
    const selected = statement.evidenceAnchorIds.includes(anchorId);
    if (!selected && statement.evidenceAnchorIds.length >= 8) return;
    updateStatement(statementId, {
      evidenceAnchorIds: selected
        ? statement.evidenceAnchorIds.filter((id) => id !== anchorId)
        : [...statement.evidenceAnchorIds, anchorId],
    });
  }

  async function save(): Promise<void> {
    setBusy(true);

    try {
      const saved = await gateway.saveCell({
        matrixId: matrix.id,
        paperId: paper.id,
        dimensionId: dimension.id,
        coverageState,
        coverageNote,
        statements: coverageState === "populated" ? statements : [],
        ...(cell === undefined ? {} : { expectedRevision: cell.revision }),
        changeReason: cell === undefined ? "manual_cell_create" : "manual_cell_edit",
      });
      onSaved(saved);
      onClose();
    } catch (reason) {
      notify.error(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  }

  const canSave = coverageState !== "populated" || statements.length > 0
    && statements.every((statement) => statement.text.trim() !== ""
      && statement.evidenceAnchorIds.length > 0);

  return (
    <div className="matrix-cell-editor">
      <header>
        <div><span className="eyebrow">ATOMIC COMPARISON CELL</span><h4>{paper.title} × {dimension.label}</h4></div>
        <button onClick={onClose} type="button">关闭</button>
      </header>
      <label>
        单元覆盖状态
        <select
          disabled={busy}
          onChange={(event) => setCoverage(event.target.value as typeof coverageState)}
          value={coverageState}
        >
          <option value="unreviewed">尚未处理</option>
          <option value="not_found">已检查但未找到</option>
          <option value="populated">已有带证据陈述</option>
        </select>
      </label>
      <label>
        覆盖说明（可选）
        <textarea
          disabled={busy}
          onChange={(event) => setCoverageNote(event.target.value)}
          rows={2}
          value={coverageNote}
        />
      </label>
      {coverageState === "populated" && (
        <div className="matrix-statement-editors">
          {statements.map((statement, index) => (
            <section key={statement.id}>
              <header>
                <b>原子陈述 {index + 1}</b>
                <button
                  disabled={busy}
                  onClick={() => setStatements((current) => current.filter((item) => item.id !== statement.id))}
                  type="button"
                >
                  删除此陈述
                </button>
              </header>
              <textarea
                aria-label={`原子陈述 ${index + 1}`}
                disabled={busy}
                onChange={(event) => updateStatement(statement.id, { text: event.target.value })}
                rows={3}
                value={statement.text}
              />
              <label>
                认识角色
                <select
                  disabled={busy}
                  onChange={(event) => updateStatement(statement.id, {
                    epistemicRole: event.target.value as EvidenceMatrixStatement["epistemicRole"],
                  })}
                  value={statement.epistemicRole}
                >
                  <option value="source_paraphrase">来源转述</option>
                  <option value="synthesis">综合</option>
                  <option value="inference">推论</option>
                  <option value="hypothesis">假设</option>
                </select>
              </label>
              <div className="matrix-source-picker">
                <b>该陈述实际依据的原文（至少一条）</b>
                {sources.length === 0 && <small>先在这篇论文的 PDF 中创建高亮或页级笔记。</small>}
                {sources.map((source) => (
                  <div key={source.anchorId}>
                    <label>
                      <input
                        checked={statement.evidenceAnchorIds.includes(source.anchorId)}
                        disabled={busy}
                        onChange={() => toggleEvidence(statement.id, source.anchorId)}
                        type="checkbox"
                      />
                      <q>{source.quoteExact || source.annotationBody || "页级原文锚点"}</q>
                    </label>
                    <button onClick={() => void onOpenSource(source)} type="button">
                      第 {source.pageLabel ?? source.pageIndex + 1} 页 →
                    </button>
                  </div>
                ))}
              </div>
            </section>
          ))}
          <button disabled={busy || statements.length >= 20} onClick={addStatement} type="button">
            添加并列／冲突陈述
          </button>
        </div>
      )}
      <div className="form-actions">
        <button disabled={busy} onClick={onClose} type="button">取消</button>
        <button disabled={busy || !canSave} onClick={() => void save()} type="button">
          保存单元新版本
        </button>
      </div>
    </div>
  );
}
