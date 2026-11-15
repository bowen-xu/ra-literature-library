import { Check } from "lucide-react";
import { useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import type { NalPattern } from "@research-assistant/core/nal";
import type { NalDisplayVocabulary } from "./nalPaperCitation";
import { NoteActionMenuItem } from "@research-assistant/workbench-sdk/block-controls";

/** A category-scoped search keeps typing focus, matching the chat file picker. */
export function NalAtomicSearch({ value, vocabulary, kind, onChange }: {
  readonly value: NalPattern;
  readonly vocabulary: readonly NalDisplayVocabulary[];
  readonly kind: "concept" | "paper";
  readonly onChange: (value: NalPattern) => void;
}): React.JSX.Element {
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const active = useRef<HTMLButtonElement>(null);
  const options = vocabulary.filter(entry => entry.atom.kind === kind && entry.label.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const at = Math.min(index, options.length - 1);
  useLayoutEffect(() => { active.current?.scrollIntoView({ block: "nearest" }); }, [at, query]);
  function keyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault(); event.stopPropagation();
      setIndex(current => (current + (event.key === "ArrowDown" ? 1 : -1) + Math.max(1, options.length)) % Math.max(1, options.length));
    } else if (event.key === "Enter") {
      event.preventDefault(); event.stopPropagation();
      const entry = options[at]; if (entry) onChange(entry.atom);
    }
  }
  return <>
    <input className="nal-menu-input" type="search" aria-label={kind === "concept" ? "搜索概念" : "搜索文献"}
      placeholder={kind === "concept" ? "搜索概念" : "搜索文献"} value={query}
      onChange={event => { setQuery(event.target.value); setIndex(0); }} onKeyDown={keyDown} />
    {options.map((entry, position) => {
      const selected = "id" in value && value.kind === entry.atom.kind && value.id === entry.atom.id;
      const relation = entry.atom.kind === "concept" && entry.conceptKind === "relation";
      return <NoteActionMenuItem key={`${kind}:${entry.atom.id}`} ref={position === at ? active : undefined}
        className="nal-menu-search-option" data-search-active={position === at} role="menuitemradio" aria-checked={selected}
        aria-label={entry.label} aria-description={relation ? "关系词项" : undefined}
        onMouseMove={() => setIndex(position)} onFocus={() => setIndex(position)}
        onClick={() => onChange(entry.atom)}><span>{entry.label}</span>{relation && <small className="nal-menu-relation-badge" aria-hidden="true">关系</small>}{selected && <Check aria-hidden="true" />}</NoteActionMenuItem>;
    })}
    {!options.length && <p className="nal-menu-heading" role="status">{kind === "concept" ? "没有匹配的概念" : "没有匹配的文献"}</p>}
  </>;
}
