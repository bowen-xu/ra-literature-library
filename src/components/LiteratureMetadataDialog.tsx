import { ControlHint } from "@research-assistant/workbench-sdk/overlay";
import { useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw, X } from "lucide-react";
import type {
  LiteratureItem,
  LiteratureMetadataPatch,
  MetadataCandidateFieldDecision,
  MetadataCandidateTrust,
  MetadataPreview,
} from "@research-assistant/core/literature";

import { LiteratureCreatorEditor, normalizedLiteratureCreators } from "./LiteratureCreatorEditor";
import { LITERATURE_TYPE_OPTIONS } from "./literatureWorkspaceModel";
import { ContentTrustGroupControls, ContentTrustIndicator } from "@research-assistant/workbench-sdk/ui";
import { Dialog } from "@research-assistant/workbench-sdk/overlay";
import {
  basicFieldLabel,
  creatorRoleLabel,
  creatorRolesForLiteratureType,
  isBasicFieldApplicable,
  metadataSourceTrustStatus,
  metadataTrustTree,
  primaryCreatorRoleForLiteratureType,
  type LiteratureBasicFieldKey,
} from "./literatureDetailModel";

import { TITLE_FIELD, DETAIL_SECTIONS, METADATA_FIELD_LABELS, detailValue, editorValue, patchFromEditor, patchMatchesItem, type DetailField } from "./literatureMetadataFields";

type MetadataFieldName = LiteratureMetadataPatch["fieldName"];

interface LiteratureMetadataDialogProps {
  readonly item: LiteratureItem;
  readonly focusFieldName: string | undefined;
  readonly isReadOnly: boolean;
  readonly onClose: () => void;
  readonly onError: (message: string) => void;
  readonly onSuccess: (message: string) => void;
  readonly onUpdateField: (patch: LiteratureMetadataPatch) => Promise<LiteratureItem>;
  readonly onConfirmFields: (fieldNames: readonly string[]) => Promise<LiteratureItem>;
  readonly onPreviewDoi: (item: LiteratureItem) => Promise<MetadataPreview>;
  readonly onApplyCandidateFields: (
    candidateId: string,
    decisions: readonly MetadataCandidateFieldDecision[],
    candidateTrust: MetadataCandidateTrust,
  ) => Promise<LiteratureItem>;
  readonly onRejectCandidate: (candidateId: string) => Promise<void>;
}

function errorMessage(reason: unknown): string {
  if (reason instanceof Error) return reason.message;
  if (typeof reason === "object" && reason !== null && "message" in reason) {
    const message = (reason as { readonly message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return String(reason);
}

export function LiteratureMetadataDialog({
  item,
  focusFieldName,
  isReadOnly,
  onClose,
  onError,
  onSuccess,
  onUpdateField,
  onConfirmFields,
  onPreviewDoi,
  onApplyCandidateFields,
  onRejectCandidate,
}: LiteratureMetadataDialogProps): React.JSX.Element {
  const [activeField, setActiveField] = useState<MetadataFieldName>();
  const [activeValue, setActiveValue] = useState("");
  const [activeCreators, setActiveCreators] = useState<LiteratureItem["creators"]>([]);
  const [busyField, setBusyField] = useState<MetadataFieldName>();
  const [preview, setPreview] = useState<MetadataPreview>();
  const [candidateChoices, setCandidateChoices] = useState<Readonly<Record<string, "candidate" | "current">>>({});
  const [candidateTrust, setCandidateTrust] = useState<MetadataCandidateTrust>("reviewable");
  const [isCandidateBusy, setIsCandidateBusy] = useState(false);
  const [validationError, setValidationError] = useState<string>();
  const [focusedTrustId, setFocusedTrustId] = useState<string>();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const editorRef = useRef<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(null);
  const committingRef = useRef(false);
  const creatorEntryDirection = useRef<-1 | 1>(1);
  const activeFieldRef = useRef(activeField); activeFieldRef.current = activeField;
  const skipNextBlurRef = useRef(false);
  const returnFocusRef = useRef(document.activeElement instanceof HTMLElement ? document.activeElement : null);
  const initialFocus = useMemo(() => ({ get current() {
    return (focusFieldName === undefined ? undefined
      : dialogRef.current?.querySelector<HTMLElement>(`[data-metadata-field="${focusFieldName}"]`)) ?? closeButtonRef.current;
  } }), [focusFieldName]);

  const pendingFields = useMemo(() => new Set(
    item.metadataSources.filter((source) => !source.confirmedByUser).map((source) => source.fieldName),
  ), [item.metadataSources]);
  const sourceByField = useMemo(() => new Map(
    item.metadataSources.map((source) => [source.fieldName, source]),
  ), [item.metadataSources]);
  const trustTree = useMemo(
    () => metadataTrustTree(item.metadataSources, METADATA_FIELD_LABELS),
    [item.metadataSources],
  );
  const previewDiffs = useMemo(() => new Map(
    preview?.diffs.map((diff) => [diff.fieldName, diff]) ?? [],
  ), [preview]);
  const displayedItemType = activeField === "itemType"
    && LITERATURE_TYPE_OPTIONS.some((option) => option.value === activeValue)
    ? activeValue as LiteratureItem["itemType"]
    : item.itemType;

  function shouldShowField(field: DetailField): boolean {
    if (previewDiffs.has(field.name)) return true;
    if (["title", "creators", "tags", "abstractText", "itemType", "issuedYear", "doi", "url", "language", "bibtexKey"].includes(field.name)) {
      return true;
    }
    const basicField: LiteratureBasicFieldKey = field.name === "volume"
      || field.name === "issue"
      || field.name === "pages"
      ? "volumeIssuePages"
      : field.name as LiteratureBasicFieldKey;
    return isBasicFieldApplicable(displayedItemType, basicField)
      || (preview !== undefined && isBasicFieldApplicable(preview.draft.itemType, basicField));
  }

  function fieldLabel(field: DetailField): string {
    if (field.name === "creators") {
      return creatorRoleLabel(primaryCreatorRoleForLiteratureType(displayedItemType));
    }
    if (field.name === "containerTitle") return basicFieldLabel("containerTitle", displayedItemType);
    return field.label;
  }

  function hasUnsavedInlineValue(): boolean {
    if (activeField === undefined) return false;
    try {
      return !patchMatchesItem(item, activePatch());
    } catch {
      return true;
    }
  }

  function requestClose(): void {
    if ((hasUnsavedInlineValue() || preview !== undefined)
      && !window.confirm("有尚未应用的元数据修改，确定关闭吗？")) return;
    if (preview !== undefined) void onRejectCandidate(preview.id).catch(() => undefined);
    onClose();
  }

  useEffect(() => {
    if (activeField === "creators") {
      if (creatorEntryDirection.current === -1) {
        const inputs = dialogRef.current?.querySelectorAll<HTMLElement>(".metadata-creator-editor input, .metadata-creator-editor select");
        inputs?.[inputs.length - 1]?.focus();
      }
      return;
    }
    editorRef.current?.focus();
    if (editorRef.current instanceof HTMLInputElement) editorRef.current.select();
  }, [activeField]);

  function beginEditing(fieldName: MetadataFieldName): void {
    if (isReadOnly || busyField !== undefined || preview !== undefined) return;
    activateField(fieldName, item);
  }

  function activateField(fieldName: MetadataFieldName, source: LiteratureItem, direction: -1 | 1 = 1): void {
    creatorEntryDirection.current = direction;
    skipNextBlurRef.current = false;
    setValidationError(undefined);
    if (fieldName === "creators") {
      setActiveCreators(source.creators.length > 0 ? source.creators.map((creator) => ({ ...creator }))
        : [{ familyName: "", givenName: "", literalName: "", role: primaryCreatorRoleForLiteratureType(source.itemType) }]);
    } else {
      setActiveValue(editorValue(source, fieldName));
    }
    activeFieldRef.current = fieldName;
    setActiveField(fieldName);
  }

  function cancelEditing(): void {
    skipNextBlurRef.current = true;
    activeFieldRef.current = undefined;
    setActiveCreators([]);
    setActiveField(undefined);
    setValidationError(undefined);
  }

  function activePatch(): LiteratureMetadataPatch {
    if (activeField === "creators") {
      return { fieldName: "creators", value: normalizedLiteratureCreators(activeCreators) };
    }
    if (activeField === undefined) throw new Error("No active metadata field");
    return patchFromEditor(activeField, activeValue);
  }

  async function commitActiveField(direction?: -1 | 1): Promise<void> {
    if (activeField === undefined || activeFieldRef.current !== activeField || committingRef.current || busyField !== undefined) return;
    if (skipNextBlurRef.current) {
      skipNextBlurRef.current = false;
      return;
    }
    const fieldName = activeField;
    const patch = activePatch();
    if (patch.fieldName === "title" && patch.value.trim().length === 0) {
      setValidationError("标题不能为空");
      return;
    }
    if (patch.fieldName === "issuedYear" && patch.value !== null && !Number.isInteger(patch.value)) {
      setValidationError("年份必须是整数");
      return;
    }
    if (patchMatchesItem(item, patch)) {
      finishEditing(item, direction);
      return;
    }
    committingRef.current = true;
    setBusyField(fieldName);
    setValidationError(undefined);
    try {
      const saved = await onUpdateField(patch);
      if (activeFieldRef.current !== fieldName) return;
      setActiveCreators([]);
      finishEditing(saved, direction);
      onSuccess("元数据已保存");
    } catch (reason: unknown) {
      onError(errorMessage(reason));
      window.requestAnimationFrame(() => {
        if (activeFieldRef.current !== fieldName) return;
        dialogRef.current?.querySelector<HTMLElement>(`[data-metadata-field="${fieldName}"] input, [data-metadata-field="${fieldName}"] textarea, [data-metadata-field="${fieldName}"] select`)?.focus();
      });
    } finally {
      committingRef.current = false;
      setBusyField(undefined);
    }
  }

  function finishEditing(source: LiteratureItem, direction: -1 | 1 | undefined): void {
    if (direction !== undefined) {
      const fields = [TITLE_FIELD, ...DETAIL_SECTIONS.flatMap(section => section.fields.filter(shouldShowField))];
      const next = fields[(fields.findIndex(field => field.name === activeField) + direction + fields.length) % fields.length];
      if (next) { activateField(next.name, source, direction); return; }
    }
    activeFieldRef.current = undefined;
    setActiveField(undefined);
  }

  async function confirmField(fieldName: MetadataFieldName): Promise<void> {
    setBusyField(fieldName);
    try {
      await onConfirmFields([fieldName]);
    } catch (reason: unknown) {
      onError(errorMessage(reason));
    } finally {
      setBusyField(undefined);
    }
  }

  async function confirmPendingFields(fieldNames: readonly string[]): Promise<void> {
    const redCount = fieldNames.filter((fieldName) => (
      sourceByField.get(fieldName) !== undefined
      && metadataSourceTrustStatus(sourceByField.get(fieldName)!) === "untrusted"
    )).length;
    const yellowCount = fieldNames.length - redCount;
    const summary = [redCount > 0 ? `红色 ${redCount} 项` : "", yellowCount > 0 ? `黄色 ${yellowCount} 项` : ""]
      .filter(Boolean).join("、");
    if (!window.confirm(`确认采纳本组待确认内容（${summary}）？\n确认表示采纳当前内容，不表示引用或外部事实已经得到证明。`)) return;
    try {
      await onConfirmFields(fieldNames);
      onSuccess(`已确认 ${fieldNames.length} 个字段`);
    } catch (reason: unknown) {
      onError(errorMessage(reason));
    }
  }

  function focusTrustNode(fieldName: string): void {
    const target = dialogRef.current?.querySelector<HTMLElement>(`[data-metadata-field="${fieldName}"]`);
    if (target === undefined || target === null) return;
    target.focus();
    target.scrollIntoView({ block: "center" });
    setFocusedTrustId(fieldName);
  }

  async function refreshDoi(): Promise<void> {
    setIsCandidateBusy(true);
    try {
      const nextPreview = await onPreviewDoi(item);
      if (nextPreview.diffs.length === 0) {
        await onRejectCandidate(nextPreview.id);
        onSuccess("当前信息已是最新");
        return;
      }
      setPreview(nextPreview);
      setCandidateChoices(Object.fromEntries(nextPreview.diffs.map((diff) => [
        diff.fieldName,
        diff.userConfirmed ? "current" : "candidate",
      ])));
      setCandidateTrust("reviewable");
    } catch (reason: unknown) {
      onError(errorMessage(reason));
    } finally {
      setIsCandidateBusy(false);
    }
  }

  async function applyCandidate(applyAllNewValues = false): Promise<void> {
    if (preview === undefined) return;
    setIsCandidateBusy(true);
    try {
      const decisions = preview.diffs.map((diff): MetadataCandidateFieldDecision => ({
        fieldName: diff.fieldName as MetadataFieldName,
        choice: applyAllNewValues ? "candidate" : (candidateChoices[diff.fieldName] ?? "current"),
      }));
      await onApplyCandidateFields(preview.id, decisions, candidateTrust);
      setPreview(undefined);
      setCandidateChoices({});
    } catch (reason: unknown) {
      onError(errorMessage(reason));
    } finally {
      setIsCandidateBusy(false);
    }
  }

  async function cancelCandidate(): Promise<void> {
    if (preview === undefined) return;
    setIsCandidateBusy(true);
    try {
      await onRejectCandidate(preview.id);
      setPreview(undefined);
      setCandidateChoices({});
    } catch (reason: unknown) {
      onError(errorMessage(reason));
    } finally {
      setIsCandidateBusy(false);
    }
  }

  function fieldKeyboardEdit(event: React.KeyboardEvent<HTMLElement>, fieldName: MetadataFieldName): void {
    if (fieldName === "creators" && activeField === fieldName && event.key === "Tab" && !event.altKey && !event.ctrlKey && !event.metaKey) {
      if (committingRef.current) { event.preventDefault(); event.stopPropagation(); return; }
      const controls = [...event.currentTarget.querySelectorAll<HTMLElement>(".metadata-creator-editor input:not(:disabled), .metadata-creator-editor select:not(:disabled)")];
      event.preventDefault(); event.stopPropagation();
      if (event.target === (event.shiftKey ? controls[0] : controls.at(-1))) {
        void commitActiveField(event.shiftKey ? -1 : 1);
      } else {
        controls[controls.indexOf(event.target as HTMLElement) + (event.shiftKey ? -1 : 1)]?.focus();
      }
      return;
    }
    if (event.target !== event.currentTarget || (event.key !== "Enter" && event.key !== "F2")) return;
    event.preventDefault();
    beginEditing(fieldName);
  }

  function editor(field: DetailField): React.JSX.Element {
    if (field.name === "creators") {
      return (
        <LiteratureCreatorEditor
          allowedRoles={creatorRolesForLiteratureType(displayedItemType)}
          creators={activeCreators}
          disabled={busyField === field.name}
          onCancel={cancelEditing}
          onChange={setActiveCreators}
          onSave={() => void commitActiveField()}
        />
      );
    }
    const setEditorRef = (node: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null): void => {
      editorRef.current = node;
    };
    const common = {
      "aria-label": fieldLabel(field),
      "data-tab-action": "both",
      disabled: busyField === field.name,
      onBlur: () => void commitActiveField(),
      onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setActiveValue(event.target.value),
      onKeyDown: (event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        if (event.key === "Tab" && !event.altKey && !event.ctrlKey && !event.metaKey && !event.nativeEvent.isComposing) {
          event.preventDefault(); event.stopPropagation();
          void commitActiveField(event.shiftKey ? -1 : 1);
          return;
        }
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          cancelEditing();
          return;
        }
        const shouldSave = field.name === "abstractText"
          ? event.key === "Enter" && (event.metaKey || event.ctrlKey)
          : event.key === "Enter";
        if (shouldSave) {
          event.preventDefault();
          void commitActiveField();
        }
      },
      ref: setEditorRef,
      value: activeValue,
    };
    if (field.name === "itemType") {
      return (
        <select {...common}>
          {LITERATURE_TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      );
    }
    if (field.name === "abstractText") return <textarea {...common} rows={7} />;
    return <input {...common} inputMode={field.name === "issuedYear" ? "numeric" : undefined} />;
  }

  function trustIndicator(field: DetailField): React.JSX.Element | null {
    const source = sourceByField.get(field.name);
    const status = source === undefined ? "neutral" : metadataSourceTrustStatus(source);
    if (status === "trusted" || status === "neutral") return null;
    return (
      <ContentTrustIndicator
        onActivate={!isReadOnly && pendingFields.has(field.name) && busyField === undefined && !isCandidateBusy
          ? () => void confirmField(field.name)
          : undefined}
        size="small"
        status={status}
        subjectLabel={fieldLabel(field)}
      />
    );
  }

  function candidateComparison(field: DetailField): React.JSX.Element | null {
    const diff = previewDiffs.get(field.name);
    if (diff === undefined || preview === undefined) return null;
    const choice = candidateChoices[field.name] ?? "current";
    return (
      <div className="metadata-candidate-compare">
        <label className={choice === "current" ? "selected" : ""}>
          <input checked={choice === "current"} name={`candidate-${field.name}`} onChange={() => setCandidateChoices((current) => ({ ...current, [field.name]: "current" }))} type="radio" />
          <span>保留当前</span><b>{detailValue(item, field)}</b>
        </label>
        <label className={choice === "candidate" ? "selected" : ""}>
          <input checked={choice === "candidate"} name={`candidate-${field.name}`} onChange={() => setCandidateChoices((current) => ({ ...current, [field.name]: "candidate" }))} type="radio" />
          <span>采用候选</span><b>{detailValue(preview.draft, field)}</b>
        </label>
      </div>
    );
  }

  function fieldContent(field: DetailField, isTitle = false): React.JSX.Element {
    const isEditing = activeField === field.name;
    const comparison = candidateComparison(field);
    return (
      <div
        className={`metadata-field ${field.wide ? "wide" : ""} ${isTitle ? "metadata-title-field" : ""} ${isReadOnly ? "readonly" : "editable"}`}
        data-metadata-field={field.name}
        key={field.name}
        onDoubleClick={() => beginEditing(field.name)}
        onFocus={() => setFocusedTrustId(field.name)}
        onKeyDown={(event) => fieldKeyboardEdit(event, field.name)}
        tabIndex={isReadOnly || preview !== undefined ? -1 : 0}
      >
        {!isTitle && !field.hideLabel && <span className="metadata-field-label">{fieldLabel(field)}</span>}
        <div className="metadata-field-value-row">
          {isEditing ? editor(field) : isTitle
            ? <h2 id="metadata-dialog-title">{item.title}</h2>
            : <p>{detailValue(item, field)}</p>}
          <div className="metadata-field-actions">
            {field.name === "doi" && !isReadOnly && preview === undefined && (
              <ControlHint content="刷新 DOI 元数据"><button aria-label="刷新 DOI 元数据" className="metadata-refresh-doi" disabled={isCandidateBusy || item.doi.trim().length === 0} onClick={() => void refreshDoi()} type="button">
                <RefreshCw aria-hidden="true" className={isCandidateBusy ? "spinning" : ""} size={15} />
              </button></ControlHint>
            )}
            {trustIndicator(field)}
          </div>
        </div>
        {comparison}
        {activeField === field.name && validationError !== undefined && (
          <span className="metadata-field-validation" role="alert">{validationError}</span>
        )}
      </div>
    );
  }

  return (
    <Dialog open portal backdrop={false} hideOnInteractOutside={false} aria-label="文献详情" ref={dialogRef}
      finalFocus={returnFocusRef} initialFocus={initialFocus}
      hideOnEscape={() => {
        if (activeField === undefined) return true;
        skipNextBlurRef.current = true;
        activeFieldRef.current = undefined;
        setActiveField(undefined); setValidationError(undefined);
        return false;
      }} onClose={event => { event.preventDefault(); requestClose(); }}
      className="metadata-dialog-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) requestClose();
    }}>
      <section className="metadata-dialog">
        <header>
          <div className="metadata-dialog-heading">
            <span>文献详情</span>
            {fieldContent(TITLE_FIELD, true)}
          </div>
          <ContentTrustGroupControls
            currentId={focusedTrustId}
            hideResolvedIndicator
            onConfirmPending={isReadOnly ? undefined : (fieldNames) => void confirmPendingFields(fieldNames)}
            onNavigate={(node) => focusTrustNode(node.id)}
            tree={trustTree}
          />
          <button aria-label="关闭文献详情" onClick={requestClose} ref={closeButtonRef} type="button">
            <X aria-hidden="true" size={18} />
          </button>
        </header>
        <div className="metadata-detail-sections">
          {DETAIL_SECTIONS.map((section) => {
            const visibleFields = section.fields.filter(shouldShowField);
            if (visibleFields.length === 0) return null;
            return (
              <section className="metadata-detail-section" key={section.title}>
                <h3>{section.title}</h3>
                <div className="metadata-detail-grid">
                  {visibleFields.map((field) => fieldContent(field))}
                </div>
              </section>
            );
          })}
        </div>
        {preview !== undefined && (
          <footer className="metadata-candidate-actions">
            {preview.warnings !== undefined && preview.warnings.length > 0 && (
              <div className="metadata-candidate-warnings" role="status">
                {preview.warnings.map((warning) => <p key={warning}>{warning}</p>)}
              </div>
            )}
            <fieldset className="metadata-candidate-trust">
              <legend>采用的新值标记为</legend>
              <label>
                <input checked={candidateTrust === "reviewable"} name="candidate-trust" onChange={() => setCandidateTrust("reviewable")} type="radio" />
                待确认（黄）
              </label>
              <label>
                <input checked={candidateTrust === "trusted"} name="candidate-trust" onChange={() => setCandidateTrust("trusted")} type="radio" />
                可信（绿）
              </label>
            </fieldset>
            <button className="ghost-button" disabled={isCandidateBusy} onClick={() => void cancelCandidate()} type="button">取消</button>
            <button className="ghost-button" disabled={isCandidateBusy} onClick={() => void applyCandidate()} type="button">应用所选</button>
            <button className="primary-button" disabled={isCandidateBusy} onClick={() => void applyCandidate(true)} type="button">{isCandidateBusy ? "正在应用…" : "应用全部新值"}</button>
          </footer>
        )}
      </section>
    </Dialog>
  );
}
