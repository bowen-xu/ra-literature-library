import { useEffect, useRef, useSyncExternalStore } from "react";
import { createStructuredDocumentAdapter, DocumentVersionConflict, HbsSession, type DocumentCommit, type DocumentPort } from "@research-assistant/core/hbs";
import { createDocumentPort, createDocumentPreservationPort } from "@research-assistant/data/hbs";
import type { StructuredResource } from "@research-assistant/core/structured-resources";
import { directTextDiff } from "@research-assistant/workbench-sdk/hbs";
import { getHbsDocumentGateway, getPendingHbsDocumentCommit, type AppHbsDocumentGateway } from "@research-assistant/workbench-sdk/hbs";
import type { StructuredResourceGateway } from "@research-assistant/workbench-sdk/structured-resources";
import { PortraitEditHistory } from "../PortraitEditHistory";
import type { StructuredNativeHistoryAction } from "@research-assistant/workbench-sdk/hbs";

interface NativeHistoryPort {
  readonly actions:StructuredNativeHistoryAction;
  bind(actions:StructuredNativeHistoryAction):()=>void;
  activate(actions:StructuredNativeHistoryAction):void;
  clear():void;
}

interface OwnerState { readonly session?: HbsSession<unknown>; readonly error?: string;readonly submissionBlocked?:string;readonly settling?:boolean;readonly unknownRequestId?:string }
interface Owner {
  state: OwnerState;
  readonly listeners: Set<() => void>;
  readonly consumers: Set<(resource: StructuredResource) => void>;
  readonly subscribe: (listener: () => void) => () => void;
  readonly snapshot: () => OwnerState;
  readonly ready: Promise<void>;
  readonly history:PortraitEditHistory;
  readonly nativeHistory:NativeHistoryPort;
  sync(): Promise<void>;
  settle(): Promise<void>;
  resume():void;
  suspend():void;
  references: number;
  closed: boolean;
  unsubscribe?: () => void;
}
const owners = new WeakMap<AppHbsDocumentGateway, Map<string, Owner>>();
function failure(code: string, reason: unknown): string {
  const detail = reason instanceof Error ? reason.message : String(reason);
  return `${code}：${detail}`;
}
/** A resource keeps one HBS owner across its reader/library consumers. Revisions
 * are incoming authority, never a reason to discard and reconstruct H. */
function ownerFor(raw: AppHbsDocumentGateway, resource: StructuredResource, gateway: StructuredResourceGateway): Owner {
  let resources = owners.get(raw);
  if (!resources) { resources = new Map(); owners.set(raw, resources); }
  const previous = resources.get(resource.id);
  if (previous && !previous.closed) return previous;
  const adapter = createStructuredDocumentAdapter(directTextDiff);
  const listeners = new Set<() => void>(), consumers = new Set<(resource: StructuredResource) => void>();
  let state: OwnerState = {}, newestRevision = resource.revision,newestResource=resource, unsettled:DocumentCommit<unknown>|undefined;
  if(raw===getHbsDocumentGateway()){
    try{
      unsettled=getPendingHbsDocumentCommit("structured",resource.id);
      if(unsettled)state={submissionBlocked:`MODEL_REQUEST_UNSETTLED：请求 ${unsettled.id} 的结果尚未核对；当前输入继续保全，请先核对原请求。`};
    }catch(reason){state={submissionBlocked:failure("MODEL_RECOVERY_INVALID",reason),error:failure("MODEL_RECOVERY_INVALID",reason)};}
  }
  const update = (next: OwnerState): void => { state = next; listeners.forEach(listener => listener()); };
  const publishResource = async (): Promise<void> => {
    try {
      const current = await gateway.get(resource.id);
      if (owner.closed || current.id !== resource.id || current.revision < newestRevision) return;
      if(current.revision===newestRevision&&JSON.stringify(current)===JSON.stringify(newestResource))return;
      newestRevision = current.revision;
      newestResource=current;
      consumers.forEach(consume => consume(current));
    } catch (reason) {
      // Metadata refresh cannot turn a successfully committed HBS receipt into
      // an unknown write. Keep the receipt and report this independent failure.
      if (!owner.closed) update({ ...state, error: failure("MODEL_RESOURCE_REFRESH_FAILED", reason) });
    }
  };
  const authority = createDocumentPort(adapter, async (operation, value) => {
    const result = operation === "read" ? await raw.read("structured", resource.id)
      : await raw.commit("structured", resource.id, value as DocumentCommit<unknown>);
    await publishResource();
    return result;
  });
  const clearUnknown=(id:string):void=>{
    if(state.unknownRequestId!==id)return;
    const {unknownRequestId:_,...current}=state;update(current);
  };
  const port:DocumentPort<unknown>={read:authority.read,commit:async request=>{
    try{
      const receipt=await authority.commit(request);
      if(receipt.version!==request.expectedVersion+1)throw new Error("MODEL_PROTOCOL_ERROR：回执修订号不匹配。");
      clearUnknown(request.id);return receipt;
    }catch(reason){
      if(reason instanceof DocumentVersionConflict)clearUnknown(request.id);
      else if(!owner.closed)update({...state,unknownRequestId:request.id});
      throw reason;
    }
  }};
  const preservation = createDocumentPreservationPort(adapter, (operation, value) => operation === "readPreservation"
    ? raw.readPreservation("structured", resource.id) : raw.savePreservation("structured", resource.id, value));
  const clientId = crypto.randomUUID();
  let opening=Promise.resolve(),subscription=0,listening=false;
  let currentNative:StructuredNativeHistoryAction|undefined;
  const nativeBindings=new Set<StructuredNativeHistoryAction>();
  const nativeHistory:NativeHistoryPort={
    actions:{undo:()=>currentNative?.undo()??false,redo:()=>currentNative?.redo()??false},
    bind:actions=>{nativeBindings.add(actions);currentNative=actions;return()=>{
      nativeBindings.delete(actions);if(currentNative===actions)currentNative=[...nativeBindings].at(-1);
    };},
    activate:actions=>{currentNative=actions;},clear:()=>{currentNative=undefined;nativeBindings.clear();},
  };
  const owner: Owner = {
    get state() { return state; }, listeners, consumers, references: 0, closed: false,
    subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    snapshot: () => state,
    get ready() { return opening; },
    history:new PortraitEditHistory(),nativeHistory,
    sync: async () => {
      await owner.ready;if(owner.closed||!state.session)return;
      if(state.submissionBlocked){
        try{state.session.receive(await port.read(),true,false);}
        catch(reason){update({...state,error:failure("MODEL_SYNC_FAILED",reason)});}
      }else await state.session.syncLatest();
    },
    settle:async()=>{
      await owner.ready;if(owner.closed||!unsettled||state.settling)return;
      update({...state,settling:true});
      try{
        try{await port.commit(unsettled);}catch(reason){if(!(reason instanceof DocumentVersionConflict))throw reason;}
        unsettled=undefined;
        const {submissionBlocked:_,settling:__,error:___,...current}=state;update(current);
        await state.session?.syncLatest();
      }catch(reason){update({...state,settling:false,error:failure("MODEL_RETRY_FAILED",reason)});}
    },
    resume:()=>{
      if(owner.closed||owner.references<1||listening||!gateway.subscribeChanges)return;
      listening=true;const generation=++subscription;
      void gateway.subscribeChanges(change=>{
        if(!owner.closed&&owner.references>0&&generation===subscription&&change.resourceId===resource.id)void owner.sync();
      }).then(stop=>{
        if(owner.closed||owner.references<1||generation!==subscription)stop();else owner.unsubscribe=stop;
      }).catch(reason=>{if(!owner.closed&&generation===subscription){listening=false;update({...state,error:failure("MODEL_SUBSCRIPTION_FAILED",reason)});}});
    },
    suspend:()=>{subscription++;listening=false;owner.unsubscribe?.();delete owner.unsubscribe;},
  };
  // The owner is registered before opening so a second host shares the exact
  // session, including an in-flight request and its persistent preservation.
  resources.set(resource.id, owner);
  opening=(async () => {
    try {
      const session = await HbsSession.open({ adapter, port, preservation, requestId: sequence => `${clientId}:${sequence}` });
      if (owner.closed) { session.dispose(); return; }
      update({ ...state, session });
      owner.resume();
    } catch (reason) {
      if (!owner.closed) update({ ...state, error: failure("MODEL_OPEN_FAILED", reason) });
    }
  })();
  return owner;
}
export function useStructuredHbsSession(resource: StructuredResource, gateway: StructuredResourceGateway,
  onChanged: (resource: StructuredResource) => void, raw = getHbsDocumentGateway()): OwnerState & { readonly sync: () => Promise<void>;readonly settle:()=>Promise<void>;readonly history:PortraitEditHistory;readonly nativeHistory:NativeHistoryPort } {
  const live = useRef({ resource, onChanged }); live.current = { resource, onChanged };
  const holder = useRef<{ readonly raw: AppHbsDocumentGateway; readonly id: string; readonly owner: Owner } | undefined>(undefined);
  if (!holder.current || holder.current.raw !== raw || holder.current.id !== resource.id) {
    holder.current = { raw, id: resource.id, owner: ownerFor(raw, resource, gateway) };
  }
  const owner = holder.current.owner;
  const state = useSyncExternalStore(owner.subscribe, owner.snapshot);
  useEffect(() => {
    const reopened=!!owner.state.session;
    owner.references++;
    owner.resume();if(reopened)void owner.sync();
    const consume = (current: StructuredResource): void => {
      if (live.current.resource.id === current.id && current.revision >= live.current.resource.revision) live.current.onChanged(current);
    };
    owner.consumers.add(consume);
    return () => {
      owner.consumers.delete(consume); owner.references--;
      // View ownership is shorter than resource ownership. Native history and
      // H survive reader/library handoff; idle resources do not monitor S.
      if(owner.references<1)owner.suspend();
    };
  }, [owner]);
  useEffect(() => {
    if (state.session && resource.revision > state.session.getSnapshot().observed.version) void owner.sync();
  }, [owner, state.session, resource.revision]);
  return { ...state, sync: owner.sync,settle:owner.settle,history:owner.history,nativeHistory:owner.nativeHistory };
}

/** Runtime/gateway teardown is the explicit end of resource ownership. */
export async function disposeStructuredHbsSessions(raw=getHbsDocumentGateway()):Promise<void>{
  const resources=owners.get(raw);if(!resources)return;
  owners.delete(raw);
  await Promise.all([...resources.values()].map(async owner=>{
    owner.closed=true;owner.suspend();owner.consumers.clear();owner.listeners.clear();owner.history.clear();owner.nativeHistory.clear();
    await owner.ready;await owner.state.session?.flushPreservation();owner.state.session?.dispose();
  }));
  resources.clear();
}
