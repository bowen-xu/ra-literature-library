import {resolveNalRuntimeGateway} from "@research-assistant/workbench-sdk/literature-runtime";
import {runtimeNalGateway} from "./configureLiteratureServices";
import {isDesktopRuntime} from "@research-assistant/workbench-sdk/environment";
import {validateNalAnnotationRequest} from "./transportValidation";
import { type NalAnnotation } from "@research-assistant/core/nal";
import { ensureBrowserAnnotationNote } from "@research-assistant/workbench-sdk/annotation-notes";
import type { NalGateway } from "@research-assistant/data/nal";
import { NAL_STORAGE_KEY,readBrowserNal,mutateBrowserNal } from "./browserNalStorage";
import { getAppStorage } from "@research-assistant/workbench-sdk/storage";
const pending = new WeakMap<Storage,Promise<unknown>>();
async function exclusive<T>(operation:()=>Promise<T>): Promise<T> {
  if (navigator.locks) return await navigator.locks.request(NAL_STORAGE_KEY,operation);
  const storage=getAppStorage(),previous=pending.get(storage) ?? Promise.resolve();
  const next=previous.catch(()=>{}).then(operation);pending.set(storage,next);
  try{return await next;}finally{if(pending.get(storage) === next)pending.delete(storage);}
}

export function createNalGateway(native: NalGateway): NalGateway {
  return {
  async read(){return isDesktopRuntime() ? await native.read() : exclusive(readBrowserNal);},
  async mutate(mutation,expectedRevision){return isDesktopRuntime() ? await native.mutate(mutation,expectedRevision) : exclusive(()=>mutateBrowserNal(mutation,expectedRevision));},
  async ensureAnnotation(request){
    validateNalAnnotationRequest(request);
    if(isDesktopRuntime())return native.ensureAnnotation(request);
    return exclusive(async()=>{
      const state=await readBrowserNal();
      const existing=state.annotations.find(a=>a.targetKind===request.targetKind && a.targetId===request.targetId);
      if(existing)return existing;
      if(!(request.targetKind==="concept" ? state.concepts : state.statements).some(v=>v.id===request.targetId))throw new Error("笔记目标已不存在");
      const page=await ensureBrowserAnnotationNote([request.targetKind,request.targetId],request.title);
      const annotation:NalAnnotation={id:crypto.randomUUID(),targetKind:request.targetKind,targetId:request.targetId,notePageId:page.page.id};
      // The page is deliberately retained if persistence fails; retry reuses its ID.
      await mutateBrowserNal({kind:"link_annotation",annotation},state.revision);
      return annotation;
    });
  },
  };
}

const gateway = createNalGateway({read: () => selectedNative().read(), mutate: (mutation, revision) => selectedNative().mutate(mutation, revision), ensureAnnotation: request => selectedNative().ensureAnnotation(request)});
function selectedNative(): NalGateway {
  const selected = resolveNalRuntimeGateway(gateway);
  if (selected === gateway) throw Object.assign(new Error("literature_gateway_unavailable：领域 native 适配尚未接入。"), {code: "literature_gateway_unavailable"});
  return selected;
}
export function getNalGateway(): NalGateway {return runtimeNalGateway() ?? resolveNalRuntimeGateway(gateway);}
