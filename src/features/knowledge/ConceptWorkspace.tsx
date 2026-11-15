import { notify } from "@research-assistant/workbench-sdk/feedback";
import { useEffect, useState } from "react";
import type { Concept, DefinitionClaim } from "@research-assistant/core/knowledge";

import { researchKnowledgeErrorMessage, type ResearchKnowledgeGateway } from "../../services/knowledgeGateway";
import { ResearchObjectHistory } from "./ResearchObjectHistory";
import { ConceptIdentityWorkspace } from "./ConceptIdentityWorkspace";
import { provenanceLabels } from "./knowledgeLabels";
import { ConceptName } from "./ConceptName";

interface ConceptWorkspaceProps {
  readonly gateway: ResearchKnowledgeGateway;
}

interface ConceptFields {
  readonly term: string;
  readonly language: string;
  readonly label: string;
  readonly explanation: string;
  readonly disambiguation: string;
  readonly domain: string;
  readonly tradition: string;
  readonly period: string;
}

const emptyConcept: ConceptFields = {
  term: "", language: "", label: "", explanation: "", disambiguation: "",
  domain: "", tradition: "", period: "",
};

export function ConceptWorkspace({ gateway }: ConceptWorkspaceProps): React.JSX.Element {
  const [query, setQuery] = useState("");
  const [concepts, setConcepts] = useState<readonly Concept[]>([]);
  const [editing, setEditing] = useState<Concept>();
  const [fields, setFields] = useState<ConceptFields>(emptyConcept);
  const [selected, setSelected] = useState<Concept>();
  const [definitions, setDefinitions] = useState<readonly DefinitionClaim[]>([]);
  const [definitionEditing, setDefinitionEditing] = useState<DefinitionClaim>();
  const [definitionStatement, setDefinitionStatement] = useState("");
  const [scopeNote, setScopeNote] = useState("");
  const [history, setHistory] = useState<{ readonly kind: "concept" | "definition_claim"; readonly id: string }>();
  const [isLoadingConcepts, setIsLoadingConcepts] = useState(true);
  const [isLoadingDefinitions, setIsLoadingDefinitions] = useState(false);
  const [saving, setSaving] = useState(false);

  async function refreshConcepts(nextQuery = query): Promise<void> {
    const values = await gateway.searchConcepts(nextQuery);
    setConcepts(values);
    setSelected((current) => current === undefined ? current : values.find((value) => value.id === current.id) ?? current);
  }

  useEffect(() => {
    let isActive = true;
    setIsLoadingConcepts(true);
    const timer = window.setTimeout(() => {
      void gateway.searchConcepts(query)
        .then((values) => {
          if (!isActive) return;
          setConcepts(values);
          setSelected((current) => current === undefined
            ? current
            : values.find((value) => value.id === current.id) ?? current);
        })
        .catch((reason: unknown) => {
          if (isActive) notify.error(researchKnowledgeErrorMessage(reason));
        })
        .finally(() => {
          if (isActive) setIsLoadingConcepts(false);
        });
    }, 120);
    return () => {
      isActive = false;
      window.clearTimeout(timer);
    };
  }, [gateway, query]);

  useEffect(() => {
    if (selected === undefined) {
      setDefinitions([]);
      setIsLoadingDefinitions(false);
      return;
    }
    let isActive = true;
    setIsLoadingDefinitions(true);
    void gateway.listDefinitionClaims(selected.id)
      .then((values) => { if (isActive) setDefinitions(values); })
      .catch((reason: unknown) => {
        if (isActive) notify.error(researchKnowledgeErrorMessage(reason));
      })
      .finally(() => {
        if (isActive) setIsLoadingDefinitions(false);
      });
    return () => { isActive = false; };
  }, [gateway, selected?.id]);

  function setField<Key extends keyof ConceptFields>(key: Key, value: ConceptFields[Key]): void {
    setFields((current) => ({ ...current, [key]: value }));
  }

  function startEdit(concept: Concept): void {
    setEditing(concept);
    setFields({
      term: concept.preferredTerm.text,
      language: concept.preferredTerm.language,
      label: concept.label,
      explanation: concept.explanation,
      disambiguation: concept.disambiguation,
      domain: concept.domain,
      tradition: concept.tradition,
      period: concept.period,
    });

  }

  async function saveConcept(): Promise<void> {
    setSaving(true);

    try {
      const saved = await gateway.saveConcept({
        ...(editing === undefined ? {} : { id: editing.id, expectedRevision: editing.revision }),
        preferredTerm: fields.term,
        ...(fields.language.trim() ? { language: fields.language.trim() } : {}),
        label: fields.label,
        explanation: fields.explanation,
        disambiguation: fields.disambiguation,
        domain: fields.domain,
        tradition: fields.tradition,
        period: fields.period,
        changeReason: editing === undefined ? "manual_create" : "manual_edit",
      });
      notify.info(editing === undefined ? "人工概念已创建" : "概念的新版本已保存");
      setEditing(undefined);
      setFields(emptyConcept);
      setSelected(saved);
      await refreshConcepts();
    } catch (reason) {
      notify.error(`${researchKnowledgeErrorMessage(reason)}；你的概念草稿仍保留。`);
    } finally {
      setSaving(false);
    }
  }

  function editDefinition(definition: DefinitionClaim): void {
    setDefinitionEditing(definition);
    setDefinitionStatement(definition.statement);
    setScopeNote(definition.scopeNote);
  }

  async function saveDefinition(): Promise<void> {
    if (selected === undefined) return;
    setSaving(true);

    try {
      await gateway.saveDefinitionClaim({
        ...(definitionEditing === undefined ? {} : {
          id: definitionEditing.id,
          expectedRevision: definitionEditing.revision,
        }),
        conceptId: definitionEditing?.conceptId ?? selected.id,
        statement: definitionStatement,
        scopeNote,
        changeReason: definitionEditing === undefined ? "manual_create" : "manual_edit",
      });
      setDefinitionEditing(undefined);
      setDefinitionStatement("");
      setScopeNote("");
      setDefinitions(await gateway.listDefinitionClaims(selected.id));
      await refreshConcepts();
      notify.info("定义陈述已保存；其他竞争解释不会被覆盖");
    } catch (reason) {
      notify.error(`${researchKnowledgeErrorMessage(reason)}；你的定义草稿仍保留。`);
    } finally {
      setSaving(false);
    }
  }

  return <section className="knowledge-subworkspace concept-workspace">
    <header><div><span className="eyebrow">TERMS & CONCEPTS</span><h3>概念知识库</h3></div><small>{concepts.length} 个当前结果</small></header>
    <label className="knowledge-search">检索语词、解释或领域<input onChange={(event) => setQuery(event.target.value)} placeholder="例如：校准" value={query} /></label>
    <div className="concept-workspace-grid">
      <div className="knowledge-editor-card">
        <strong>{editing === undefined ? "从空白手工创建概念" : `编辑概念 v${editing.revision}`}</strong>
        <div className="knowledge-field-row"><label>首选语词<input onChange={(event) => setField("term", event.target.value)} value={fields.term} /></label><label>语言<input onChange={(event) => setField("language", event.target.value)} placeholder="zh、en…" value={fields.language} /></label></div>
        <label>显示名称<input onChange={(event) => setField("label", event.target.value)} value={fields.label} /></label>
        <label>详细解释（选填）<textarea onChange={(event) => setField("explanation", event.target.value)} rows={4} value={fields.explanation} /></label>
        <label>简短消歧说明<input onChange={(event) => setField("disambiguation", event.target.value)} value={fields.disambiguation} /></label>
        <div className="knowledge-field-row"><label>领域<input onChange={(event) => setField("domain", event.target.value)} value={fields.domain} /></label><label>传统／学派<input onChange={(event) => setField("tradition", event.target.value)} value={fields.tradition} /></label><label>时期<input onChange={(event) => setField("period", event.target.value)} value={fields.period} /></label></div>
        <p>相同语词可以创建多个概念；保存不会按名称自动合并。</p>
        <div className="form-actions"><button className="ghost-button" onClick={() => { setEditing(undefined); setFields(emptyConcept); }} type="button">{editing === undefined ? "清空" : "取消编辑"}</button><button className="primary-button" disabled={saving || !fields.term.trim()} onClick={() => void saveConcept()} type="button">{saving ? "保存中…" : editing === undefined ? "创建概念" : "保存新版本"}</button></div>
      </div>
      <div aria-busy={isLoadingConcepts} className="knowledge-object-list concept-result-list">
        {isLoadingConcepts && <p role="status">正在检索概念…</p>}
        {!isLoadingConcepts && concepts.length === 0 && <p>没有匹配概念。可以在左侧手工创建，同一语词无需唯一。</p>}
        {concepts.map((concept) => <article className={selected?.id === concept.id ? "selected" : ""} key={concept.id}>
          <button className="concept-result-main" onClick={() => setSelected(concept)} type="button"><b><ConceptName label={concept.label || concept.preferredTerm.text}/></b><span>{[concept.domain, concept.tradition, concept.period].filter(Boolean).join(" · ") || "未标注适用范围"}</span><p>{concept.disambiguation || concept.explanation}</p><small>{provenanceLabels[concept.provenanceKind]} · {concept.sourceCount} 个来源 · {concept.definitionCount} 条定义 · v{concept.revision}</small></button>
          <footer><button onClick={() => startEdit(concept)} type="button">编辑</button><button onClick={() => setHistory({ kind: "concept", id: concept.id })} type="button">版本</button></footer>
          {history?.kind === "concept" && history.id === concept.id && <ResearchObjectHistory gateway={gateway} objectId={concept.id} objectKind="concept" onClose={() => setHistory(undefined)} />}
        </article>)}
      </div>
    </div>
    <ConceptIdentityWorkspace
      concepts={concepts}
      gateway={gateway}
      onChanged={async () => {
        setSelected(undefined);
        setDefinitions([]);
        await refreshConcepts();
      }}
    />
    {selected !== undefined && <section className="definition-workspace">
      <header><div><span className="eyebrow">DEFINITION CLAIMS</span><h4>{selected.label || selected.preferredTerm.text} 的并列定义</h4></div><small>不同定义不会相互覆盖</small></header>
      <div className="knowledge-editor-card"><strong>{definitionEditing === undefined ? "添加人工定义陈述" : `编辑定义 v${definitionEditing.revision}`}</strong><label>定义<textarea onChange={(event) => setDefinitionStatement(event.target.value)} rows={3} value={definitionStatement} /></label><label>适用范围／备注<input onChange={(event) => setScopeNote(event.target.value)} value={scopeNote} /></label><div className="form-actions"><button className="ghost-button" onClick={() => { setDefinitionEditing(undefined); setDefinitionStatement(""); setScopeNote(""); }} type="button">取消</button><button className="primary-button" disabled={saving || !definitionStatement.trim()} onClick={() => void saveDefinition()} type="button">保存定义</button></div></div>
      <div aria-busy={isLoadingDefinitions} className="knowledge-object-list">
        {isLoadingDefinitions && <p role="status">正在读取定义陈述…</p>}
        {!isLoadingDefinitions && definitions.length === 0 && <p>还没有定义陈述，可以手工添加并保留多种竞争解释。</p>}
        {definitions.map((definition) => <article key={definition.id}><header><span>定义陈述</span><small>{provenanceLabels[definition.provenanceKind]} · v{definition.revision} · {definition.evidenceCount} 条来源</small></header><p>{definition.statement}</p>{definition.scopeNote && <small>{definition.scopeNote}</small>}<footer><span /><div><button onClick={() => editDefinition(definition)} type="button">编辑</button><button onClick={() => setHistory({ kind: "definition_claim", id: definition.id })} type="button">版本</button></div></footer>{history?.kind === "definition_claim" && history.id === definition.id && <ResearchObjectHistory gateway={gateway} objectId={definition.id} objectKind="definition_claim" onClose={() => setHistory(undefined)} />}</article>)}
      </div>
    </section>}
  </section>;
}
