import { notify } from "@research-assistant/workbench-sdk/feedback";
import { useEffect, useMemo, useState } from "react";
import type { SourceAnchorSummary } from "@research-assistant/core/evidence";
import type { LiteratureItem } from "@research-assistant/core/literature";
import type { ResearchProject } from "@research-assistant/core/project";
import type {
  EvidenceMatrix,
  EvidenceMatrixCell,
  EvidenceMatrixDimension,
} from "@research-assistant/core/synthesis";

import { getEvidenceMatrixGateway } from "../../services/evidenceMatrixGateway";
import { getLiteratureGateway } from "../../services/literatureGateway";
import { EvidenceMatrixCellEditor } from "./EvidenceMatrixCellEditor";
import "./EvidenceMatrixPanel.css";

interface EvidenceMatrixPanelProps {
  readonly project: ResearchProject;
  readonly sources: readonly SourceAnchorSummary[];
  readonly onOpenSource: (source: SourceAnchorSummary) => Promise<void>;
}

interface OpenCell {
  readonly paper: LiteratureItem;
  readonly dimension: EvidenceMatrixDimension;
}

function move<T>(items: readonly T[], index: number, offset: -1 | 1): readonly T[] {
  const target = index + offset;
  if (target < 0 || target >= items.length) return items;
  const next = [...items];
  [next[index], next[target]] = [next[target] as T, next[index] as T];
  return next;
}

export function EvidenceMatrixPanel({
  project,
  sources,
  onOpenSource,
}: EvidenceMatrixPanelProps): React.JSX.Element {
  const gateway = useMemo(() => getEvidenceMatrixGateway(), []);
  const literatureGateway = useMemo(() => getLiteratureGateway(), []);
  const [papers, setPapers] = useState<readonly LiteratureItem[]>([]);
  const [matrices, setMatrices] = useState<readonly EvidenceMatrix[]>([]);
  const [selected, setSelected] = useState<EvidenceMatrix>();
  const [cells, setCells] = useState<readonly EvidenceMatrixCell[]>([]);
  const [title, setTitle] = useState("");
  const [paperIds, setPaperIds] = useState<readonly string[]>([]);
  const [dimensions, setDimensions] = useState<readonly EvidenceMatrixDimension[]>([]);
  const [openCell, setOpenCell] = useState<OpenCell>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void Promise.all([literatureGateway.list(), gateway.list(project.id)]).then(
      ([allPapers, nextMatrices]) => {
        if (!active) return;
        setPapers(allPapers.filter((paper) => paper.projectIds.includes(project.id)));
        setMatrices(nextMatrices);
      },
    ).catch((reason: unknown) => {
      if (active) notify.error(reason instanceof Error ? reason.message : String(reason));
    });
    return () => {
      active = false;
    };
  }, [gateway, literatureGateway, project.id]);

  async function selectMatrix(matrix: EvidenceMatrix): Promise<void> {
    setSelected(matrix);
    setTitle(matrix.title);
    setPaperIds(matrix.paperIds);
    setDimensions(matrix.dimensions);
    setOpenCell(undefined);

    setCells(await gateway.listCells(matrix.id));
  }

  function startNew(): void {
    setSelected(undefined);
    setTitle("");
    setPaperIds([]);
    setDimensions([{ id: crypto.randomUUID(), label: "" }]);
    setCells([]);
    setOpenCell(undefined);

  }

  function togglePaper(paperId: string): void {
    setPaperIds((current) => current.includes(paperId)
      ? current.filter((id) => id !== paperId)
      : current.length >= 20 ? current : [...current, paperId]);
  }

  function updateDimension(id: string, label: string): void {
    setDimensions((current) => current.map((dimension) =>
      dimension.id === id ? { ...dimension, label } : dimension));
  }

  async function saveMatrix(): Promise<void> {
    setBusy(true);

    try {
      const saved = await gateway.save({
        ...(selected === undefined ? {} : { id: selected.id, expectedRevision: selected.revision }),
        projectId: project.id,
        title,
        paperIds,
        dimensions,
        changeReason: selected === undefined ? "manual_matrix_create" : "manual_matrix_edit",
      });
      setMatrices(await gateway.list(project.id));
      await selectMatrix(saved);
    } catch (reason) {
      notify.error(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  }

  function cellFor(paperId: string, dimensionId: string): EvidenceMatrixCell | undefined {
    return cells.find((cell) => cell.paperId === paperId && cell.dimensionId === dimensionId);
  }

  const selectedPapers = paperIds
    .map((paperId) => papers.find((paper) => paper.id === paperId))
    .filter((paper): paper is LiteratureItem => paper !== undefined);
  const canSaveStructure = title.trim() !== ""
    && paperIds.length >= 2
    && dimensions.length > 0
    && dimensions.every((dimension) => dimension.label.trim() !== "");

  return (
    <section className="evidence-matrix-panel">
      <header>
        <div><span className="eyebrow">EVIDENCE MATRIX</span><h3>多文献证据矩阵</h3></div>
        <p>结构由你决定；每个单元要么逐条引用原文，要么明确标为“已检查但未找到”。</p>
      </header>
      <div className="matrix-toolbar">
        <label>
          已有矩阵
          <select
            disabled={busy}
            onChange={(event) => {
              const matrix = matrices.find((item) => item.id === event.target.value);
              if (matrix !== undefined) {
                void selectMatrix(matrix).catch((reason: unknown) => {
                  notify.error(reason instanceof Error ? reason.message : String(reason));
                });
              }
            }}
            value={selected?.id ?? ""}
          >
            <option value="">选择矩阵</option>
            {matrices.map((matrix) => (
              <option key={matrix.id} value={matrix.id}>{matrix.title} · v{matrix.revision}</option>
            ))}
          </select>
        </label>
        <button disabled={busy} onClick={startNew} type="button">新建矩阵</button>
      </div>
      {(selected !== undefined || dimensions.length > 0) && (
        <div className="matrix-structure-editor">
          <label>矩阵标题<input onChange={(event) => setTitle(event.target.value)} value={title} /></label>
          <fieldset>
            <legend>论文（至少两篇，可调整顺序）</legend>
            {papers.map((paper) => {
              const index = paperIds.indexOf(paper.id);
              return (
                <div key={paper.id}>
                  <label><input checked={index >= 0} onChange={() => togglePaper(paper.id)} type="checkbox" />{paper.title}</label>
                  {index >= 0 && <span><button onClick={() => setPaperIds((items) => move(items, index, -1))} type="button">↑</button><button onClick={() => setPaperIds((items) => move(items, index, 1))} type="button">↓</button></span>}
                </div>
              );
            })}
          </fieldset>
          <fieldset>
            <legend>比较维度（可添加、删除、重排）</legend>
            {dimensions.map((dimension, index) => (
              <div key={dimension.id}>
                <input aria-label={`比较维度 ${index + 1}`} onChange={(event) => updateDimension(dimension.id, event.target.value)} placeholder="例如：方法、样本、核心主张、限制" value={dimension.label} />
                <button onClick={() => setDimensions((items) => move(items, index, -1))} type="button">↑</button>
                <button onClick={() => setDimensions((items) => move(items, index, 1))} type="button">↓</button>
                <button disabled={dimensions.length === 1} onClick={() => setDimensions((items) => items.filter((item) => item.id !== dimension.id))} type="button">删除</button>
              </div>
            ))}
            <button disabled={dimensions.length >= 20} onClick={() => setDimensions((items) => [...items, { id: crypto.randomUUID(), label: "" }])} type="button">添加维度</button>
          </fieldset>
          <button disabled={busy || !canSaveStructure} onClick={() => void saveMatrix()} type="button">{selected === undefined ? "创建矩阵" : "保存矩阵结构新版本"}</button>
        </div>
      )}
      {selected !== undefined && (
        <div className="matrix-table-scroll">
          <table>
            <thead><tr><th>论文</th>{selected.dimensions.map((dimension) => <th key={dimension.id}>{dimension.label}</th>)}</tr></thead>
            <tbody>
              {selectedPapers.map((paper) => (
                <tr key={paper.id}>
                  <th>{paper.title}</th>
                  {selected.dimensions.map((dimension) => {
                    const cell = cellFor(paper.id, dimension.id);
                    return (
                      <td key={dimension.id}>
                        <button onClick={() => setOpenCell({ paper, dimension })} type="button">
                          {cell === undefined || cell.coverageState === "unreviewed" ? "尚未处理" : cell.coverageState === "not_found" ? "已检查 · 未找到" : `${cell.statements.length} 条有来源陈述`}
                        </button>
                        {cell?.statements.map((statement) => <p key={statement.id}>{statement.text}</p>)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {selected !== undefined && openCell !== undefined && (
        <EvidenceMatrixCellEditor
          cell={cellFor(openCell.paper.id, openCell.dimension.id)}
          dimension={openCell.dimension}
          gateway={gateway}
          matrix={selected}
          onClose={() => setOpenCell(undefined)}
          onOpenSource={onOpenSource}
          onSaved={(saved) => setCells((current) => [saved, ...current.filter((cell) => cell.id !== saved.id)])}
          paper={openCell.paper}
          sources={sources.filter((source) => source.itemId === openCell.paper.id)}
        />
      )}
    </section>
  );
}
