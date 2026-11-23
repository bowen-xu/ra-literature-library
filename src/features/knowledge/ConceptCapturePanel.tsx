import { useNotificationState } from "@research-assistant/workbench-sdk/feedback";
import { ConceptName } from "./ConceptName";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  Concept,
  ConceptResolutionDraft,
} from "@research-assistant/core/knowledge";

import { researchKnowledgeErrorMessage, type ResearchKnowledgeGateway } from "../../services/knowledgeGateway";

export interface ConceptCaptureValue {
  readonly termText: string;
  readonly language?: string;
  readonly usageText: string;
  readonly resolution: ConceptResolutionDraft;
}

interface ConceptCapturePanelProps {
  readonly heading?: string;
  readonly initialTerm: string;
  readonly quoteExact: string;
  readonly gateway: ResearchKnowledgeGateway;
  readonly saving: boolean;
  readonly initialDraft?: ConceptCaptureDraftState;
  readonly onCancel: () => void;
  readonly onDraftChange?: (draft: ConceptCaptureDraftState) => void;
  readonly onDirtyChange?: (dirty: boolean) => void;
  readonly onSave: (value: ConceptCaptureValue) => void;
}

export type ConceptResolutionMode = "create_new" | "link_existing" | "unresolved";

export interface ConceptCaptureDraftState {
  readonly termText: string;
  readonly language: string;
  readonly usageText: string;
  readonly mode: ConceptResolutionMode;
  readonly selectedConceptId?: string;
  readonly label: string;
  readonly explanation: string;
  readonly disambiguation: string;
  readonly domain: string;
  readonly tradition: string;
  readonly period: string;
  readonly definitionStatement: string;
}

export function ConceptCapturePanel({
  heading = "把选区加入概念知识库",
  initialTerm,
  quoteExact,
  gateway,
  saving,
  initialDraft,
  onCancel,
  onDraftChange,
  onDirtyChange,
  onSave,
}: ConceptCapturePanelProps): React.JSX.Element {
  const [termText, setTermText] = useState(initialDraft?.termText ?? initialTerm);
  const [language, setLanguage] = useState(initialDraft?.language ?? "");
  const [usageText, setUsageText] = useState(initialDraft?.usageText ?? quoteExact);
  const [mode, setMode] = useState<ConceptResolutionMode>(initialDraft?.mode ?? "create_new");
  const [concepts, setConcepts] = useState<readonly Concept[]>([]);
  const [selectedConceptId, setSelectedConceptId] = useState<string | undefined>(initialDraft?.selectedConceptId);
  const [label, setLabel] = useState(initialDraft?.label ?? initialTerm);
  const [explanation, setExplanation] = useState(initialDraft?.explanation ?? "");
  const [disambiguation, setDisambiguation] = useState(initialDraft?.disambiguation ?? "");
  const [domain, setDomain] = useState(initialDraft?.domain ?? "");
  const [tradition, setTradition] = useState(initialDraft?.tradition ?? "");
  const [period, setPeriod] = useState(initialDraft?.period ?? "");
  const [definitionStatement, setDefinitionStatement] = useState(initialDraft?.definitionStatement ?? "");
  const [searching, setSearching] = useState(false);
  const [, setError] = useNotificationState("error");
  const onDraftChangeRef = useRef(onDraftChange);

  useEffect(() => {
    onDraftChangeRef.current = onDraftChange;
  }, [onDraftChange]);

  useEffect(() => {
    onDraftChangeRef.current?.({
      termText,
      language,
      usageText,
      mode,
      ...(selectedConceptId === undefined ? {} : { selectedConceptId }),
      label,
      explanation,
      disambiguation,
      domain,
      tradition,
      period,
      definitionStatement,
    });
  }, [definitionStatement, disambiguation, domain, explanation, label, language, mode, period, selectedConceptId, termText, tradition, usageText]);

  function markDirty(): void {
    onDirtyChange?.(true);
  }

  useEffect(() => {
    let active = true;
    const query = termText.trim();
    if (query.length === 0) {
      setConcepts([]);
      setSelectedConceptId(undefined);
      setSearching(false);
      return () => { active = false; };
    }
    setSearching(true);
    const timer = window.setTimeout(() => {
      void gateway.searchConcepts(query)
        .then((values) => {
          if (!active) return;
          setConcepts(values);
          setSelectedConceptId((current) => values.some((value) => value.id === current)
            ? current
            : undefined);
        })
        .catch((reason: unknown) => {
          if (active) setError(researchKnowledgeErrorMessage(reason));
        })
        .finally(() => {
          if (active) setSearching(false);
        });
    }, 120);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [gateway, termText]);

  const selectedConcept = useMemo(
    () => concepts.find((concept) => concept.id === selectedConceptId),
    [concepts, selectedConceptId],
  );
  const canSave = termText.trim().length > 0
    && (mode !== "link_existing" || selectedConcept !== undefined)
    && !saving;

  function submit(): void {
    setError(undefined);
    const definition = definitionStatement.trim();
    let resolution: ConceptResolutionDraft;
    if (mode === "create_new") {
      resolution = {
        kind: "create_new",
        concept: {
          label: label.trim(),
          explanation: explanation.trim(),
          disambiguation: disambiguation.trim(),
          domain: domain.trim(),
          tradition: tradition.trim(),
          period: period.trim(),
          changeReason: "selection_capture",
        },
        ...(definition.length === 0 ? {} : { definitionStatement: definition }),
      };
    } else if (mode === "link_existing" && selectedConcept !== undefined) {
      resolution = {
        kind: "link_existing",
        conceptId: selectedConcept.id,
        ...(definition.length === 0 ? {} : { definitionStatement: definition }),
      };
    } else {
      resolution = { kind: "unresolved" };
    }
    onSave({
      termText: termText.trim(),
      ...(language.trim().length === 0 ? {} : { language: language.trim() }),
      usageText: usageText.trim(),
      resolution,
    });
  }

  return (
    <section className="concept-capture-panel" aria-label="添加概念">
      <header>
        <div><span className="eyebrow">MANUAL CONCEPT</span><h3>{heading}</h3></div>
        <button aria-label="关闭概念编辑" onClick={onCancel} type="button">×</button>
      </header>

      <label>语词<input autoFocus onChange={(event) => {
        markDirty();
        setTermText(event.target.value);
        setLabel((current) => current === initialTerm ? event.target.value : current);
      }} value={termText} /></label>
      <label>语言／语种（可选）<input onChange={(event) => { markDirty(); setLanguage(event.target.value); }} placeholder="zh、en…" value={language} /></label>
      <label>本处用法<textarea onChange={(event) => { markDirty(); setUsageText(event.target.value); }} rows={2} value={usageText} /></label>

      <fieldset>
        <legend>如何处理这个语词</legend>
        <label><input checked={mode === "link_existing"} name="concept-resolution" onChange={() => { markDirty(); setMode("link_existing"); }} type="radio" />关联已有概念</label>
        <label><input checked={mode === "create_new"} name="concept-resolution" onChange={() => { markDirty(); setMode("create_new"); }} type="radio" />创建同一语词的另一概念／全新概念</label>
        <label><input checked={mode === "unresolved"} name="concept-resolution" onChange={() => { markDirty(); setMode("unresolved"); }} type="radio" />暂时保持未消歧</label>
      </fieldset>

      {mode === "link_existing" && (
        <div className="concept-match-list" aria-busy={searching}>
          <strong>{searching ? "正在检索…" : `${concepts.length} 个消歧候选`}</strong>
          {!searching && concepts.length === 0 && <p>没有匹配概念；可以创建新概念或保持未消歧。</p>}
          {concepts.map((concept) => (
            <button className={selectedConceptId === concept.id ? "selected" : ""} key={concept.id} onClick={() => { markDirty(); setSelectedConceptId(concept.id); }} type="button">
              <b><ConceptName label={concept.label || concept.preferredTerm.text}/></b>
              <span>{[concept.domain, concept.tradition, concept.period].filter(Boolean).join(" · ") || "未标注领域／传统／时期"}</span>
              <small>{concept.disambiguation || concept.explanation}</small>
              <i>{concept.sourceCount} 个来源 · {concept.definitionCount} 条定义陈述</i>
            </button>
          ))}
        </div>
      )}

      {mode === "create_new" && (
        <div className="concept-detail-fields">
          <label>显示名称<input onChange={(event) => { markDirty(); setLabel(event.target.value); }} value={label} /></label>
          <label>详细解释（选填）<textarea onChange={(event) => { markDirty(); setExplanation(event.target.value); }} placeholder="说明这个概念在这里具体指什么，以及与同名概念如何区分" rows={4} value={explanation} /></label>
          <label>简短消歧说明<input onChange={(event) => { markDirty(); setDisambiguation(event.target.value); }} value={disambiguation} /></label>
          <label>领域<input onChange={(event) => { markDirty(); setDomain(event.target.value); }} value={domain} /></label>
          <label>传统／学派<input onChange={(event) => { markDirty(); setTradition(event.target.value); }} value={tradition} /></label>
          <label>时期<input onChange={(event) => { markDirty(); setPeriod(event.target.value); }} value={period} /></label>
        </div>
      )}

      {mode !== "unresolved" && <label>把本处表述保存为新的定义陈述（可选）<textarea onChange={(event) => { markDirty(); setDefinitionStatement(event.target.value); }} rows={3} value={definitionStatement} /></label>}
      <p className="concept-capture-note">名称和相似度只用于查找候选，不会自动合并概念。此操作标记为人工原创。</p>
      <div className="form-actions">
        <button className="ghost-button" disabled={saving} onClick={onCancel} type="button">取消</button>
        <button className="primary-button" disabled={!canSave} onClick={submit} type="button">{saving ? "正在保存…" : "保存到知识库"}</button>
      </div>
    </section>
  );
}
