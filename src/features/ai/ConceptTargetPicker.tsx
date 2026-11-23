import { notify } from "@research-assistant/workbench-sdk/feedback";
import { useEffect, useMemo, useState } from "react";
import type { Concept } from "@research-assistant/core/knowledge";

import {
  getResearchKnowledgeGateway,
  researchKnowledgeErrorMessage,
} from "../../services/knowledgeGateway";

interface ConceptTargetPickerProps {
  readonly disabled: boolean;
  readonly label: string;
  readonly suggestedTerm: string;
  readonly selectedId: string | undefined;
  readonly onSelect: (conceptId: string) => void;
}

export function ConceptTargetPicker({
  disabled,
  label,
  suggestedTerm,
  selectedId,
  onSelect,
}: ConceptTargetPickerProps): React.JSX.Element {
  const gateway = useMemo(() => getResearchKnowledgeGateway(), []);
  const [query, setQuery] = useState(suggestedTerm);
  const [results, setResults] = useState<readonly Concept[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setQuery(suggestedTerm);
    setResults([]);
  }, [suggestedTerm]);

  async function search(): Promise<void> {
    setBusy(true);

    try {
      setResults(await gateway.searchConcepts(query));
    } catch (reason) {
      notify.error(researchKnowledgeErrorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  const selected = results.find((concept) => concept.id === selectedId);
  return (
    <div className="ai-concept-target-picker">
      <label>
        {label}
        <span>
          <input
            disabled={disabled || busy}
            onChange={(event) => setQuery(event.target.value)}
            value={query}
          />
          <button
            disabled={disabled || busy || query.trim() === ""}
            onClick={() => void search()}
            type="button"
          >
            检索概念
          </button>
        </span>
      </label>
      {selected !== undefined && (
        <p>
          已选：<b>{selected.label || selected.preferredTerm.text}</b>
          {` · ${selected.domain || "未标领域"} · v${selected.revision}`}
        </p>
      )}
      {results.length > 0 && (
        <div className="ai-concept-target-results">
          {results.map((concept) => (
            <button
              aria-pressed={concept.id === selectedId}
              disabled={disabled || busy}
              key={concept.id}
              onClick={() => onSelect(concept.id)}
              type="button"
            >
              <b>{concept.label || concept.preferredTerm.text}</b>
              <span>
                {concept.domain || "未标领域"}
                {concept.tradition === "" ? "" : ` · ${concept.tradition}`}
                {concept.period === "" ? "" : ` · ${concept.period}`}
              </span>
              <small>
                {concept.disambiguation || concept.explanation} · {concept.sourceCount} 个来源
              </small>
            </button>
          ))}
        </div>
      )}
      {!busy && results.length === 0 && (
        <small>检索只提供消歧候选；同名或相似不会自动合并。</small>
      )}
    </div>
  );
}
