import type { PaperAnalysisWorkflow } from "@research-assistant/core/ai";
import type { AiAssistanceGateway } from "@research-assistant/workbench-sdk/ai-assistance";
import { publishPaperReadingChanged } from "./readingPanelEvents";

type Phase = "idle" | "preparing" | "parsing" | "rendering" | "extracting" | "unknown";
interface Activity {
  readonly phase: Phase;
  readonly requestId?: string;
  readonly cancelRequested: boolean;
  readonly error?: string;
}
const idle: Activity = { phase: "idle", cancelRequested: false };

/** One owner per gateway/paper, shared by both production reading rails.
 * Active work survives panel unmounts; model/provider lifecycle stays native. */
class PaperAnalysisActivity {
  private snapshot: Activity = idle;
  private readonly listeners = new Set<() => void>();
  private remote = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private remoteRead = false;
  constructor(private readonly gateway: AiAssistanceGateway, private readonly paperId: string) {}
  readonly getSnapshot = (): Activity => this.snapshot;
  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    this.scheduleRemoteRead();
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0 && this.timer !== undefined) {
        clearTimeout(this.timer); this.timer = undefined;
      }
    };
  };
  begin(): string | undefined {
    if (this.snapshot.phase !== "idle") return undefined;
    const requestId = crypto.randomUUID();
    this.remote = false;
    this.set({ phase: "preparing", requestId, cancelRequested: false });
    return requestId;
  }
  phase(requestId: string, phase: Phase): void {
    if (this.snapshot.requestId === requestId && this.snapshot.phase !== "unknown") this.set({ ...this.snapshot, phase });
  }
  unknown(requestId: string, error: string): void {
    if (this.snapshot.requestId !== requestId) return;
    this.remote = false;
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
    this.set({ phase: "unknown", requestId, cancelRequested: false, error });
  }
  isCanceled(requestId: string): boolean {
    return this.snapshot.requestId !== requestId || this.snapshot.cancelRequested;
  }
  finish(requestId: string): void {
    if (this.snapshot.requestId !== requestId || this.snapshot.phase === "unknown") return;
    this.remote = false;
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
    this.set(idle);
  }
  adopt(workflow: PaperAnalysisWorkflow | undefined): void {
    if (workflow?.paperId !== this.paperId || this.snapshot.phase !== "idle"
      || workflow.activeClientRequestId === undefined) return;
    this.remote = true;
    this.set({ requestId: workflow.activeClientRequestId, cancelRequested: false,
      phase: workflow.status === "preparing" ? "preparing" : "extracting" });
    this.scheduleRemoteRead();
  }
  async cancel(): Promise<boolean | undefined> {
    const requestId = this.snapshot.requestId;
    if (requestId === undefined || this.snapshot.cancelRequested || this.snapshot.phase === "unknown") return undefined;
    this.set({ ...this.snapshot, cancelRequested: true });
    try { return await this.gateway.cancelPaperAnalysis(requestId); }
    catch (reason) {
      const current = this.getSnapshot();
      if (current.requestId === requestId && current.phase !== "unknown") this.set({ ...current, cancelRequested: false });
      throw reason;
    }
  }
  private set(value: Activity): void {
    this.snapshot = value;
    this.listeners.forEach(listener => listener());
  }
  private scheduleRemoteRead(): void {
    if (!this.remote || this.timer !== undefined || this.remoteRead || this.listeners.size === 0) return;
    this.timer = setTimeout(() => { this.timer = undefined; void this.refreshRemote(); }, 1000);
  }
  private async refreshRemote(): Promise<void> {
    const requestId = this.snapshot.requestId;
    if (!this.remote || requestId === undefined) return;
    this.remoteRead = true;
    try {
      const workflow = await this.gateway.getLatestPaperAnalysisWorkflow(this.paperId);
      if (!this.remote || this.snapshot.requestId !== requestId) return;
      if (workflow?.activeClientRequestId === undefined) {
        this.finish(requestId);
        publishPaperReadingChanged(this.paperId, "paper-analysis-activity");
      } else if (workflow.activeClientRequestId !== requestId) {
        this.finish(requestId); this.adopt(workflow);
      }
    } catch {
      // An unknown read outcome never marks running work as finished or restarts it.
    } finally {
      this.remoteRead = false;
      this.scheduleRemoteRead();
    }
  }
}

const owners = new WeakMap<AiAssistanceGateway, Map<string, PaperAnalysisActivity>>();
export function getPaperAnalysisActivity(gateway: AiAssistanceGateway, paperId: string): PaperAnalysisActivity {
  let papers = owners.get(gateway);
  if (papers === undefined) { papers = new Map(); owners.set(gateway, papers); }
  let owner = papers.get(paperId);
  if (owner === undefined) { owner = new PaperAnalysisActivity(gateway, paperId); papers.set(paperId, owner); }
  return owner;
}
