import { notify } from "@research-assistant/workbench-sdk/feedback";
import { useEffect, useMemo, useState } from "react";
import type { SourceAnchorSummary } from "@research-assistant/core/evidence";
import {
  STRUCTURED_READING_UNIT_KINDS,
  type KnowledgeEpistemicRole,
  type StructuredReadingUnit,
  type StructuredReadingUnitKind,
} from "@research-assistant/core/knowledge";
import type { ResearchProject } from "@research-assistant/core/project";

import { researchKnowledgeErrorMessage, type ResearchKnowledgeGateway } from "../../services/knowledgeGateway";
import { ResearchObjectHistory } from "./ResearchObjectHistory";
import { epistemicRoleLabels, provenanceLabels, readingUnitKindLabels } from "./knowledgeLabels";

interface ReadingUnitWorkspaceProps {
  readonly gateway: ResearchKnowledgeGateway;
  readonly project?: ResearchProject;
  readonly source?: SourceAnchorSummary;
}

type ReadingUnitRole = Exclude<KnowledgeEpistemicRole, "assertion" | "definition">;
const roles: readonly ReadingUnitRole[] = [
  "source_paraphrase", "synthesis", "inference", "hypothesis", "question", "working_note",
];

export function ReadingUnitWorkspace({ gateway, project, source }: ReadingUnitWorkspaceProps): React.JSX.Element {
  const [units, setUnits] = useState<readonly StructuredReadingUnit[]>([]);
  const [editing, setEditing] = useState<StructuredReadingUnit>();
  const [historyId, setHistoryId] = useState<string>();
  const [kind, setKind] = useState<StructuredReadingUnitKind>("other");
  const [role, setRole] = useState<ReadingUnitRole>("working_note");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [useSource, setUseSource] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const scopeLabel = useMemo(
    () => project === undefined ? "全部人工阅读单元" : `${project.title}的阅读单元`,
    [project],
  );

  async function refresh(): Promise<void> {
    setUnits(await gateway.listReadingUnits(project?.id));
  }

  useEffect(() => {
    let isActive = true;

    setIsLoading(true);
    void gateway.listReadingUnits(project?.id)
      .then((values) => { if (isActive) setUnits(values); })
      .catch((reason: unknown) => {
        if (isActive) notify.error(researchKnowledgeErrorMessage(reason));
      })
      .finally(() => {
        if (isActive) setIsLoading(false);
      });
    return () => { isActive = false; };
  }, [gateway, project?.id]);

  useEffect(() => {
    setUseSource(source !== undefined && editing === undefined);
    if (source !== undefined && editing === undefined && body.trim().length === 0) {
      setBody(source.annotationBody || source.quoteExact);
      setRole(source.annotationBody ? "working_note" : "source_paraphrase");
    }
  }, [source?.anchorId]);

  function startEdit(unit: StructuredReadingUnit): void {
    setEditing(unit);
    setKind(unit.unitKind);
    setRole(unit.epistemicRole);
    setTitle(unit.title);
    setBody(unit.body);
    setUseSource(false);


  }

  function resetForm(): void {
    setEditing(undefined);
    setKind("other");
    setRole("working_note");
    setTitle("");
    setBody("");
    setUseSource(source !== undefined);
  }

  async function save(): Promise<void> {
    setSaving(true);

    try {
      await gateway.saveReadingUnit({
        ...(editing === undefined ? {} : { id: editing.id, expectedRevision: editing.revision }),
        ...(project !== undefined
          ? { projectId: project.id }
          : editing?.projectId === undefined ? {} : { projectId: editing.projectId }),
        ...(useSource && source !== undefined ? {
          paperId: source.itemId,
          anchorId: source.anchorId,
          evidenceStance: "context" as const,
          evidenceRationale: "由用户从原文锚点创建",
        } : editing?.paperId === undefined ? {} : { paperId: editing.paperId }),
        unitKind: kind,
        title,
        body,
        epistemicRole: role,
        changeReason: editing === undefined ? "manual_create" : "manual_edit",
      });
      notify.info(editing === undefined ? "人工阅读单元已创建" : "阅读单元的新版本已保存");
      resetForm();
      await refresh();
    } catch (reason) {
      notify.error(`${researchKnowledgeErrorMessage(reason)}；你的编辑内容仍保留在表单中。`);
    } finally {
      setSaving(false);
    }
  }

  return <section className="knowledge-subworkspace">
    <header><div><span className="eyebrow">READING UNITS</span><h3>{scopeLabel}</h3></div><small>{units.length} 条</small></header>
    <div className="knowledge-editor-card">
      <strong>{editing === undefined ? "手工新建阅读单元" : `编辑 v${editing.revision}`}</strong>
      <div className="knowledge-field-row">
        <label>类型<select onChange={(event) => setKind(event.target.value as StructuredReadingUnitKind)} value={kind}>{STRUCTURED_READING_UNIT_KINDS.map((value) => <option key={value} value={value}>{readingUnitKindLabels[value]}</option>)}</select></label>
        <label>认识角色<select onChange={(event) => setRole(event.target.value as ReadingUnitRole)} value={role}>{roles.map((value) => <option key={value} value={value}>{epistemicRoleLabels[value]}</option>)}</select></label>
      </div>
      <label>标题（可选）<input onChange={(event) => setTitle(event.target.value)} value={title} /></label>
      <label>内容<textarea onChange={(event) => setBody(event.target.value)} placeholder="写下你的问题、转述、综合、推论或工作笔记" rows={5} value={body} /></label>
      {source !== undefined && editing === undefined && <label className="knowledge-source-toggle"><input checked={useSource} onChange={(event) => setUseSource(event.target.checked)} type="checkbox" />关联当前选中的原文锚点：{source.itemTitle} · 第 {source.pageLabel ?? source.pageIndex + 1} 页</label>}
      <div className="form-actions"><button className="ghost-button" disabled={editing === undefined && body.length === 0} onClick={resetForm} type="button">{editing === undefined ? "清空" : "取消编辑"}</button><button className="primary-button" disabled={saving || body.trim().length === 0} onClick={() => void save()} type="button">{saving ? "保存中…" : editing === undefined ? "创建" : "保存新版本"}</button></div>
    </div>
    <div aria-busy={isLoading} className="knowledge-object-list">
      {isLoading && <p role="status">正在读取阅读单元…</p>}
      {!isLoading && units.length === 0 && <p>还没有阅读单元。即使未配置 AI，也可以从空白或左侧原文创建。</p>}
      {units.map((unit) => <article key={unit.id}>
        <header><span>{readingUnitKindLabels[unit.unitKind]}</span><small>{provenanceLabels[unit.provenanceKind]} · v{unit.revision} · {unit.evidenceCount} 条来源</small></header>
        {unit.title && <h4>{unit.title}</h4>}<p>{unit.body}</p>
        <footer><span>{epistemicRoleLabels[unit.epistemicRole]}{unit.paperTitle ? ` · ${unit.paperTitle}` : ""}</span><div><button onClick={() => startEdit(unit)} type="button">编辑</button><button onClick={() => setHistoryId(unit.id)} type="button">版本</button></div></footer>
        {historyId === unit.id && <ResearchObjectHistory gateway={gateway} objectId={unit.id} objectKind="reading_unit" onClose={() => setHistoryId(undefined)} />}
      </article>)}
    </div>
  </section>;
}
