import { Redo2, Undo2 } from "lucide-react";
import { useImperativeHandle, type Ref } from "react";
import type {
  PaperPortraitCandidateV1, PortraitCatalog, PortraitTagCatalog, PortraitTagDimension,
} from "@research-assistant/core/ai";
import type { StructuredResource } from "@research-assistant/core/structured-resources";
import type { StructuredResourceGateway } from "@research-assistant/workbench-sdk/structured-resources";
import { PaperPortraitDimensions } from "../PaperPortraitDimensions";
import { ControlHint } from "@research-assistant/workbench-sdk/overlay";
import { useStructuredResourceHistory } from "./useStructuredResourceHistory";

export interface StructuredPortraitEditorHandle {
  save(draft:PaperPortraitCandidateV1):Promise<boolean>;
}
export function StructuredPortraitEditor({resource, catalog, gateway, onChanged, onSaveTags, disabled=false, editRef}: {
  readonly resource: StructuredResource;
  readonly catalog: PortraitCatalog;
  readonly gateway: StructuredResourceGateway;
  readonly onChanged: (value: StructuredResource) => void;
  readonly disabled?: boolean;
  readonly editRef?: Ref<StructuredPortraitEditorHandle>;
  readonly onSaveTags: (dimension: PortraitTagDimension, tags: NonNullable<PortraitTagCatalog[PortraitTagDimension]>) => boolean;
}) {
  const history=useStructuredResourceHistory(resource,gateway,onChanged);

  useImperativeHandle(editRef,()=>({save}));
  async function save(draft:PaperPortraitCandidateV1): Promise<boolean> {
    if(disabled)return false;
    return history.perform(async requestId=>{
      const result = await gateway.write({
        resourceId: resource.id, expectedRevision: resource.revision, requestId,
        content: JSON.stringify(draft, null, 2), editorKind: "human",
        ...(resource.draft&&!resource.draft.creatorConversationId?{expectedDraftRevision:resource.draft.revision}:{}),
      });
      if(result.status!=="applied"){
        onChanged(result.resource);
        throw new Error(result.errors.map(issue=>issue.message).join("；")||"修改尚未应用，草稿已保留。");
      }
      return result.resource;
    });
  }

  return (
    <section className="portrait-classification-group" aria-label="编辑当前画像分类" aria-busy={history.busy} onKeyDown={event=>{
      const target=event.target;
      if(history.panelHistory)return;
      if(target instanceof HTMLElement&&target.closest('input,textarea,[contenteditable="true"]'))return;
      if(!(event.metaKey||event.ctrlKey)||event.altKey)return;
      const key=event.key.toLowerCase();
      if(key!=="z"&&!(event.ctrlKey&&key==="y"))return;
      event.preventDefault();event.stopPropagation();
      if(disabled)return;
      if(key==="y"||event.shiftKey)void history.redo();else void history.undo();
    }}>
      {!history.panelHistory&&<div className="portrait-classification-history" role="toolbar" aria-label="画像分类撤销重做">
        <ControlHint content="撤销画像分类修改" shortcut="Cmd/Ctrl+Z"><button type="button" className="portrait-icon-action" aria-label="撤销画像分类修改" disabled={disabled||history.busy||!history.canUndo} onClick={()=>void history.undo()}><Undo2 size={16}/></button></ControlHint>
        <ControlHint content="重做画像分类修改" shortcut="Cmd/Ctrl+Shift+Z"><button type="button" className="portrait-icon-action" aria-label="重做画像分类修改" disabled={disabled||history.busy||!history.canRedo} onClick={()=>void history.redo()}><Redo2 size={16}/></button></ControlHint>
      </div>}
      <PaperPortraitDimensions
        portrait={resource.content as PaperPortraitCandidateV1} catalog={catalog} disabled={disabled||history.busy} catalogDisabled={disabled||history.busy}
        onChange={value=>void save(value)} onSaveTags={onSaveTags}
      />
    </section>
  );
}
