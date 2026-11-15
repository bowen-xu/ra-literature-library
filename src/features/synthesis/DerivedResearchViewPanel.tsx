import { notify } from "@research-assistant/workbench-sdk/feedback";
import { useEffect, useMemo, useState } from "react";
import type { AiRun } from "@research-assistant/core/ai";
import type { SourceAnchorSummary } from "@research-assistant/core/evidence";
import type { LiteratureItem } from "@research-assistant/core/literature";
import type { ResearchProject } from "@research-assistant/core/project";
import type {
  DerivedResearchView,
  DerivedResearchViewKind,
  DerivedViewItem,
  EvidenceMatrix,
  EvidenceMatrixCell,
} from "@research-assistant/core/synthesis";

import { getDerivedResearchViewGateway } from "../../services/derivedViewGateway";
import { getEvidenceMatrixGateway } from "../../services/evidenceMatrixGateway";
import { getLiteratureGateway } from "../../services/literatureGateway";
import { AiMatrixSynthesisPreview } from "../ai/AiMatrixSynthesisPreview";
import {
  matrixSynthesisIssue,
  type MatrixSynthesisDraftInput,
} from "../ai/researchTaskDrafts";
import "./DerivedResearchViewPanel.css";

interface DerivedResearchViewPanelProps {
  readonly project: ResearchProject;
  readonly refreshVersion: number;
  readonly sources: readonly SourceAnchorSummary[];
  readonly onOpenSource: (source: SourceAnchorSummary) => Promise<void>;
  readonly onAiRunStarted: (run: AiRun) => void;
}

interface InputOption {
  readonly cell: EvidenceMatrixCell;
  readonly matrix: EvidenceMatrix;
  readonly label: string;
}

const kindLabels: Readonly<Record<DerivedResearchViewKind, string>> = {
  taxonomy: "Taxonomy 候选",
  historical_context: "历史脉络",
  gap_hypothesis: "领域空白假设",
  innovation_hypothesis: "创新建议假设",
};

function isHypothesisKind(kind: DerivedResearchViewKind): boolean {
  return kind === "gap_hypothesis" || kind === "innovation_hypothesis";
}

export function DerivedResearchViewPanel({
  project,
  refreshVersion,
  sources,
  onOpenSource,
  onAiRunStarted,
}: DerivedResearchViewPanelProps): React.JSX.Element {
  const gateway = useMemo(() => getDerivedResearchViewGateway(), []);
  const matrixGateway = useMemo(() => getEvidenceMatrixGateway(), []);
  const literatureGateway = useMemo(() => getLiteratureGateway(), []);
  const [views, setViews] = useState<readonly DerivedResearchView[]>([]);
  const [inputOptions, setInputOptions] = useState<readonly InputOption[]>([]);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isAiPreviewOpen, setIsAiPreviewOpen] = useState(false);
  const [editing, setEditing] = useState<DerivedResearchView>();
  const [viewKind, setViewKind] = useState<DerivedResearchViewKind>("taxonomy");
  const [title, setTitle] = useState("");
  const [scopeNote, setScopeNote] = useState("");
  const [inputIds, setInputIds] = useState<readonly string[]>([]);
  const [items, setItems] = useState<readonly DerivedViewItem[]>([]);
  const [reviewState, setReviewState] = useState<DerivedResearchView["reviewState"]>("unreviewed");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void Promise.all([
      gateway.list(project.id),
      matrixGateway.list(project.id),
      literatureGateway.list(),
    ]).then(async ([nextViews, matrices, papers]) => {
      const cellsByMatrix = await Promise.all(matrices.map(async (matrix) => ({
        matrix,
        cells: await matrixGateway.listCells(matrix.id),
      })));
      if (!active) return;
      const paperMap = new Map(papers.map((paper) => [paper.id, paper] as const));
      setViews(nextViews);
      setInputOptions(cellsByMatrix.flatMap(({ matrix, cells }) => cells
        .filter((cell) => cell.coverageState === "populated")
        .map((cell) => ({
          matrix,
          cell,
          label: inputLabel(matrix, cell, paperMap.get(cell.paperId)),
        }))));
    }).catch((reason: unknown) => {
      if (active) notify.error(reason instanceof Error ? reason.message : String(reason));
    });
    return () => {
      active = false;
    };
  }, [gateway, literatureGateway, matrixGateway, project.id, refreshVersion]);

  function startNew(): void {
    setIsEditorOpen(true);
    setIsAiPreviewOpen(false);
    setEditing(undefined);
    setViewKind("taxonomy");
    setTitle("");
    setScopeNote("");
    setInputIds([]);
    setItems([]);
    setReviewState("unreviewed");

  }

  function startEdit(view: DerivedResearchView): void {
    setIsEditorOpen(true);
    setIsAiPreviewOpen(false);
    setEditing(view);
    setViewKind(view.viewKind);
    setTitle(view.title);
    setScopeNote(view.scopeNote);
    setInputIds(view.inputs.map((input) => input.objectId));
    setItems(view.items);
    setReviewState(view.reviewState);

  }

  function confirmDiscardDraft(): boolean {
    return !hasEditorChanges || globalThis.confirm("当前人工派生视图有未保存修改。确定放弃这些修改吗？");
  }

  function beginNew(): void {
    if (confirmDiscardDraft()) startNew();
  }

  function beginEdit(view: DerivedResearchView): void {
    if (confirmDiscardDraft()) startEdit(view);
  }

  function toggleInput(cellId: string): void {
    setInputIds((current) => current.includes(cellId)
      ? current.filter((id) => id !== cellId)
      : [...current, cellId]);
  }

  function updateItem(id: string, patch: Partial<DerivedViewItem>): void {
    setItems((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));
  }

  function addItem(): void {
    setItems((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        text: "",
        epistemicRole: isHypothesisKind(viewKind) ? "hypothesis" : "synthesis",
        evidenceAnchorIds: [],
        hasConflict: false,
      },
    ]);
  }

  function toggleEvidence(itemId: string, anchorId: string): void {
    const item = items.find((value) => value.id === itemId);
    if (item === undefined) return;
    const selected = item.evidenceAnchorIds.includes(anchorId);
    if (!selected && item.evidenceAnchorIds.length >= 16) return;
    updateItem(itemId, {
      evidenceAnchorIds: selected
        ? item.evidenceAnchorIds.filter((id) => id !== anchorId)
        : [...item.evidenceAnchorIds, anchorId],
    });
  }

  async function save(): Promise<void> {
    const inputs = inputIds.map((id) => {
      const preserved = editing?.inputs.find((input) => input.objectId === id);
      if (preserved !== undefined) return preserved;
      const option = inputOptions.find((item) => item.cell.id === id);
      if (option === undefined) throw new Error("所选矩阵单元已不可用");
      return {
        objectKind: "matrix_cell" as const,
        objectId: option.cell.id,
        objectRevision: option.cell.revision,
        selectionReason: "用户显式选择为派生视图输入",
      };
    });
    setBusy(true);

    try {
      const saved = await gateway.save({
        ...(editing === undefined ? {} : { id: editing.id, expectedRevision: editing.revision }),
        projectId: project.id,
        viewKind,
        title,
        scopeNote,
        inputs,
        items,
        reviewState,
        changeReason: editing === undefined ? "manual_derived_view_create" : "manual_derived_view_edit",
      });
      setViews(await gateway.list(project.id));
      startEdit(saved);
    } catch (reason) {
      notify.error(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  }

  const allowedAnchorIds = new Set(inputOptions
    .filter((option) => inputIds.includes(option.cell.id))
    .flatMap((option) => option.cell.statements.flatMap((statement) => statement.evidenceAnchorIds)));
  editing?.items.forEach((item) => {
    item.evidenceAnchorIds.forEach((anchorId) => allowedAnchorIds.add(anchorId));
  });
  const allowedSources = [...allowedAnchorIds]
    .map((anchorId) => sources.find((source) => source.anchorId === anchorId))
    .filter((source): source is SourceAnchorSummary => source !== undefined);
  const canSave = title.trim() !== ""
    && inputIds.length > 0
    && items.length > 0
    && items.every((item) => item.text.trim() !== ""
      && item.evidenceAnchorIds.length > 0
      && item.evidenceAnchorIds.every((id) => allowedAnchorIds.has(id))
      && (!isHypothesisKind(viewKind) || item.epistemicRole === "hypothesis"));
  const hasEditorChanges = editing === undefined
    ? viewKind !== "taxonomy" || title !== "" || scopeNote !== "" || inputIds.length > 0
      || items.length > 0 || reviewState !== "unreviewed"
    : viewKind !== editing.viewKind || title !== editing.title
      || scopeNote !== editing.scopeNote
      || JSON.stringify(inputIds) !== JSON.stringify(editing.inputs.map((input) => input.objectId))
      || JSON.stringify(items) !== JSON.stringify(editing.items)
      || reviewState !== editing.reviewState;
  const selectedOptions = inputIds
    .map((id) => inputOptions.find((option) => option.cell.id === id))
    .filter((option): option is InputOption => option !== undefined);
  const aiDraftInput: MatrixSynthesisDraftInput = {
    projectId: project.id,
    viewKind,
    title,
    scopeNote,
    inputs: selectedOptions.map((option) => ({
      matrixId: option.matrix.id,
      matrixRevision: option.matrix.revision,
      cellId: option.cell.id,
      cellRevision: option.cell.revision,
      paperId: option.cell.paperId,
      evidenceAnchorIds: option.cell.statements.flatMap((statement) =>
        statement.evidenceAnchorIds),
    })),
  };
  const aiIssue = selectedOptions.length === inputIds.length
    ? matrixSynthesisIssue(aiDraftInput)
    : "所选矩阵单元已不可用，请重新选择";

  return (
    <section className="derived-view-panel">
      <header>
        <div><span className="eyebrow">DERIVED RESEARCH VIEWS</span><h3>领域派生视图</h3></div>
        <p>这些视图只从你明确选择的证据矩阵单元派生；不是自动写入知识图的事实。</p>
      </header>
      <div className="derived-view-list">
        {views.map((view) => (
          <button key={view.id} onClick={() => beginEdit(view)} type="button">
            <b>{view.title}</b>
            <span>{kindLabels[view.viewKind]} · {view.reviewState} · v{view.revision}</span>
            <small>{view.inputs.length} 个输入 · {view.items.length} 条有来源内容</small>
          </button>
        ))}
        <button onClick={beginNew} type="button">＋ 新建人工派生视图</button>
      </div>
      {isEditorOpen && (
        <div className="derived-view-editor">
          {isAiPreviewOpen ? (
            <AiMatrixSynthesisPreview
              input={aiDraftInput}
              onCancel={() => setIsAiPreviewOpen(false)}
              onStarted={(run) => {
                setIsAiPreviewOpen(false);
                onAiRunStarted(run);
              }}
            />
          ) : <>
          <label>视图类型<select onChange={(event) => {
            const kind = event.target.value as DerivedResearchViewKind;
            setViewKind(kind);
            if (isHypothesisKind(kind)) {
              setItems((current) => current.map((item) => ({ ...item, epistemicRole: "hypothesis" })));
            }
          }} value={viewKind}>{Object.entries(kindLabels).map(([kind, label]) => <option key={kind} value={kind}>{label}</option>)}</select></label>
          <label>标题<input onChange={(event) => setTitle(event.target.value)} value={title} /></label>
          <label>输入范围与限制<textarea onChange={(event) => setScopeNote(event.target.value)} rows={3} value={scopeNote} /></label>
          <fieldset><legend>显式选择已填充的矩阵单元</legend>{inputOptions.map((option) => {
            const fixedRevision = editing?.inputs.find((input) => input.objectId === option.cell.id)
              ?.objectRevision;
            const revisionLabel = fixedRevision === undefined || fixedRevision === option.cell.revision
              ? `v${option.cell.revision}`
              : `固定 v${fixedRevision}；当前 v${option.cell.revision}`;
            return <label key={option.cell.id}><input checked={inputIds.includes(option.cell.id)} onChange={() => toggleInput(option.cell.id)} type="checkbox" />{option.label} · {revisionLabel}</label>;
          })}</fieldset>
          <div className="derived-view-items">
            {items.map((item, index) => (
              <section key={item.id}>
                <header><b>派生条目 {index + 1}</b><button aria-label={`删除派生条目 ${index + 1}`} onClick={() => setItems((current) => current.filter((value) => value.id !== item.id))} type="button">删除</button></header>
                <textarea aria-label={`派生条目 ${index + 1}`} onChange={(event) => updateItem(item.id, { text: event.target.value })} rows={3} value={item.text} />
                {!isHypothesisKind(viewKind) && <label>认识角色<select onChange={(event) => updateItem(item.id, { epistemicRole: event.target.value as DerivedViewItem["epistemicRole"] })} value={item.epistemicRole}><option value="synthesis">综合</option><option value="inference">推论</option><option value="hypothesis">假设</option></select></label>}
                <label><input checked={item.hasConflict} onChange={(event) => updateItem(item.id, { hasConflict: event.target.checked })} type="checkbox" />包含未解决冲突</label>
                <div className="derived-source-picker">{allowedSources.map((source) => <div key={source.anchorId}><label><input checked={item.evidenceAnchorIds.includes(source.anchorId)} onChange={() => toggleEvidence(item.id, source.anchorId)} type="checkbox" /><q>{source.quoteExact || source.annotationBody}</q></label><button onClick={() => void onOpenSource(source)} type="button">原文 →</button></div>)}</div>
              </section>
            ))}
            <button disabled={items.length >= 100} onClick={addItem} type="button">添加派生条目</button>
          </div>
          <label>人工审查状态<select onChange={(event) => setReviewState(event.target.value as typeof reviewState)} value={reviewState}><option value="unreviewed">待审查</option><option value="deferred">暂缓</option><option value="accepted">{isHypothesisKind(viewKind) ? "接受为工作假设" : "接受为当前工作视图"}</option><option value="rejected">拒绝</option></select></label>
          {isHypothesisKind(viewKind) && <small>即使接受，这些内容仍显示为待检验假设，不表示已发现空白或创新。</small>}
          <div className="form-actions"><button disabled={busy} onClick={beginNew} type="button">清空</button><button disabled={busy || aiIssue !== undefined} onClick={() => setIsAiPreviewOpen(true)} type="button">AI 生成待审查综合</button><button disabled={busy || !canSave} onClick={() => void save()} type="button">保存派生视图新版本</button></div>
          {aiIssue !== undefined && <small>AI 综合：{aiIssue}。人工派生视图仍可按当前规则单独保存。</small>}
          </>}
        </div>
      )}
    </section>
  );
}

function inputLabel(
  matrix: EvidenceMatrix,
  cell: EvidenceMatrixCell,
  paper: LiteratureItem | undefined,
): string {
  const dimension = matrix.dimensions.find((item) => item.id === cell.dimensionId);
  return `${matrix.title} / ${paper?.title ?? cell.paperId} / ${dimension?.label ?? cell.dimensionId}`;
}
