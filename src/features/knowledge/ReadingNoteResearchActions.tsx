import { notify } from "@research-assistant/workbench-sdk/feedback";
import { useMemo, useState } from "react";
import type { ReadingNoteBlock } from "@research-assistant/core/notes";
import type { ResearchProject } from "@research-assistant/core/project";

import { getResearchKnowledgeGateway, researchKnowledgeErrorMessage } from "../../services/knowledgeGateway";
import { ConceptCapturePanel, type ConceptCaptureValue } from "./ConceptCapturePanel";

interface ReadingNoteResearchActionsProps {
  readonly note: ReadingNoteBlock;
  readonly project?: ResearchProject;
  readonly disabled?: boolean;
}

export function ReadingNoteResearchActions({ note, project, disabled = false }: ReadingNoteResearchActionsProps): React.JSX.Element {
  const gateway = useMemo(() => getResearchKnowledgeGateway(), []);
  const [mode, setMode] = useState<"closed" | "concept" | "reading">("closed");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState(note.body || note.source.quoteExact);
  const [saving, setSaving] = useState(false);
  const hasAnchor = note.source.anchorId !== undefined;

  async function captureConcept(value: ConceptCaptureValue): Promise<void> {
    if (disabled) return;
    if (note.source.anchorId === undefined) throw new Error("这条阅读笔记没有稳定原文锚点");
    setSaving(true);
    try {
      await gateway.captureConceptUsage({
        ...value,
        anchorId: note.source.anchorId,
      }, {
        paperId: note.source.paperId,
        paperTitle: note.source.paperTitle,
        attachmentId: note.source.attachmentId,
        contentSha256: note.source.contentSha256,
        pageIndex: note.source.pageIndex,
        ...(note.source.pageLabel === undefined ? {} : { pageLabel: note.source.pageLabel }),
        quoteExact: note.source.quoteExact,
      });
      notify.info("概念用法已从这条阅读笔记关联到知识库");
      setMode("closed");
    } finally {
      setSaving(false);
    }
  }

  async function createReadingUnit(): Promise<void> {
    if (disabled) return;
    if (note.source.anchorId === undefined) throw new Error("这条阅读笔记没有稳定原文锚点");
    setSaving(true);

    try {
      await gateway.saveReadingUnit({
        ...(project === undefined ? {} : { projectId: project.id }),
        paperId: note.source.paperId,
        anchorId: note.source.anchorId,
        evidenceStance: "context",
        evidenceRationale: "由用户从阅读笔记创建",
        unitKind: "other",
        title,
        body,
        epistemicRole: "working_note",
        changeReason: "reading_note_capture",
      });
      notify.info("人工阅读单元已创建并关联原文来源");
      setMode("closed");
    } catch (reason) {
      notify.error(`${researchKnowledgeErrorMessage(reason)}；你的阅读单元草稿仍保留。`);
    } finally {
      setSaving(false);
    }
  }

  return <section className="reading-note-research-actions" hidden={disabled} inert={disabled}>
    <div className="reading-note-actions">
      <button disabled={disabled || !hasAnchor} onClick={() => setMode("concept")} type="button">添加概念</button>
      <button disabled={disabled || !hasAnchor} onClick={() => setMode("reading")} type="button">创建阅读单元</button>
    </div>
    {!hasAnchor && <small>来源锚点不可用；当前只能保留笔记快照，不能伪造研究对象来源。</small>}
    {mode === "concept" && <ConceptCapturePanel gateway={gateway} initialTerm={note.source.quoteExact || note.body} onCancel={() => setMode("closed")} onSave={(value) => void captureConcept(value).catch((reason: unknown) => notify.error(researchKnowledgeErrorMessage(reason)))} quoteExact={note.source.quoteExact} saving={saving || disabled} />}
    {mode === "reading" && <div className="knowledge-editor-card"><strong>从阅读笔记创建人工阅读单元</strong><label>标题（可选）<input disabled={disabled} onChange={(event) => setTitle(event.target.value)} value={title} /></label><label>内容<textarea disabled={disabled} onChange={(event) => setBody(event.target.value)} rows={4} value={body} /></label><div className="form-actions"><button className="ghost-button" disabled={saving || disabled} onClick={() => setMode("closed")} type="button">取消</button><button className="primary-button" disabled={saving || disabled || !body.trim()} onClick={() => void createReadingUnit()} type="button">创建并关联来源</button></div></div>}
  </section>;
}
