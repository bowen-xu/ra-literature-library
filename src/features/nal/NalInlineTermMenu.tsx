import type { NalDisplayVocabulary } from "./nalPaperCitation";
import { Check, Minus } from "lucide-react";
import { useLayoutEffect, useRef, useState, type ReactNode, type Ref } from "react";
import type { NalPattern } from "@research-assistant/core/nal";
import { NoteActionMenu, NoteActionMenuItem } from "@research-assistant/workbench-sdk/block-controls";
import { NalAtomicSearch } from "./NalAtomicSearch";
import { useNalEditorPolicy } from "./NalEditorPolicy";

/** Every choice commits directly. Only free text waits for Enter, with Esc cancellation. */
export function NalInlineTermMenu({ value, label, display, vocabulary, depth, onChange, disabled, triggerRef, onRemoveSlot }: {
  readonly value: NalPattern; readonly label: string; readonly display: ReactNode;
  readonly vocabulary: readonly NalDisplayVocabulary[]; readonly depth: number;
  readonly onChange: (value: NalPattern) => void; readonly disabled: boolean;
  readonly triggerRef: Ref<HTMLButtonElement>;
  readonly onRemoveSlot?: () => void;
}): React.JSX.Element {
  const policy = useNalEditorPolicy();
  const query = policy.purpose === "query";
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState<"root" | "atomic" | "compound" | "concept" | "paper">("root");
  const choices = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!open) return;
    if (page !== "root") choices.current?.querySelector<HTMLElement>('input,button:not(:disabled)')?.focus();
  }, [open, page]);
  const changeOpen = (next: boolean): void => { setOpen(next); if (!next) setPage("root"); };
  const commit = (next: NalPattern): void => { onChange(next); changeOpen(false); };
  return <NoteActionMenu className="nal-inline-choice" label={label} trigger={display} triggerClassName="nal-inline-token"
    menuLabel={page === "root" ? label : `${label} ${page}`} triggerRef={triggerRef} disabled={disabled} open={open} setOpen={changeOpen} portal>
    {page !== "root" ? <div ref={choices}>
        {page === "atomic" ? <>
          {(query || policy.paperBinding) && <NoteActionMenuItem role="menuitemradio" aria-checked={value.kind === "variable"}
            onClick={() => commit(value.kind === "variable" ? value : { kind: "variable", name: policy.paperBinding ?? "x" })}><span>{query ? "变量" : "选中文献"}</span>{value.kind === "variable" && <Check aria-hidden="true" />}</NoteActionMenuItem>}
          <NoteActionMenuItem hideOnClick={false} aria-label={`${label} concept`} onClick={() => setPage("concept")}>概念</NoteActionMenuItem>
          <NoteActionMenuItem hideOnClick={false} aria-label={`${label} paper`} onClick={() => setPage("paper")}>文献</NoteActionMenuItem>
        </> : page === "concept" || page === "paper" ? <NalAtomicSearch key={page} kind={page} value={value} vocabulary={vocabulary} onChange={commit} />
          : (query ? ["product", "conjunction", "disjunction"] as const : ["product"] as const).map((kind, index) => <NoteActionMenuItem key={kind} role="menuitemradio"
            aria-checked={value.kind === kind} onClick={() => commit({ kind, terms: "terms" in value ? value.terms : [{ kind: "concept", id: "" }, { kind: "concept", id: "" }] })}>
            <span>{kind}（{["×", "∧", "∨"][index]}）</span>{value.kind === kind && <Check aria-hidden="true" />}
          </NoteActionMenuItem>)}
      </div>
     : <>
    {value.kind === "variable" && query && <label className="nal-menu-heading">变量名（Enter 确认）
      <input className="nal-menu-input" aria-label={`${label}的变量名`} defaultValue={value.name} maxLength={200}
        onKeyDown={event => {
          if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
          event.preventDefault(); event.stopPropagation();
          const name = event.currentTarget.value.trim();
          if (name) commit({ kind: "variable", name });
        }} />
    </label>}
    <NoteActionMenuItem hideOnClick={false} aria-label={`${label} atomic`} onClick={() => setPage("atomic")}>
      <span>{query ? "atomic（原子词项／变量）" : "atomic（原子词项）"}</span>
    </NoteActionMenuItem>
    <NoteActionMenuItem hideOnClick={false} aria-label={`${label} compound`} disabled={depth >= 12 && !("terms" in value)}
      onClick={() => setPage("compound")}>
      <span>compound（组合）</span>
    </NoteActionMenuItem>
    {query && <NoteActionMenuItem role="menuitemradio" aria-checked={value.kind === "statement"} disabled={depth >= 12 && value.kind !== "statement"}
      onClick={() => commit(value.kind === "statement" ? value : { kind: "statement", copula: null, subject: { kind: "concept", id: "" }, predicate: { kind: "concept", id: "" } })}>
      <span>statement（语句）</span>{value.kind === "statement" && <Check aria-hidden="true" />}
    </NoteActionMenuItem>}
    <NoteActionMenuItem onClick={() => commit({ kind: "concept", id: "" })}>清空词项</NoteActionMenuItem>
    {onRemoveSlot && <NoteActionMenuItem onClick={onRemoveSlot}><Minus /><span>删除槽位</span></NoteActionMenuItem>}
    </>}
  </NoteActionMenu>;
}
