import { notify } from "@research-assistant/workbench-sdk/feedback";
import { useEffect, useRef, useState } from "react";
import type {
  Concept,
  ConceptIdentityEvent,
  ConceptMergeDraft,
  ConceptMergeImpact,
} from "@research-assistant/core/knowledge";

import {
  researchKnowledgeErrorMessage,
  type ResearchKnowledgeGateway,
} from "../../services/knowledgeGateway";

interface ConceptIdentityWorkspaceProps {
  readonly concepts: readonly Concept[];
  readonly gateway: ResearchKnowledgeGateway;
  readonly onChanged: () => Promise<void>;
}

export function ConceptIdentityWorkspace({
  concepts,
  gateway,
  onChanged,
}: ConceptIdentityWorkspaceProps): React.JSX.Element {
  const [events, setEvents] = useState<readonly ConceptIdentityEvent[]>([]);
  const [survivorId, setSurvivorId] = useState("");
  const [sourceIds, setSourceIds] = useState<ReadonlySet<string>>(new Set());
  const [rationale, setRationale] = useState("");
  const [preview, setPreview] = useState<ConceptMergeImpact>();
  const [pendingDraft, setPendingDraft] = useState<ConceptMergeDraft>();
  const [busy, setBusy] = useState(false);
  const eventRequest = useRef(0);

  async function refreshEvents(): Promise<void> {
    const request = eventRequest.current + 1;
    eventRequest.current = request;
    const values = await gateway.listConceptIdentityEvents();
    if (eventRequest.current === request) setEvents(values);
  }

  async function refreshAfterMutation(): Promise<void> {
    const results = await Promise.allSettled([refreshEvents(), onChanged()]);
    if (results.some((result) => result.status === "rejected")) {
      notify.error("操作已保存，但当前视图刷新失败；请重新打开概念工作台。");
    }
  }

  useEffect(() => {
    let active = true;
    const request = eventRequest.current + 1;
    eventRequest.current = request;
    void gateway.listConceptIdentityEvents()
      .then((values) => {
        if (active && eventRequest.current === request) setEvents(values);
      })
      .catch((reason: unknown) => {
        if (active) notify.error(researchKnowledgeErrorMessage(reason));
      });
    return () => { active = false; };
  }, [gateway]);

  function resetPreview(): void {
    setPreview(undefined);
    setPendingDraft(undefined);
  }

  function toggleSource(conceptId: string, checked: boolean): void {
    setSourceIds((current) => {
      const next = new Set(current);
      if (checked) next.add(conceptId); else next.delete(conceptId);
      return next;
    });
    resetPreview();
  }

  async function previewMerge(): Promise<void> {
    const sources = concepts.filter((concept) => sourceIds.has(concept.id));
    if (survivorId === "" || sources.length === 0) return;
    const draft: ConceptMergeDraft = {
      survivorId,
      survivorExpectedRevision: concepts.find((concept) => concept.id === survivorId)?.revision ?? 0,
      sources: sources.map((concept) => ({ id: concept.id, expectedRevision: concept.revision })),
      rationale,
    };
    setBusy(true);


    try {
      setPreview(await gateway.previewConceptMerge(draft));
      setPendingDraft(draft);
    } catch (reason) {
      notify.error(researchKnowledgeErrorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  async function confirmMerge(): Promise<void> {
    if (pendingDraft === undefined) return;
    setBusy(true);


    try {
      const event = await gateway.mergeConcepts(pendingDraft);
      notify.info(`已建立 ${event.activeSourceIds.length} 个旧 ID 映射；原始记录未删除。`);
      setSurvivorId("");
      setSourceIds(new Set());
      setRationale("");
      resetPreview();
      await refreshAfterMutation();
    } catch (reason) {
      notify.error(`${researchKnowledgeErrorMessage(reason)}；请重新预览影响。`);
      resetPreview();
    } finally {
      setBusy(false);
    }
  }

  async function splitSource(event: ConceptIdentityEvent, sourceConceptId: string): Promise<void> {
    setBusy(true);


    try {
      await gateway.splitConcepts({
        mergeEventId: event.id,
        sourceConceptIds: [sourceConceptId],
        rationale: "人工拆回误合并概念",
      });
      notify.info("旧概念 ID 已拆回；原合并事件和关系影响历史仍保留。");
      await refreshAfterMutation();
    } catch (reason) {
      notify.error(researchKnowledgeErrorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="concept-identity-workspace">
      <summary>概念合并与拆回（人工、可审计）</summary>
      <p>
        相似名称或向量相似不会触发合并。合并只建立旧 ID 映射，定义、用法、来源和关系原记录不移动。
      </p>
      <div className="concept-identity-editor">
        <label>
          保留节点
          <select
            disabled={busy || preview !== undefined}
            onChange={(event) => {
              setSurvivorId(event.target.value);
              setSourceIds((current) => new Set(
                [...current].filter((id) => id !== event.target.value),
              ));
              resetPreview();
            }}
            value={survivorId}
          >
            <option value="">请选择</option>
            {concepts.map((concept) => (
              <option key={concept.id} value={concept.id}>
                {concept.label || concept.preferredTerm.text} · v{concept.revision}
              </option>
            ))}
          </select>
        </label>
        <fieldset disabled={busy || preview !== undefined}>
          <legend>映射为旧 ID 的概念</legend>
          {concepts.map((concept) => (
            <label key={concept.id}>
              <input
                checked={sourceIds.has(concept.id)}
                disabled={concept.id === survivorId}
                onChange={(event) => toggleSource(concept.id, event.target.checked)}
                type="checkbox"
              />
              {concept.label || concept.preferredTerm.text} · {concept.definitionCount} 定义 · {concept.sourceCount} 来源
            </label>
          ))}
        </fieldset>
        <label>
          合并理由
          <textarea
            disabled={busy || preview !== undefined}
            onChange={(event) => { setRationale(event.target.value); resetPreview(); }}
            rows={2}
            value={rationale}
          />
        </label>
        {preview === undefined ? (
          <button
            disabled={busy || survivorId === "" || sourceIds.size === 0}
            onClick={() => void previewMerge()}
            type="button"
          >
            预览 ID、来源与关系影响
          </button>
        ) : (
          <div className="concept-identity-preview">
            <b>保留：{preview.survivor.label}</b>
            <span>
              旧 ID {preview.sources.length} 个 · 定义 {preview.sources.reduce(
                (sum, source) => sum + source.definitionCount, 0,
              )} 条 · 来源 {preview.sources.reduce(
                (sum, source) => sum + source.sourceCount, 0,
              )} 个 · 受影响关系 {preview.affectedRelationIds.length} 条
            </span>
            <div>
              <button disabled={busy} onClick={resetPreview} type="button">取消</button>
              <button disabled={busy} onClick={() => void confirmMerge()} type="button">
                确认建立可拆回映射
              </button>
            </div>
          </div>
        )}
      </div>
      <div className="concept-identity-history">
        <h4>身份事件与恢复</h4>
        {events.length === 0 && <p>尚无概念合并或拆回事件。</p>}
        {events.map((event) => (
          <article key={event.id}>
            <header>
              <b>{event.operation === "merge" ? "合并映射" : "拆回"} · {event.survivor.label}</b>
              <small>{event.createdAt} · 影响 {event.affectedRelationIds.length} 条关系</small>
            </header>
            <p>{event.sources.map(
              (source) => `${source.label} (${source.id.slice(0, 8)}…)`,
            ).join("、")}</p>
            {event.rationale && <blockquote>{event.rationale}</blockquote>}
            {event.operation === "merge" && event.activeSourceIds.map((sourceId) => (
              <button
                disabled={busy}
                key={sourceId}
                onClick={() => void splitSource(event, sourceId)}
                type="button"
              >
                拆回 {event.sources.find(
                  (source) => source.id === sourceId,
                )?.label ?? sourceId.slice(0, 8)}
              </button>
            ))}
          </article>
        ))}
      </div>
    </details>
  );
}
