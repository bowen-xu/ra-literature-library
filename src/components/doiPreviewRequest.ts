import type { MetadataPreview } from "@research-assistant/core/literature";
import type { LiteratureGateway } from "../services/literatureGateway";

// Two sequential HTTP requests can each take 20 seconds. Bound the whole UI
// wait too, including the platform bridge, without pretending IPC is abortable.
const DOI_PREVIEW_TIMEOUT_MS = 50_000;

/** One editor owns one lookup. Abandoned responses must never reopen it. */
export class DoiPreviewRequest {
  private pending: { readonly cancel: () => void } | undefined;

  constructor(
    private readonly gateway: Pick<LiteratureGateway, "previewDoi" | "rejectMetadataCandidate">,
    private readonly onBusy: (busy: boolean) => void,
    private readonly onCleanupError: (message: string) => void,
  ) {}

  get isLoading(): boolean { return this.pending !== undefined; }

  cancel(): void { this.pending?.cancel(); }

  load(doi: string, itemId?: string): Promise<MetadataPreview | undefined> {
    if (this.pending) return Promise.resolve(undefined);
    return new Promise((resolve, reject) => {
      const finish = (): boolean => {
        if (this.pending !== request) return false;
        clearTimeout(timer);
        this.pending = undefined;
        this.onBusy(false);
        return true;
      };
      const request = { cancel: () => { if (finish()) resolve(undefined); } };
      const timer = setTimeout(() => {
        if (finish()) reject(new Error("DOI_LOOKUP_TIMEOUT：获取 DOI 元数据超过 50 秒，请重试"));
      }, DOI_PREVIEW_TIMEOUT_MS);
      this.pending = request;
      this.onBusy(true);
      // Promise.resolve also catches an adapter that throws before returning a promise.
      void Promise.resolve().then(() => this.pending === request ? this.gateway.previewDoi(doi, itemId) : undefined).then(async preview => {
        if (preview === undefined) return;
        if (finish()) { resolve(preview); return; }
        // Native lookup may finish after cancellation/timeout. It only creates
        // a candidate, so reject that candidate rather than importing anything.
        try { await this.gateway.rejectMetadataCandidate(preview.id); }
        catch (reason: unknown) {
          this.onCleanupError(`DOI_CANDIDATE_CLEANUP_FAILED · ${preview.id} · ${preview.importJobId}：${reason instanceof Error ? reason.message : String(reason)}`);
        }
      }, (reason: unknown) => { if (finish()) reject(reason); });
    });
  }
}
