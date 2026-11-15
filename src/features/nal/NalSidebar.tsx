import { useState } from "react";
import { Network } from "lucide-react";
import { ControlHint } from "@research-assistant/workbench-sdk/overlay";
import { NalManagementPanel } from "./NalManagementPanel";
import { NalQueryDirectory } from "./NalQueryDirectory";
import { NalQueryControl } from "./NalQueryControl";
import type { NalAnnotationTarget } from "./NalStatements";
import type { NalController } from "./useNal";

export function NalSidebar({controller,onAnnotate}:{readonly controller:NalController;readonly onAnnotate:(target:NalAnnotationTarget)=>void}) {
  const [managing,setManaging]=useState(false);
  return <aside className="nal-sidebar" aria-label="文献概念与关系">
    <div className="nal-sidebar-heading"><header><strong>概念与关系</strong>
      <div className="nal-row-actions">
        <ControlHint content="管理概念与关系"><button type="button" aria-label="管理概念与关系" disabled={!controller.ready || controller.busy} onClick={()=>setManaging(true)}><Network size={16} aria-hidden="true"/></button></ControlHint>
        <NalQueryControl controller={controller}/>
      </div>
    </header></div>
    <NalQueryDirectory controller={controller}/>
    {!controller.ready && <p>关系尚未载入，请刷新重试。</p>}
    {managing && <NalManagementPanel controller={controller} onClose={()=>setManaging(false)} onAnnotate={onAnnotate}/>}
  </aside>;
}
