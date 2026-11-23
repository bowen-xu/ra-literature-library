import { notify } from "@research-assistant/workbench-sdk/feedback";
import { useEffect, useMemo, useState } from "react";
import type { SourceAnchorSummary } from "@research-assistant/core/evidence";
import {
  RELATION_PREDICATE_KINDS,
  type RelationAssertion,
  type RelationNodeSummary,
  type RelationPredicateKind,
} from "@research-assistant/core/knowledge";
import type { ResearchProject } from "@research-assistant/core/project";

import {
  researchKnowledgeErrorMessage,
  type ResearchKnowledgeGateway,
} from "../../services/knowledgeGateway";
import { ResearchObjectHistory } from "./ResearchObjectHistory";
import { provenanceLabels } from "./knowledgeLabels";

interface RelationWorkspaceProps {
  readonly gateway: ResearchKnowledgeGateway;
  readonly project?: ResearchProject;
  readonly source?: SourceAnchorSummary;
}

const predicateLabels: Readonly<Record<RelationPredicateKind, string>> = {
  broader_than: "广于",
  narrower_than: "窄于",
  competes_with: "竞争解释",
  historically_derived_from: "历史派生自",
  approximately_corresponds_to: "近似对应",
  defines: "定义",
  discusses: "讨论",
  supports: "支持",
  opposes: "反对",
  related_to: "相关",
  depends_on: "依赖",
  builds_on: "基于",
  extends: "扩展",
  redefines: "重新定义",
  contrasts_with: "对照",
  part_of: "属于",
};

const nodeKindLabels: Readonly<Record<RelationNodeSummary["kind"], string>> = {
  concept: "概念",
  definition_claim: "定义",
  reading_unit: "阅读单元",
  paper: "文献",
  note_page: "笔记",
};

function nodeKey(node: Pick<RelationNodeSummary, "kind" | "id">): string {
  return `${node.kind}:${node.id}`;
}

export function RelationWorkspace({
  gateway,
  project,
  source,
}: RelationWorkspaceProps): React.JSX.Element {
  const [relations, setRelations] = useState<readonly RelationAssertion[]>([]);
  const [nodes, setNodes] = useState<readonly RelationNodeSummary[]>([]);
  const [editing, setEditing] = useState<RelationAssertion>();
  const [historyId, setHistoryId] = useState<string>();
  const [query, setQuery] = useState("");
  const [subject, setSubject] = useState<RelationNodeSummary>();
  const [object, setObject] = useState<RelationNodeSummary>();
  const [predicate, setPredicate] = useState<RelationPredicateKind>("related_to");
  const [scopeNote, setScopeNote] = useState("");
  const [useSource, setUseSource] = useState(false);
  const [evidenceStance, setEvidenceStance] = useState<"supports" | "opposes" | "context">("supports");
  const [evidenceRationale, setEvidenceRationale] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function refreshRelations(): Promise<void> {
    setRelations(await gateway.listRelationAssertions(project?.id));
  }

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    void Promise.all([
      gateway.listRelationAssertions(project?.id),
      gateway.searchRelationNodes(""),
    ]).then(([nextRelations, nextNodes]) => {
      if (active) { setRelations(nextRelations); setNodes(nextNodes); }
    }).catch((reason: unknown) => {
      if (active) notify.error(researchKnowledgeErrorMessage(reason));
    }).finally(() => { if (active) setIsLoading(false); });
    return () => { active = false; };
  }, [gateway, project?.id]);

  useEffect(() => {
    let active = true;
    const timeoutId = window.setTimeout(() => {
      void gateway.searchRelationNodes(query).then((values) => {
        if (active) setNodes(values);
      }).catch((reason: unknown) => {
        if (active) notify.error(researchKnowledgeErrorMessage(reason));
      });
    }, 180);
    return () => { active = false; window.clearTimeout(timeoutId); };
  }, [gateway, query]);

  const selectableNodes = useMemo(() => {
    const values = [...nodes];
    for (const endpoint of [subject, object]) {
      if (endpoint === undefined) continue;
      if (!values.some((node) => nodeKey(node) === nodeKey(endpoint))) values.push(endpoint);
    }
    return values;
  }, [nodes, object, subject]);

  function resetForm(): void {
    setEditing(undefined); setSubject(undefined); setObject(undefined);
    setPredicate("related_to"); setScopeNote(""); setUseSource(false);
    setEvidenceStance("supports"); setEvidenceRationale("");
  }

  function startEdit(relation: RelationAssertion): void {
    setEditing(relation);
    setSubject(relation.subject); setObject(relation.object);
    setPredicate(relation.predicateKind); setScopeNote(relation.scopeNote);
    setUseSource(false); setEvidenceRationale("");
  }

  async function save(): Promise<void> {
    if (subject === undefined || object === undefined) return;
    setSaving(true);
    try {
      await gateway.saveRelationAssertion({
        ...(editing === undefined ? {} : { id: editing.id, expectedRevision: editing.revision }),
        ...(project === undefined
          ? editing?.projectId === undefined ? {} : { projectId: editing.projectId }
          : { projectId: project.id }),
        subject: { kind: subject.kind, id: subject.id },
        predicateKind: predicate,
        object: { kind: object.kind, id: object.id },
        scopeNote,
        ...(useSource && source !== undefined ? {
          anchorId: source.anchorId,
          evidenceStance,
          evidenceRationale,
        } : {}),
        changeReason: editing === undefined ? "manual_create" : "manual_edit",
      });
      notify.info(editing === undefined ? "人工关系断言已创建" : "关系断言的新版本已保存");
      resetForm();
      await refreshRelations();
    } catch (reason) {
      notify.error(`${researchKnowledgeErrorMessage(reason)}；你的编辑内容仍保留在表单中。`);
    } finally { setSaving(false); }
  }

  return <section className="knowledge-subworkspace relation-workspace">
    <header><div><span className="eyebrow">RELATION ASSERTIONS</span><h3>关系断言</h3></div><small>{relations.length} 条</small></header>
    <p>图中的边是可争议、可修订的人工陈述，不是匿名事实；相似度不会自动创建关系。</p>
    <div className="knowledge-editor-card">
      <strong>{editing === undefined ? "手工新建关系" : `编辑关系 v${editing.revision}`}</strong>
      <label>检索端点<input disabled={saving} onChange={(event) => setQuery(event.target.value)} placeholder="概念、定义、阅读单元、文献或笔记" value={query} /></label>
      <div className="relation-editor-row">
        <label>起点<select disabled={saving} onChange={(event) => setSubject(selectableNodes.find((node) => nodeKey(node) === event.target.value))} value={subject === undefined ? "" : nodeKey(subject)}><option value="">请选择</option>{selectableNodes.map((node) => <option key={`subject-${nodeKey(node)}`} value={nodeKey(node)}>[{nodeKindLabels[node.kind]}] {node.label}</option>)}</select></label>
        <label>关系<select disabled={saving} onChange={(event) => setPredicate(event.target.value as RelationPredicateKind)} value={predicate}>{RELATION_PREDICATE_KINDS.map((value) => <option key={value} value={value}>{predicateLabels[value]}</option>)}</select></label>
        <label>终点<select disabled={saving} onChange={(event) => setObject(selectableNodes.find((node) => nodeKey(node) === event.target.value))} value={object === undefined ? "" : nodeKey(object)}><option value="">请选择</option>{selectableNodes.map((node) => <option key={`object-${nodeKey(node)}`} value={nodeKey(node)}>[{nodeKindLabels[node.kind]}] {node.label}</option>)}</select></label>
      </div>
      <label>适用范围／限定<textarea disabled={saving} onChange={(event) => setScopeNote(event.target.value)} placeholder="说明这个关系在哪个领域、时期、传统或论证范围内成立" rows={3} value={scopeNote} /></label>
      {source !== undefined && <><label className="knowledge-source-toggle"><input checked={useSource} disabled={saving} onChange={(event) => setUseSource(event.target.checked)} type="checkbox" />关联当前原文：{source.itemTitle} · 第 {source.pageLabel ?? source.pageIndex + 1} 页</label>{useSource && <div className="relation-evidence-row"><label>来源立场<select disabled={saving} onChange={(event) => setEvidenceStance(event.target.value as typeof evidenceStance)} value={evidenceStance}><option value="supports">支持</option><option value="opposes">反对</option><option value="context">背景</option></select></label><label>关系说明<input disabled={saving} onChange={(event) => setEvidenceRationale(event.target.value)} value={evidenceRationale} /></label></div>}</>}
      <div className="form-actions"><button className="ghost-button" disabled={saving} onClick={resetForm} type="button">{editing === undefined ? "清空" : "取消编辑"}</button><button className="primary-button" disabled={saving || subject === undefined || object === undefined || nodeKey(subject) === nodeKey(object)} onClick={() => void save()} type="button">{saving ? "保存中…" : editing === undefined ? "创建关系" : "保存新版本"}</button></div>
    </div>
    <div aria-busy={isLoading} className="knowledge-object-list relation-list">
      {isLoading && <p role="status">正在读取关系断言…</p>}
      {!isLoading && relations.length === 0 && <p>还没有关系断言。即使未配置 AI，也可以手工连接现有对象。</p>}
      {relations.map((relation) => <article key={relation.id}><header><span>{nodeKindLabels[relation.subject.kind]} → {nodeKindLabels[relation.object.kind]}</span><small>{provenanceLabels[relation.provenanceKind]} · v{relation.revision} · {relation.evidenceCount} 条来源</small></header><p><b>{relation.subject.label}</b> <span>{predicateLabels[relation.predicateKind]}</span> <b>{relation.object.label}</b></p>{relation.scopeNote && <blockquote>{relation.scopeNote}</blockquote>}<footer><span>人工关系主张{relation.projectTitle ? ` · ${relation.projectTitle}` : ""}</span><div><button disabled={saving} onClick={() => startEdit(relation)} type="button">编辑</button><button onClick={() => setHistoryId(relation.id)} type="button">版本</button></div></footer>{historyId === relation.id && <ResearchObjectHistory gateway={gateway} objectId={relation.id} objectKind="relation_assertion" onClose={() => setHistoryId(undefined)} />}</article>)}
    </div>
  </section>;
}
