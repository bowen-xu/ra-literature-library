import { memo, useEffect, useState, useSyncExternalStore } from "react";
import type { HbsSession } from "@research-assistant/core/hbs";
import type { StructuredResource } from "@research-assistant/core/structured-resources";
import type { AppHbsDocumentGateway } from "@research-assistant/workbench-sdk/hbs";
import type { StructuredResourceEvidence, StructuredResourceGateway } from "@research-assistant/workbench-sdk/structured-resources";
import { HbsStructuredEditor, type StructuredNativeHistoryAction } from "@research-assistant/workbench-sdk/hbs";
import { ContentTrustIndicator } from "@research-assistant/workbench-sdk/ui";
import { ControlHint } from "@research-assistant/workbench-sdk/overlay";
import { portraitHistoryKeyDown, usePortraitEditHistory } from "../PortraitEditHistory";
import { StructuredResourceDraftEditor } from "./StructuredResourceDraftEditor";
import { StructuredFieldSourceLinks } from "./StructuredFieldSourceLinks";
import { useStructuredHbsSession } from "./useStructuredHbsSession";
const StableTrustIndicator = memo(ContentTrustIndicator);
interface Props {
  readonly resource: StructuredResource;
  readonly gateway: StructuredResourceGateway;
  readonly onChanged: (resource: StructuredResource) => void;
  readonly hbsGateway?: AppHbsDocumentGateway;
  readonly hideWhenClean?:boolean;
  readonly showRepairDraft?:boolean;
  readonly disabled?:boolean;
}
/** Business metadata stays in the host. The same production card/editor tree
 * used by adapter previews owns HBS review, input and native editor history. */
export const StructuredResourceReview = memo(function StructuredResourceReview({resource,gateway,onChanged,hbsGateway,hideWhenClean,showRepairDraft=true,disabled=false}: Props) {
  const owner=useStructuredHbsSession(resource,gateway,onChanged,hbsGateway);
  return <>
    {owner.submissionBlocked&&<p role="status">{owner.submissionBlocked}<button type="button" disabled={owner.settling} onClick={()=>{void owner.settle();}}>核对原保存请求</button></p>}
    {owner.session?<ReadyStructuredResourceReview resource={resource} gateway={gateway} onChanged={onChanged} disabled={disabled} session={owner.session} historyOwner={owner.history} nativeHistory={owner.nativeHistory} {...(owner.unknownRequestId?{unknownRequestId:owner.unknownRequestId}:{})} {...(owner.submissionBlocked?{submissionBlocked:owner.submissionBlocked}:{})} {...(hideWhenClean?{hideWhenClean}:{})}/>
      :(!hideWhenClean||resource.pendingFieldIds.length>0||owner.error)&&<p role="status">{owner.error??"正在读取结构化资源与编辑保全…"}</p>}
    {owner.session&&owner.error&&<p role="alert">{owner.error}</p>}
    {showRepairDraft&&resource.draft&&<StructuredResourceDraftEditor resource={resource} gateway={gateway} onChanged={onChanged}/>}
  </>;
});
function ReadyStructuredResourceReview({resource,gateway,session,submissionBlocked,hideWhenClean,historyOwner,nativeHistory,unknownRequestId,disabled=false}: Omit<Props,"hbsGateway"> & {
  readonly session:HbsSession<unknown>;readonly submissionBlocked?:string;readonly unknownRequestId?:string;
  readonly historyOwner:ReturnType<typeof useStructuredHbsSession>["history"];readonly nativeHistory:ReturnType<typeof useStructuredHbsSession>["nativeHistory"];
}) {
  const state=useSyncExternalStore(session.subscribe,session.getSnapshot);
  const historyScope=`${resource.id}:hbs`;
  const panelHistory=usePortraitEditHistory(),history=panelHistory??historyOwner;
  useSyncExternalStore(history.subscribe,history.snapshot);
  const otherBusy=history.busyExcept(historyScope);
  const [evidence,setEvidence]=useState<readonly StructuredResourceEvidence[]>([]),[sourceError,setSourceError]=useState(false),[busy,setBusy]=useState(false);
  useEffect(()=>{
    let active=true;
    void gateway.getSources(resource.id).then(value=>{if(active){setEvidence(current=>JSON.stringify(current)===JSON.stringify(value)?current:value);setSourceError(false);}})
      .catch(()=>{if(active)setSourceError(true);});
    return()=>{active=false;};
  },[gateway,resource.id,resource.revision]);
  useEffect(()=>{
    history.lock(historyScope,disabled||busy||state.pending);
    return()=>history.lock(historyScope,false);
  },[history,historyScope,disabled,busy,state.pending]);
  // Host departure is not resource disposal. Native callbacks go through the
  // retained owner, which binds the next reader/library host on mount; keeping
  // the panel entries preserves input and review undo after switching back.
  const current={...resource,content:state.content};
  const title=resource.kind==="portrait"?"文献画像":resource.kind==="structuredReading"?"结构化阅读记录":resource.title;
  const recordHistory=(action:StructuredNativeHistoryAction)=>{
    nativeHistory.activate(action);history.record({scope:historyScope,...nativeHistory.actions});
  };
  const keepUnreviewed=async()=>{
    if(disabled||busy||otherBusy)return;
    if(submissionBlocked){session.record(submissionBlocked);return;}
    setBusy(true);
    try{
      // This business scope remains server-owned: protected fields are not a
      // public DTO and cannot safely be guessed from verification indicators.
      await session.save();
      const shown=session.getSnapshot();
      if(shown.pending||shown.conflicts.length||shown.preservationError){session.record("MODEL_REVIEW_PENDING：请先核对当前冲突或前序回执，未校验范围尚未采纳。");return;}
      const result=await gateway.review({resourceId:resource.id,expectedRevision:shown.observed.version,requestId:crypto.randomUUID(),action:"keep",scope:"unreviewed"});
      await session.syncLatest();
      const operationRevision=result.revision;
      const replay=async(direction:"undo"|"redo")=>{
        try{
          await gateway.restoreHistory({resourceId:resource.id,expectedRevision:session.getSnapshot().observed.version,
            operationRevision,direction,requestId:crypto.randomUUID()});
          await session.syncLatest();return true;
        }catch(reason){session.record(`MODEL_HISTORY_FAILED：${reason instanceof Error?reason.message:String(reason)}`);return false;}
      };
      history.record({scope:historyScope,undo:()=>replay("undo"),redo:()=>replay("redo")});
    }catch(reason){session.record(`MODEL_REVIEW_FAILED：${reason instanceof Error?reason.message:String(reason)}`);}
    finally{setBusy(false);}
  };
  return <div onKeyDown={event=>{if(!disabled&&!panelHistory)portraitHistoryKeyDown(event,history,false);}}>
    <div hidden={hideWhenClean&&!state.changes.length&&!state.conflicts.length&&!state.preservationError&&!state.message.startsWith("MODEL_")}><HbsStructuredEditor session={session} resourceKind={resource.kind} resourceId={resource.id} title={title} busy={disabled||busy||otherBusy} {...(submissionBlocked?{submissionBlocked}:{})}
      panelOwnsHistory onHistoryAction={recordHistory} onNativeHistoryReady={nativeHistory.bind} onHistoryCommand={direction=>{if(!disabled)void history.replay(direction);}} onKeepUnreviewed={()=>{void keepUnreviewed();}}
      renderIndicators={field=>!field.id.startsWith("$")&&<StableTrustIndicator showHint size="small" subjectLabel={field.title}
        status={resource.reviewedFieldIds.includes(field.id)?"trusted":"untrusted"} statusLabel={resource.reviewedFieldIds.includes(field.id)?"人工已校验":"未人工校验"}/>}
      renderFooter={field=><StructuredFieldSourceLinks resource={current} fieldId={field.id} evidence={evidence}/>}/></div>
    {sourceError&&<p role="alert">无法读取当前版本的原文引用，请刷新后重试。</p>}
    {!submissionBlocked&&state.pending&&unknownRequestId&&<ControlHint content={`MODEL_RESULT_UNKNOWN：请求 ${unknownRequestId} 的结果尚未核对；继续使用同一请求身份。`}>
      <button type="button" data-request-id={unknownRequestId} onClick={()=>{void session.save();}}>核对保存请求</button>
    </ControlHint>}
  </div>;
}
