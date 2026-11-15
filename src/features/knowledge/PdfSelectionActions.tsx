import { useNotificationState } from "@research-assistant/workbench-sdk/feedback";
import { useEffect, useMemo, useRef, useState } from "react";
import { BookA, BookMarked, Network, NotebookPen, ScanText, Sparkles, Trash2 } from "lucide-react";
import { isDictionaryQuery, normalizeDictionaryQuery, type DictionaryGateway, type WordExplanationGateway, type WordExplanation } from "@research-assistant/core/dictionary";
import { getWordExplanationGateway } from "@research-assistant/workbench-sdk/dictionary";
import { createDictionaryGateway } from "@research-assistant/workbench-sdk/dictionary";
import { DictionaryLookup } from "@research-assistant/workbench-sdk/dictionary";
import type { SourceRect } from "@research-assistant/core/literature";
import type { PdfSelectionTextLocation } from "@research-assistant/core/pdf-view";
import type { AiRun } from "@research-assistant/core/ai";
import { ControlHint } from "@research-assistant/workbench-sdk/overlay";
import { MouseLeftShortcut } from "@research-assistant/workbench-sdk/ui";
import { PdfSelectionHighlightControl, PdfSelectionNoteControl } from "./PdfSelectionHighlightControl";
import { SelectionAskAiButton, SelectionAskAiEditor } from "@research-assistant/workbench-sdk/agent-ui";

import { notify } from "@research-assistant/workbench-sdk/feedback";
import { AiReferenceExtractionPreview } from "../ai/AiReferenceExtractionPreview";
import {
  ReferenceCapturePanel,
  type ReferenceCaptureDraftState,
  type ReferenceCaptureValue,
} from "../synthesis/ReferenceCapturePanel";
import { researchKnowledgeErrorMessage, type ResearchKnowledgeGateway } from "../../services/knowledgeGateway";
import {
  ConceptCapturePanel,
  type ConceptCaptureDraftState,
  type ConceptCaptureValue,
} from "./ConceptCapturePanel";

export interface PdfPendingSelection {
  readonly context?: { readonly before: string; readonly after: string };
  readonly text: string;
  readonly rects: readonly SourceRect[];
  readonly prefix: string;
  readonly suffix: string;
  readonly pageIndex: number;
  readonly pageLabel: string;
  readonly segments: readonly {
    readonly location?: PdfSelectionTextLocation;
    readonly pageIndex: number;
    readonly pageLabel: string;
    readonly rects: readonly SourceRect[];
    readonly text: string;
    readonly prefix: string;
    readonly suffix: string;
  }[];
  readonly popupPageIndex: number;
  readonly popupRect: SourceRect;
}

export type PdfSelectionActionMode = "actions" | "annotation" | "dictionary" | "concept" | "reference" | "reference_ai";

export interface PdfSelectionActionDraft {
  readonly mode: PdfSelectionActionMode;
  readonly note: string;
  readonly referenceRawText: string;
  readonly conceptDirty: boolean;
  readonly referenceDirty: boolean;
  readonly concept?: ConceptCaptureDraftState;
  readonly reference?: ReferenceCaptureDraftState;
}

interface PdfSelectionActionsProps {
  readonly active?: boolean;
  readonly onDeleteWordExplanation?: () => Promise<void>;
  readonly existingWordExplanation?: WordExplanation;
  readonly onWordExplanation?: (result: WordExplanation) => Promise<void>;
  readonly wordExplanationGateway?: WordExplanationGateway<AbortSignal>;
  readonly dictionaryGateway?: DictionaryGateway<AbortSignal>;
  readonly paperId: string;
  readonly pending: PdfPendingSelection;
  readonly knowledgeGateway: ResearchKnowledgeGateway;
  readonly onWriteNote: (color?: string) => Promise<void>;
  readonly onDeleteNote?: () => Promise<void>;
  readonly onClose?: () => void;
  readonly editingNote?: boolean;
  readonly positionOnly?: boolean;
  readonly highlightColor?: string;
  readonly onHighlight: (color: string) => Promise<void>;
  readonly onCaptureConcept: (value: ConceptCaptureValue) => Promise<void>;
  readonly onCaptureReference: (value: ReferenceCaptureValue) => Promise<void>;
  readonly onExplain?: () => Promise<void>;
  readonly onAnnotate?: (comment: string, intent?: "send" | "silent") => Promise<void>;
  readonly onEnsureAiAnchor: () => Promise<string>;
  readonly onAiRunStarted: (run: AiRun) => void;
  readonly initialDraft?: PdfSelectionActionDraft;
  readonly onDraftChange?: (draft: PdfSelectionActionDraft, dirty: boolean) => void;
  readonly onDraftStateChange?: (dirty: boolean) => void;
}

export function PdfSelectionActions({
  active = true,
  onDeleteWordExplanation,
  existingWordExplanation,
  onWordExplanation,
  wordExplanationGateway,
  dictionaryGateway,
  paperId,
  pending,
  knowledgeGateway,
  onHighlight,
  onWriteNote,
  onDeleteNote,
  editingNote = false,
  positionOnly = false,
  highlightColor,
  onCaptureConcept,
  onCaptureReference,
  onExplain,
  onAnnotate,
  onEnsureAiAnchor,
  onAiRunStarted,
  initialDraft,
  onDraftChange,
  onDraftStateChange,
}: PdfSelectionActionsProps): React.JSX.Element {
  const localDictionary = useMemo(() => dictionaryGateway ?? createDictionaryGateway(), [dictionaryGateway]);
  const [wordExplanation, setWordExplanation] = useState<WordExplanation>();
  const [wordExplaining, setWordExplaining] = useState(false);
  const [wordSaveFailed, setWordSaveFailed] = useState(false);
  const [wordSaving, setWordSaving] = useState(false);
  const wordRequest = useRef<AbortController | undefined>(undefined);
  const existingWordRef = useRef(existingWordExplanation); existingWordRef.current = existingWordExplanation;
  const previousExistingWord = useRef(existingWordExplanation);
  const [note, setNote] = useState(initialDraft?.note ?? "");
  const [referenceRawText, setReferenceRawText] = useState(initialDraft?.referenceRawText ?? pending.text);
  const [mode, setMode] = useState<PdfSelectionActionMode>(initialDraft?.mode ?? "actions");
  const [saving, setSaving] = useState(false);
  const [, setError] = useNotificationState("error");
  const [conceptDirty, setConceptDirty] = useState(initialDraft?.conceptDirty ?? false);
  const [referenceDirty, setReferenceDirty] = useState(initialDraft?.referenceDirty ?? false);
  const [conceptDraft, setConceptDraft] = useState<ConceptCaptureDraftState | undefined>(initialDraft?.concept);
  const [referenceDraft, setReferenceDraft] = useState<ReferenceCaptureDraftState | undefined>(initialDraft?.reference);
  const onDraftStateChangeRef = useRef(onDraftStateChange);
  const onDraftChangeRef = useRef(onDraftChange);
  const previousPendingRef = useRef(pending);
  const explaining = useRef(false);

  useEffect(() => {
    setWordExplanation(existingWordRef.current);
    setWordSaveFailed(false);
    setWordExplaining(false);
    setWordSaving(false);
    return () => wordRequest.current?.abort();
  }, [pending, mode === "dictionary"]);
  useEffect(() => {
    if (existingWordExplanation && !wordRequest.current) setWordExplanation(existingWordExplanation);
    if (!existingWordExplanation && previousExistingWord.current) setWordExplanation(undefined);
    previousExistingWord.current = existingWordExplanation;
  }, [existingWordExplanation]);

  async function explainWord(): Promise<void> {
    if (wordRequest.current && !wordRequest.current.signal.aborted) return;
    const word = normalizeDictionaryQuery(pending.text);
    if (!isDictionaryQuery(word)) { notify.error("请选择一个英文单词或短语后再解释词义。"); return; }
    const controller = new AbortController();
    wordRequest.current = controller;
    setWordExplaining(true);
    setWordExplanation(undefined);
    try {
      const gateway = wordExplanationGateway ?? getWordExplanationGateway();
      const result = await gateway.explain({ word,
        before: pending.context?.before ?? pending.prefix,
        after: pending.context?.after ?? pending.suffix }, controller.signal);
      if (!controller.signal.aborted) {
        setWordExplanation(result);
        await saveWordResult(result, controller.signal);
      }
    } catch (reason) {
      if (!controller.signal.aborted) notify.error(reason instanceof Error ? reason.message : "AI 词义解释失败，请重试。");
    } finally {
      if (!controller.signal.aborted) setWordExplaining(false);
      if (wordRequest.current === controller) wordRequest.current = undefined;
    }
  }

  async function saveWordResult(result: WordExplanation, signal?: AbortSignal): Promise<void> {
    if (!onWordExplanation) return;
    setWordSaving(true);
    try { await onWordExplanation(result); if (!signal?.aborted) setWordSaveFailed(false); }
    catch (error) {
      if (!signal?.aborted) setWordSaveFailed(true);
      notify.error(error instanceof Error ? error.message : "解释已生成，但未保存；请重试保存。");
    } finally { if (!signal?.aborted) setWordSaving(false); }
  }

  useEffect(() => {
    onDraftStateChangeRef.current = onDraftStateChange;
    onDraftChangeRef.current = onDraftChange;
  }, [onDraftChange, onDraftStateChange]);

  useEffect(() => {
    if (previousPendingRef.current === pending) return;
    previousPendingRef.current = pending;
    setNote("");
    setReferenceRawText(pending.text);
    setMode("actions");
    setError(undefined);
    setConceptDirty(false);
    setReferenceDirty(false);
    setConceptDraft(undefined);
    setReferenceDraft(undefined);
  }, [pending]);

  useEffect(() => {
    const dirty = note.trim().length > 0
      || referenceRawText !== pending.text
      || conceptDirty
      || referenceDirty;
    const draft: PdfSelectionActionDraft = {
      mode,
      note,
      referenceRawText,
      conceptDirty,
      referenceDirty,
      ...(conceptDraft === undefined ? {} : { concept: conceptDraft }),
      ...(referenceDraft === undefined ? {} : { reference: referenceDraft }),
    };
    onDraftStateChangeRef.current?.(dirty);
    onDraftChangeRef.current?.(draft, dirty);
  }, [conceptDirty, conceptDraft, mode, note, pending.text, referenceDirty, referenceDraft, referenceRawText]);

  function reportDraftState(
    nextNote = note,
    nextReferenceRawText = referenceRawText,
    nextConceptDirty = conceptDirty,
    nextReferenceDirty = referenceDirty,
  ): void {
    onDraftStateChangeRef.current?.(
      nextNote.trim().length > 0
      || nextReferenceRawText !== pending.text
      || nextConceptDirty
      || nextReferenceDirty,
    );
  }

  async function run(action: () => Promise<void>): Promise<void> {
    setSaving(true);
    setError(undefined);
    try {
      await action();
    } catch (reason) {
      const message = researchKnowledgeErrorMessage(reason);
      if (positionOnly) notify.error(message);
      else setError(message);
    } finally {
      setSaving(false);
    }
  }

  if (mode === "concept") {
    return (
      <ConceptCapturePanel
        gateway={knowledgeGateway}
        {...(conceptDraft === undefined ? {} : { initialDraft: conceptDraft })}
        initialTerm={pending.text}
        onCancel={() => setMode("actions")}
        onDraftChange={setConceptDraft}
        onDirtyChange={(dirty) => {
          setConceptDirty(dirty);
          reportDraftState(note, referenceRawText, dirty);
        }}
        onSave={(value) => void run(() => onCaptureConcept(value))}
        quoteExact={pending.text}
        saving={saving}
      />
    );
  }
  async function explain(): Promise<void> {
    if (explaining.current) return;
    explaining.current = true;
    setSaving(true);
    try {
      if (!onExplain) throw new Error("聊天窗不可用，请打开应用后重试。");
      await onExplain();
    } catch (reason) {
      notify.error(reason instanceof Error ? reason.message : String(reason));
    } finally {
      explaining.current = false;
      setSaving(false);
    }
  }
  if (mode === "reference_ai") {
    return <AiReferenceExtractionPreview
      ensureAnchor={onEnsureAiAnchor}
      onCancel={() => setMode("reference")}
      onStarted={(run) => {
        setMode("reference");
        onAiRunStarted(run);
      }}
    />;
  }
  if (mode === "reference") {
    return (
      <ReferenceCapturePanel
        {...(referenceDraft === undefined ? {} : { initialDraft: referenceDraft })}
        onCancel={() => setMode("actions")}
        onDirtyChange={(dirty) => {
          setReferenceDirty(dirty);
          reportDraftState(note, referenceRawText, conceptDirty, dirty);
        }}
        onDraftChange={setReferenceDraft}
        onRawTextChange={(value) => {
          setReferenceRawText(value);
          reportDraftState(note, value, conceptDirty, referenceDirty);
        }}
        onSave={(value) => void run(() => onCaptureReference(value))}
        onStartAiExtraction={() => setMode("reference_ai")}
        paperId={paperId}
        rawText={referenceRawText}
        saving={saving}
        selectedText={pending.text}
      />
    );
  }

  if (mode === "annotation" && onAnnotate) return <SelectionAskAiEditor title="PDF 选区" disabled={!active} onCancel={() => setMode("actions")} onSubmit={onAnnotate} />;

  return (
    <div className="selection-card selection-action-card">

      <div className="selection-actions-toolbar" aria-label="选区操作">
      <div className="selection-primary-actions">
        {!positionOnly && <PdfSelectionHighlightControl key={`${pending.pageIndex}:${pending.text}`} {...(highlightColor === undefined ? {} : { initialColor: highlightColor })} disabled={saving} onHighlight={(color) => void run(() => onHighlight(color))} />}
        {positionOnly && editingNote ? <ControlHint content="删除便签"><button aria-label="删除便签" disabled={saving || onDeleteNote === undefined} onClick={() => { if (onDeleteNote) void run(onDeleteNote); }} type="button"><Trash2 aria-hidden="true" size={18} /></button></ControlHint>
          : positionOnly ? <PdfSelectionNoteControl key={`${pending.pageIndex}:${pending.popupRect.x}:${pending.popupRect.y}`} disabled={saving} {...(highlightColor === undefined ? {} : { initialColor: highlightColor })} onWriteNote={color => void run(() => onWriteNote(color))} />
          : <ControlHint content={editingNote ? "编辑笔记" : "写笔记"} {...(editingNote ? { shortcut: <MouseLeftShortcut modifier="⌘" /> } : {})}><button aria-label={editingNote ? "编辑笔记" : "写笔记"} disabled={saving} onClick={() => void run(() => onWriteNote())} type="button"><NotebookPen aria-hidden="true" size={18} /></button></ControlHint>}
        {!positionOnly && <ControlHint content="离线查词"><button aria-label="离线查词" aria-expanded={mode === "dictionary"} disabled={saving} onClick={() => setMode(mode === "dictionary" ? "actions" : "dictionary")} type="button"><BookA aria-hidden="true" size={18} /></button></ControlHint>}
        {!positionOnly && <ControlHint content="添加概念"><button aria-label="添加概念" disabled={saving} onClick={() => setMode("concept")} type="button"><Network aria-hidden="true" size={18} /></button></ControlHint>}
        {!positionOnly && <ControlHint content="记录参考文献"><button aria-label="记录参考文献" disabled={saving} onClick={() => setMode("reference")} type="button"><BookMarked aria-hidden="true" size={18} /></button></ControlHint>}
      </div>
      {(!positionOnly || onAnnotate) && <div className="selection-secondary-actions">
        {onAnnotate && <SelectionAskAiButton disabled={saving} onClick={() => setMode("annotation")} />}
        {!positionOnly && (mode === "dictionary"
          ? <ControlHint content="AI 语境释义：使用阅读模型解释这个词在原文中的含义"><button aria-label="AI 语境释义" disabled={saving || wordExplaining} onClick={() => void explainWord()} type="button"><ScanText aria-hidden="true" size={18} /></button></ControlHint>
          : <ControlHint content="AI 解释：将所选原文引用到聊天草稿"><button aria-label="AI 解释" disabled={saving} onClick={() => void explain()} type="button"><Sparkles aria-hidden="true" size={18} /></button></ControlHint>)}
      </div>}
      </div>
      {mode === "dictionary" && <DictionaryLookup gateway={localDictionary} text={pending.text} explaining={wordExplaining}
        deleteDisabled={wordSaving || wordExplaining}
        onDeleteExplanation={async () => { await onDeleteWordExplanation?.(); setWordExplanation(undefined); setWordSaveFailed(false); }}
        context={{ word: normalizeDictionaryQuery(pending.text), before: pending.context?.before ?? pending.prefix, after: pending.context?.after ?? pending.suffix }}
        {...(wordExplanationGateway ? { explanationGateway: wordExplanationGateway } : {})}
        {...(wordExplanation ? { explanation: wordExplanation } : {})} />}
      {mode === "dictionary" && wordSaveFailed && wordExplanation && <button type="button" disabled={wordSaving} onClick={() => void saveWordResult(wordExplanation)}>重试保存解释</button>}
    </div>
  );
}
