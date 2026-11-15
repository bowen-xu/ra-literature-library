import { createContext, useContext, useState, useSyncExternalStore, type KeyboardEvent, type ReactNode } from "react";
import { Redo2, Undo2 } from "lucide-react";
import { ControlHint } from "@research-assistant/workbench-sdk/overlay";
import { notify } from "@research-assistant/workbench-sdk/feedback";
import { formatShortcut, isShortcutMac } from "@research-assistant/workbench-sdk/shortcuts";

interface Edit {
  readonly scope: string;
  readonly undo: () => boolean | Promise<boolean>;
  readonly redo: () => boolean | Promise<boolean>;
}

/** Orders panel edits; each resource still owns its persistence and conflict checks. */
export class PortraitEditHistory {
  private edits: Edit[] = [];
  private cursor = 0;
  private running = false;
  private locks = new Set<string>();
  private listeners = new Set<() => void>();
  private version = 0;
  readonly subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  readonly snapshot = () => this.version;
  get busy(): boolean { return this.running || this.locks.size > 0; }
  busyExcept(scope?: string): boolean { return this.running || [...this.locks].some(key => key !== scope); }
  get canUndo(): boolean { return !this.busy && this.cursor > 0; }
  get canRedo(): boolean { return !this.busy && this.cursor < this.edits.length; }
  private changed(): void { this.version++; this.listeners.forEach(listener => listener()); }
  record(edit: Edit): void {
    if (this.running) return;
    this.edits = [...this.edits.slice(0, this.cursor), edit];
    this.cursor = this.edits.length;
    this.changed();
  }
  clear(scope?: string): void {
    if (scope && !this.edits.some(edit => edit.scope === scope)) return;
    this.edits = []; this.cursor = 0; this.changed();
  }
  /** Invalidate one persistence owner's stale callbacks without discarding
   * independently rebased HBS/native edits from another owner. */
  clearScope(scope:string):void{
    if(!this.edits.some(edit=>edit.scope===scope))return;
    const before=this.edits.slice(0,this.cursor).filter(edit=>edit.scope!==scope).length;
    this.edits=this.edits.filter(edit=>edit.scope!==scope);this.cursor=before;this.changed();
  }
  lock(scope: string, locked: boolean): void {
    if (this.locks.has(scope) === locked) return;
    if (locked) this.locks.add(scope); else this.locks.delete(scope);
    this.changed();
  }
  async replay(direction: "undo" | "redo"): Promise<void> {
    if (direction === "undo" ? !this.canUndo : !this.canRedo) return;
    const edit = this.edits[direction === "undo" ? this.cursor - 1 : this.cursor];
    if (!edit) return;
    this.running = true; this.changed();
    try {
      if (await edit[direction]() && this.edits.includes(edit)) this.cursor += direction === "undo" ? -1 : 1;
    } catch (reason) {
      notify.error(reason instanceof Error ? reason.message : "无法恢复修改，当前内容已保留。");
    } finally { this.running = false; this.changed(); }
  }
}

const HistoryContext = createContext<PortraitEditHistory | null>(null);
export function PortraitHistoryProvider({ children, detached=false }: { readonly children: ReactNode; readonly detached?: boolean }) {
  const [history] = useState(() => new PortraitEditHistory());
  return <HistoryContext.Provider value={detached ? null : history}>{children}</HistoryContext.Provider>;
}
export function usePortraitEditHistory(): PortraitEditHistory | null {
  return useContext(HistoryContext);
}
export function usePortraitHistoryBusy(scope?: string): boolean {
  const history=usePortraitEditHistory();
  useSyncExternalStore(history?.subscribe ?? (() => () => {}), history?.snapshot ?? (() => 0));
  return history?.busyExcept(scope) ?? false;
}
export function PortraitHistoryControls({ disabled }: { readonly disabled: boolean }) {
  const history = usePortraitEditHistory();
  const mac = isShortcutMac();
  const binding = { key: "z", metaKey: mac, ctrlKey: !mac, altKey: false, shiftKey: false };
  useSyncExternalStore(history?.subscribe ?? (() => () => {}), history?.snapshot ?? (() => 0));
  return <div className="portrait-panel-history" role="toolbar" aria-label="画像与模板撤销重做">
    <ControlHint content="撤销画像与模板修改" shortcut={formatShortcut(binding)} wrap={disabled || !history?.canUndo} tooltipClassName="portrait-history-hint"><button type="button" className="portrait-icon-action"
      aria-label="撤销画像与模板修改" disabled={disabled || !history?.canUndo} onClick={() => void history?.replay("undo")}><Undo2 size={16}/></button></ControlHint>
    <ControlHint content="重做画像与模板修改" shortcut={formatShortcut({...binding,shiftKey:true})} wrap={disabled || !history?.canRedo} tooltipClassName="portrait-history-hint"><button type="button" className="portrait-icon-action"
      aria-label="重做画像与模板修改" disabled={disabled || !history?.canRedo} onClick={() => void history?.replay("redo")}><Redo2 size={16}/></button></ControlHint>
  </div>;
}
export function portraitHistoryKeyDown(event: KeyboardEvent, history: PortraitEditHistory | null, disabled: boolean): void {
  if (!history || event.defaultPrevented || event.nativeEvent.isComposing || !(event.metaKey || event.ctrlKey) || event.altKey ||
    !event.currentTarget.contains(event.target as Node) ||
    event.target instanceof Element && event.target.closest('input,textarea,[contenteditable="true"]')) return;
  const key = event.key.toLowerCase();
  if (key !== "z" && !(event.ctrlKey && key === "y")) return;
  event.preventDefault(); event.stopPropagation();
  if (!disabled) void history.replay(key === "y" || event.shiftKey ? "redo" : "undo");
}
