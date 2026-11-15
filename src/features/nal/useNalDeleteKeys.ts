import { useRef,type KeyboardEvent } from "react";
import { notify } from "@research-assistant/workbench-sdk/feedback";
import { confirm } from "@research-assistant/workbench-sdk/platform";
/** A query is a view: Delete acts on selected papers, never on inferred facts. */
export function useNalDeleteKeys(options:{readonly enabled:boolean;readonly busy:boolean;readonly selectedIds:ReadonlySet<string>;readonly visibleItemIds:readonly string[];readonly onTrash:(ids:readonly string[])=>Promise<void>}){
  const locked=useRef(false);
  return (event:KeyboardEvent<HTMLDivElement>)=>{
    const mac=/Mac|iPhone|iPad|iPod/.test(navigator.platform);
    if(event.key !== "Delete" && !(mac && event.key === "Backspace"))return;
    if(event.defaultPrevented || event.nativeEvent.isComposing || event.altKey)return;
    if(!(event.target instanceof HTMLElement) || !event.target.closest(".literature-row") || event.target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"])'))return;
    event.preventDefault();if(event.repeat || locked.current || !options.enabled || options.busy)return;
    const ids=options.visibleItemIds.filter(id=>options.selectedIds.has(id));if(!ids.length)return;
    locked.current=true;
    void (async()=>{
      try {
        if(!await confirm(`将 ${ids.length} 篇文献移入回收站？关系、PDF 和笔记保留，14 天内可恢复。`))return;
        await options.onTrash(ids);
      } catch(e){notify.error(e instanceof Error ? e.message : "文献删除失败");}
      finally{locked.current=false;}
    })();
  };
}
