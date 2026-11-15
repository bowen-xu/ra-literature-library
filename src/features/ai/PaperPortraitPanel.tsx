import { Dialog } from "@research-assistant/workbench-sdk/overlay";
import {SystemDocumentDialog} from "@research-assistant/workbench-sdk/settings";
import {FileText as DocumentIcon} from "lucide-react";
import { StructuredPortraitEditor, type StructuredPortraitEditorHandle } from "./resources/StructuredPortraitEditor";
import type { StructuredResource } from "@research-assistant/core/structured-resources";
import type { StructuredResourceGateway } from "@research-assistant/workbench-sdk/structured-resources";
import { StructuredResourceReview } from "./resources/StructuredResourceReview";
import { ReadingTemplateDialog } from "./resources/ReadingTemplateDialog";
import { ManagedReadingTemplate } from "./resources/ManagedReadingTemplate";
import { LayoutTemplate, MessagesSquare, Plus, RefreshCw, Sparkles, Settings2, X } from "lucide-react";
import { DialogHeading } from "@ariakit/react";
import { useEffect, useRef, useState } from "react";
import {
  DEFAULT_PORTRAIT_CATALOG, portraitGenerationGoal, type CustomPortraitDimension, type PortraitCatalog, type PortraitTagCatalog, type PortraitTagDimension,
  selectPaperPortraitTemplate, type AiCandidate,
  type AiTaskSpecDraft, type LlmModelSelection, type PaperPortraitCandidateV1, type PaperTemplateSnapshot,
} from "@research-assistant/core/ai";
import type { LiteratureItem } from "@research-assistant/core/literature";
import type { AiAssistanceGateway } from "@research-assistant/workbench-sdk/ai-assistance";
import { aiAssistanceErrorMessage } from "@research-assistant/workbench-sdk/ai-assistance";
import { notify } from "@research-assistant/workbench-sdk/feedback";
import { LlmRoutePicker } from "@research-assistant/workbench-sdk/model-route-picker";
import { usePaperPortraitRun } from "./usePaperPortraitRun";
import { PaperPortraitSummary } from "./PaperPortraitSummary";
import { subscribePortraitDetail } from "./portraitDetailNavigation";
import { PortraitDimensionDialog } from "./PortraitDimensionDialog";
import { ControlHint } from "@research-assistant/workbench-sdk/overlay";
import { openAgentConversation } from "@research-assistant/workbench-sdk/agent-ui";
import { PortraitSources } from "./PortraitSources";
import { loadPortraitCatalog, savePortraitCatalog } from "./portraitCatalogPreferences";
import { loadPaperCandidates } from "./paperCandidateRequests";
import { PortraitHistoryControls, PortraitHistoryProvider, portraitHistoryKeyDown, usePortraitEditHistory, usePortraitHistoryBusy } from "./PortraitEditHistory";
import { subscribePaperReadingChanged } from "./readingPanelEvents";
import "./PaperPortraitPanel.css";

function portraitPayload(candidate: AiCandidate | undefined): PaperPortraitCandidateV1 | undefined {
  const payload = candidate?.revisions.find(revision => revision.revision === candidate.currentRevision)?.payload;
  return payload?.kind === "paper_portrait_v1" ? payload : undefined;
}

export type PortraitTemplateState = "loading" | "error" | "absent" | "unconfirmed" | "rejected" | "confirmed";

interface PaperPortraitPanelProps {
  readonly resourceManaged?: boolean;
  readonly resourceBlocked?: boolean;
  readonly paperTemplateResource?: StructuredResource;
  readonly managedResource?: StructuredResource;
  readonly resourceGateway?: StructuredResourceGateway;
  readonly onResourceChanged?: (resource: StructuredResource) => void;
  readonly selectedAttachmentIds?: readonly string[];
  readonly onSourceSelectionChanged?: (ids: readonly string[]) => void;
  readonly item: LiteratureItem;
  readonly gateway: AiAssistanceGateway;
  readonly onConfirmedTemplateChanged?: (template: PaperTemplateSnapshot | undefined, state: PortraitTemplateState) => void;
}
export function PaperPortraitPanel(props: PaperPortraitPanelProps): React.JSX.Element {
  return <PortraitHistoryProvider key={props.item.id}><PaperPortraitPanelContent {...props}/></PortraitHistoryProvider>;
}
function PaperPortraitPanelContent({ item, gateway, onConfirmedTemplateChanged, selectedAttachmentIds, onSourceSelectionChanged, managedResource, resourceManaged = false, resourceBlocked = false, resourceGateway, onResourceChanged, paperTemplateResource }: PaperPortraitPanelProps): React.JSX.Element {
  const editHistory=usePortraitEditHistory();
  const managedEditor=useRef<StructuredPortraitEditorHandle>(null);
  const [showDocuments,setShowDocuments]=useState(false);
  const [showTemplates,setShowTemplates] = useState(false);
  const [candidates, setCandidates] = useState<readonly AiCandidate[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [localAttachmentIds, setLocalAttachmentIds] = useState<readonly string[]>(item.attachments.filter(value => value.mimeType === "application/pdf").slice(0, 1).map(value => value.id));
  const attachmentIds = selectedAttachmentIds ?? localAttachmentIds;
  const setAttachmentIds = onSourceSelectionChanged ?? setLocalAttachmentIds;
  const [selection, setSelection] = useState<LlmModelSelection>();
  const generation = usePaperPortraitRun(gateway, item.id);
  const { runId } = generation;
  const generating = generation.preparing || runId !== undefined && !generation.terminalUnknown;
  const canCancel = runId !== undefined && !generation.terminalUnknown;
  const [busy, setBusy] = useState(false);
  const historyBusy=usePortraitHistoryBusy();
  const working = busy || generating || generation.recovering || historyBusy;
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  useEffect(() => subscribePortraitDetail(item.id, () => setShowDetail(true)), [item.id]);
  useEffect(()=>{editHistory?.clear();},[editHistory,showDetail,selectedId]);
  const detailButtonRef = useRef<HTMLButtonElement>(null);
  const [showConfig, setShowConfig] = useState(false);
  const [showDimensionDialog, setShowDimensionDialog] = useState(false);
  const catalogButtonRef = useRef<HTMLButtonElement>(null);
  const [catalog, setCatalog] = useState<PortraitCatalog>(() => {
    try { return loadPortraitCatalog(); } catch { return DEFAULT_PORTRAIT_CATALOG; }
  });
  function saveCatalog(value: PortraitCatalog): boolean {
    const before=catalog;
    function restore(target:PortraitCatalog,expected:PortraitCatalog):boolean {
      if(JSON.stringify(loadPortraitCatalog())!==JSON.stringify(expected)){
        editHistory?.clear("catalog");notify.error("标签配置已变化，请核对最新配置后继续。");return false;
      }
      savePortraitCatalog(target);setCatalog(target);return true;
    }
    try { savePortraitCatalog(value); setCatalog(value);
      if(JSON.stringify(before)!==JSON.stringify(value))editHistory?.record({scope:"catalog",undo:()=>restore(before,value),redo:()=>restore(value,before)});
      return true; }
    catch (reason) { notify.error(aiAssistanceErrorMessage(reason)); return false; }
  }
  function saveTags(dimension: PortraitTagDimension, tags: NonNullable<PortraitTagCatalog[PortraitTagDimension]>): boolean {
    const frozen = current?.customDimensions?.find(value => value.id === dimension);
    const customDimensions = frozen === undefined || catalog.customDimensions?.some(value => value.id === dimension) ? catalog.customDimensions : [...(catalog.customDimensions ?? []), frozen];
    if (!saveCatalog({ ...catalog, ...(customDimensions === undefined ? {} : { customDimensions }), tags: { ...catalog.tags, [dimension]: tags } })) return false;
    notify.success("标签配置已保存。"); return true;
  }
  function saveDimension(dimension: CustomPortraitDimension): boolean {
    if ((catalog.customDimensions?.length ?? 0) >= 5) return false;
    const tags = [{ label: "不确定", description: "已读取材料不足以确定此维度的分类。" }];
    if (!saveCatalog({ ...catalog, customDimensions: [...(catalog.customDimensions ?? []), dimension], tags: { ...catalog.tags, [dimension.id]: tags } })) return false;
    if(managedResource?.content && resourceGateway && onResourceChanged){
      const portrait=managedResource.content as PaperPortraitCandidateV1;
      setBusy(true);
      const editor=managedEditor.current;
      if(editor)void editor.save({...portrait,customDimensions:[...(portrait.customDimensions??[]),dimension],claims:[...portrait.claims,{id:`claim_${crypto.randomUUID().replaceAll("-","")}`,dimension:dimension.id,label:"不确定",description:tags[0]!.description,certainty:"uncertain",evidence:[]}]}).finally(()=>setBusy(false));
      else {setBusy(false);notify.error("画像编辑器尚未就绪，请重试。");return false;}
    }
    notify.success("画像维度已创建，可配置标签后重新生成画像。"); return true;
  }
  const eventSourceId = useRef(crypto.randomUUID());
  const alive = useRef(true);
  const candidate = candidates.find(value => value.id === selectedId) ?? candidates[0];
  const current = portraitPayload(candidate);
  const dirty = false;
  const terminal = resourceManaged && (!managedResource || selectedId !== undefined) || managedResource !== undefined && selectedId !== undefined || candidate !== undefined && ["accepted_unchanged", "accepted_after_edit", "rejected"].includes(candidate.reviewState);
  const canonicalBlocked = resourceManaged && (resourceBlocked || !managedResource);

  const candidateRequest = useRef(0);
  const candidatePaper = useRef(item.id);
  candidatePaper.current = item.id;
  async function reload(): Promise<void> {
    const request = ++candidateRequest.current;
    try {
      const all = await loadPaperCandidates(gateway, item.id);
      if (alive.current && candidatePaper.current === item.id && request === candidateRequest.current) {
        setCandidates(all.filter(value => value.candidateKind === "paper_portrait_v1"
          && value.evidenceBundle.items.length > 0
          && value.evidenceBundle.items.every(source => source.paperId === item.id))
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
        setLoadError(false);
      }
    } catch (reason) {
      if (alive.current && candidatePaper.current === item.id && request === candidateRequest.current) throw reason;
    }
  }
  useEffect(() => {
    let active = true;
    alive.current = true;
    void reload().catch(() => { if (active && alive.current) { setLoadError(true); } })
      .finally(() => { if (active && alive.current) setLoading(false); });
    return () => { active = false; alive.current = false; candidateRequest.current++; };
  }, [gateway, item.id]);

  useEffect(() => subscribePaperReadingChanged(item.id, () => { void reload().catch(reason => notify.error(aiAssistanceErrorMessage(reason))); }, eventSourceId.current), [gateway, item.id]);

  useEffect(() => {
    const selected = selectPaperPortraitTemplate(candidates, item.id);
    const payload = selected?.candidate.revisions.find(value => value.revision === selected.revision)?.payload;
    const template = selected === undefined || payload?.kind !== "paper_portrait_v1" ? undefined : { portraitCandidateId: selected.candidate.id, portraitRevision: selected.revision, fields: payload.template };
    onConfirmedTemplateChanged?.(template, loading || generation.recovering ? "loading" : loadError ? "error" : selected?.isConfirmed ? "confirmed"
      : selected !== undefined ? "unconfirmed" : candidates.length === 0 ? "absent" : candidates[0]?.reviewState === "rejected" ? "rejected" : "unconfirmed");
  }, [candidates, item.id, loading, loadError, generation.recovering, onConfirmedTemplateChanged]);

  async function prepare(): Promise<void> {
    if (canonicalBlocked) {
      notify.info("统一画像资源尚未恢复，请先等待加载完成或重试迁移。原内容保持不变。");
      return;
    }
    await generation.start(async () => {
      let configuredCatalog = loadPortraitCatalog();
      if (managedResource && resourceGateway) {
        const published = (await resourceGateway.list()).filter(resource =>
          resource.kind === "readingTemplate" && !resource.paperId && resource.revision > 0);
        configuredCatalog = {...configuredCatalog, templates: published.map(resource => {
          const content = resource.content as {name: string; fields: readonly {
            id: string; title: string; question: string; color?: string;
          }[]};
          return {id: resource.id, label: content.name, fields: content.fields.map(field => ({...field, claimIds: []}))};
        })};
      }
      setCatalog(configuredCatalog);
      const attachments = item.attachments.filter(value => attachmentIds.includes(value.id) && value.mimeType === "application/pdf");
      if (attachments.length === 0) throw new Error("请先选择来源 PDF。");
      if (attachments.length > 8) throw new Error("最多选择 8 个来源 PDF。");
      const task: AiTaskSpecDraft = {
        taskKind: "paper_profile_classification", providerId: "", ...(selection === undefined ? {} : { modelSelection: selection }),
        userGoal: portraitGenerationGoal(configuredCatalog),
        pipelineVersion: "paper-portrait-sources-v2", promptVersion: "paper-portrait-catalog-v2", outputSchemaVersion: 1,
        maxInputTokens: 24000, maxOutputTokens: 8000, timeoutMs: 120000,
        scopeItems: attachments.map(attachment => ({ itemKind: "attachment", objectId: attachment.id, parentObjectId: item.id, contentSha256: attachment.contentSha256 })),
      };
      const scope = await gateway.previewTask(task);
      const run = await gateway.startRun({ ...task, confirmedScopeHash: scope.scopeHash,
        ...(scope.requiresCloudConsent ? { cloudConsentVersion: "ai-cloud-consent-v1" } : {}) });
      if (alive.current) setSelectedId(undefined);
      return run;
    });
  }
  const active = selectPaperPortraitTemplate(candidates, item.id);
  const summaryCandidate = active?.candidate ?? candidates[0];
  const summaryPayload = resourceManaged || managedResource ? (managedResource?.content as PaperPortraitCandidateV1 | null) ?? undefined : portraitPayload(summaryCandidate);
  async function openConversation(historical = false): Promise<void> {
    try {
      const id = historical && candidate ? (await gateway.getRun(candidate.runId)).sharedConversationId : generation.conversationId;
      if (!id) { notify.info("此画像任务尚无可用的内部对话。"); return; }
      setShowDetail(false);
      await openAgentConversation(id);
    } catch (reason) { notify.error(aiAssistanceErrorMessage(reason)); }
  }
  return <>
    <PaperPortraitSummary payload={summaryPayload} loading={loading || generation.recovering} failed={loadError}
      adopted={active?.isConfirmed ?? false} rejected={active === undefined && summaryCandidate?.reviewState === "rejected"}
      {...(runId === undefined || generation.terminalUnknown ? {} : { onCancel: () => { void generation.cancel(); } })}
      {...(generation.conversationId ? { onOpenConversation: () => { void openConversation(); } } : {})}
      running={generating} canceling={generation.canceling} onGenerate={() => { void prepare(); }} generateDisabled={working || !!generation.error || loading || attachmentIds.length === 0 || canonicalBlocked} buttonRef={detailButtonRef} onOpen={() => { try { setCatalog(loadPortraitCatalog()); } catch (reason) { notify.error(aiAssistanceErrorMessage(reason)); } setShowDetail(true); }} />
    {generation.error && (generation.creationUnknown || generation.terminalUnknown
      ? <p role="alert">{generation.error}</p>
      : <button type="button" onClick={generation.retry}>重试读取画像生成状态</button>)}
    {showDocuments && <SystemDocumentDialog workflow="portrait" onClose={()=>setShowDocuments(false)}/>}
    {showTemplates && resourceGateway && <PortraitHistoryProvider detached><ReadingTemplateDialog gateway={resourceGateway} {...(onResourceChanged ? {onChanged:onResourceChanged} : {})} onClose={() => setShowTemplates(false)}/></PortraitHistoryProvider>}
    {showDetail && <Dialog open portal finalFocus={detailButtonRef.current}
      hideOnInteractOutside={event => event.type === "click"}
      onKeyDown={event=>portraitHistoryKeyDown(event,editHistory,working)}
      hideOnEscape={event => !(event.target instanceof Element && event.target.closest('[role="menu"]'))}
      onClose={() => setShowDetail(false)} aria-label="文献画像详情" className="paper-portrait-detail-panel" backdrop={<div className="portrait-detail-backdrop" />}>
      <header className="portrait-detail-heading">
        <DialogHeading render={<h2 />}>文献画像</DialogHeading>
        <div className="portrait-detail-heading-actions">
          <button type="button" aria-label="关闭画像详情" onClick={() => setShowDetail(false)}><X size={18} aria-hidden="true" /></button>
        </div>
    </header>
    <div className="portrait-detail-scroll"><section className="paper-portrait-panel paper-portrait-editor" aria-label="画像与模板编辑">
    <p className="portrait-paper-title">{item.title}</p>
    <header><h3>画像与模板</h3><div>
      <PortraitHistoryControls disabled={working || (!managedResource || selectedId!==undefined) && terminal}/>
      <ControlHint content="打开画像指令文档"><button type="button" className="portrait-icon-action" aria-label="打开画像指令文档" onClick={()=>setShowDocuments(true)}><DocumentIcon size={16}/></button></ControlHint>
      {resourceGateway&&<ControlHint content="管理全局阅读模板"><button type="button" className="portrait-icon-action" aria-label="管理全局阅读模板" onClick={()=>setShowTemplates(true)}><LayoutTemplate size={16} aria-hidden="true"/></button></ControlHint>}
      {(generation.conversationId || selectedId && candidate) && <ControlHint content="打开画像内部对话"><button type="button" className="portrait-icon-action" data-agent-conversation-trigger aria-label="打开画像内部对话" onClick={() => { void openConversation(selectedId !== undefined); }}><MessagesSquare size={16} aria-hidden="true"/></button></ControlHint>}
      <ControlHint content={canCancel ? "取消生成" : current === undefined ? "生成画像" : "重新生成画像"}><button type="button" className="portrait-icon-action" aria-label={canCancel ? "取消生成" : current === undefined ? "生成画像" : "重新生成画像"} disabled={generation.canceling || !canCancel && (working || !!generation.error || loading || dirty || attachmentIds.length === 0 || canonicalBlocked)} onClick={() => canCancel ? void generation.cancel() : void prepare()}>
        {canCancel ? <X size={16} aria-hidden="true" /> : current === undefined ? <Sparkles size={16} aria-hidden="true" /> : <RefreshCw size={16} aria-hidden="true" />}
      </button></ControlHint>
      <ControlHint content="新增画像维度"><button type="button" className="portrait-icon-action" ref={catalogButtonRef} aria-label="新增画像维度" disabled={working || (catalog.customDimensions?.length ?? 0) >= 5 || current !== undefined && current.claims.length >= 24} onClick={() => setShowDimensionDialog(true)}><Plus size={16} aria-hidden="true" /></button></ControlHint>
      <ControlHint content="配置画像模型"><button type="button" className="portrait-icon-action" aria-label="配置画像模型" aria-expanded={showConfig} disabled={working} onClick={() => setShowConfig(value => !value)}><Settings2 size={16} aria-hidden="true" /></button></ControlHint>
    </div></header>
    {showDimensionDialog && <PortraitDimensionDialog catalog={catalog} finalFocus={catalogButtonRef} onSave={saveDimension} onClose={() => setShowDimensionDialog(false)} />}
    {showConfig && <LlmRoutePicker gateway={gateway} disabled={working} legend="文献画像模型" description="判断文献类型、知识形态与研究范式；不按学科名称硬套分类，无须人工二次核验。" taskKind="paper_profile_classification" onSelection={setSelection} />}
    <PortraitSources attachments={item.attachments} selectedIds={attachmentIds} disabled={working}
      onChange={ids => { const before=attachmentIds;setAttachmentIds(ids);
        editHistory?.record({scope:"sources",undo:()=>{setAttachmentIds(before);return true;},redo:()=>{setAttachmentIds(ids);return true;}});
      }} />
    {loading && <p role="status">正在读取画像…</p>}
    {loadError && <button type="button" onClick={() => void reload().catch(reason => notify.error(aiAssistanceErrorMessage(reason)))}>重试读取画像</button>}
    {generating && <p role="status">{generation.canceling ? "正在取消画像生成…" : "正在生成画像；已保存的画像保持不变。"}</p>}
    {generation.error && (generation.creationUnknown || generation.terminalUnknown
      ? <p role="alert">{generation.error}</p>
      : <button type="button" onClick={generation.retry}>重试读取画像生成状态</button>)}
    {resourceManaged && !managedResource && selectedId === undefined ? <p role="status">统一画像资源尚未恢复，请先重试迁移；历史记录保持只读。</p> : managedResource && resourceGateway && onResourceChanged && selectedId === undefined ? <>
      {managedResource.content === null && <p>尚无文献画像，生成后可在此审阅修改。</p>}
      {managedResource.content !== null && <StructuredPortraitEditor resource={managedResource} catalog={catalog} gateway={resourceGateway} onChanged={onResourceChanged} onSaveTags={saveTags} disabled={canonicalBlocked || working} editRef={managedEditor}/>}
      <StructuredResourceReview resource={managedResource} gateway={resourceGateway} onChanged={onResourceChanged} hideWhenClean/>
      {paperTemplateResource && <section aria-label="本文阅读模板"><h4>本文阅读模板</h4>
        <ManagedReadingTemplate resource={paperTemplateResource} gateway={resourceGateway} onChanged={onResourceChanged}/>
      </section>}
    </> : <p role="status">统一画像资源尚未就绪，请完成数据恢复后重试；旧记录仅作恢复依据。</p>}
  </section></div></Dialog>}
  </>;
}
