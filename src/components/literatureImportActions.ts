import { hasPlatformCapabilities } from "@research-assistant/workbench-sdk/environment";
import type { Dispatch, SetStateAction } from "react";
import { open } from "@research-assistant/workbench-sdk/platform";
import type {
  ImportJob,
  LiteratureDraft,
  LiteratureItem,
  MetadataPreview,
  PdfImportCandidate,
} from "@research-assistant/core/literature";

import type { LiteratureGateway } from "../services/literatureGateway";
import type { DoiPreviewRequest } from "./doiPreviewRequest";
import {
  applyLiteratureCreatorInput,
  createLiteratureCreatorInput,
  type LiteratureCreatorInput,
} from "./literatureCreatorInput";
import {
  candidateFromPdfPath,
  candidateFromRawInput,
  type ImportPanel,
  mergeMetadataCandidate,
  retryableImportResults,
  terminalImportStates,
} from "./literatureWorkspaceModel";

interface BibtexPreview {
  readonly drafts: readonly LiteratureDraft[];
  readonly error: string | undefined;
}

interface LiteratureImportContext {
  readonly gateway: LiteratureGateway;
  readonly doiRequest: DoiPreviewRequest;
  readonly selected: LiteratureItem | undefined;
  readonly query: string;
  readonly panel: ImportPanel;
  readonly bibtex: string;
  readonly bibtexPreview: BibtexPreview;
  readonly pdfCandidates: readonly PdfImportCandidate[];
  readonly pdfCreatorInputs: Readonly<Record<string, LiteratureCreatorInput>>;
  readonly doi: string;
  readonly manual: LiteratureDraft;
  readonly manualCreatorInput: LiteratureCreatorInput;
  readonly lastImportJob: ImportJob | undefined;
  readonly metadataPreview: MetadataPreview | undefined;
  readonly setPanel: Dispatch<SetStateAction<ImportPanel>>;
  readonly setBibtex: Dispatch<SetStateAction<string>>;
  readonly setPdfCandidates: Dispatch<SetStateAction<readonly PdfImportCandidate[]>>;
  readonly setPdfCreatorInputs: Dispatch<SetStateAction<Readonly<Record<string, LiteratureCreatorInput>>>>;
  readonly setDoi: Dispatch<SetStateAction<string>>;
  readonly setManual: Dispatch<SetStateAction<LiteratureDraft>>;
  readonly setManualCreatorInput: Dispatch<SetStateAction<LiteratureCreatorInput>>;
  readonly setLastImportJob: Dispatch<SetStateAction<ImportJob | undefined>>;
  readonly setMetadataPreview: Dispatch<SetStateAction<MetadataPreview | undefined>>;
  readonly setSelectedId: Dispatch<SetStateAction<string | undefined>>;
  readonly setError: Dispatch<SetStateAction<string | undefined>>;
  readonly setNotice: Dispatch<SetStateAction<string | undefined>>;
  readonly setWarning: Dispatch<SetStateAction<string | undefined>>;
  readonly refresh: (search?: string) => Promise<void>;
  readonly onImported: (itemId: string) => Promise<void>;
}

export function createLiteratureImportActions(context: LiteratureImportContext) {
  async function finishImportJob(job: ImportJob): Promise<void> {
    if (!terminalImportStates.has(job.state)) return;
    const imported = job.results.find(result => result.state === "imported" && result.itemId);
    if (imported?.itemId !== undefined) await context.onImported(imported.itemId);
    else await context.refresh();
  }

  function setPdfReviewCandidates(candidates: readonly PdfImportCandidate[]): void {
    context.setPdfCandidates(candidates);
    context.setPdfCreatorInputs(Object.fromEntries(candidates.map((candidate) => [
      candidate.path,
      createLiteratureCreatorInput(candidate.draft.creators),
    ])));
  }

  function setManualDraftForEditing(draft: LiteratureDraft): void {
    context.setManual(draft);
    context.setManualCreatorInput(createLiteratureCreatorInput(draft.creators));
  }

  function resetManualDraft(): void {
    setManualDraftForEditing({
      itemType: "document", title: "", abstractText: "", containerTitle: "", volume: "",
      conferenceName: "", proceedingsTitle: "", place: "",
      issue: "", pages: "", doi: "", url: "", language: "", bibtexKey: "",
      creators: [], tags: [],
    });
  }

  function reviewPdfPaths(paths: readonly string[]): void {
    const pdfPaths = [...new Set(paths.filter((path) => path.toLocaleLowerCase().endsWith(".pdf")))];
    if (pdfPaths.length === 0) {
      context.setWarning("仅支持 PDF 文件，请重新选择。");
      return;
    }
    context.setError(undefined);
    setPdfReviewCandidates(pdfPaths.map(candidateFromPdfPath));
    context.setPanel("pdf");
    context.setNotice(`已读取 ${pdfPaths.length} 个 PDF 路径；请检查标题后再入库`);
  }

  async function choosePdfs(): Promise<void> {
    context.setError(undefined);
    if (!hasPlatformCapabilities()) {
      context.setError("浏览器预览模式不能读取本机文件；请在桌面模式中导入 PDF。");
      return;
    }
    const paths = await open({ multiple: true, filters: [{ name: "PDF", extensions: ["pdf"] }] });
    if (paths === null) return;
    const selectedPaths = Array.isArray(paths) ? paths : [paths];
    if (selectedPaths.length === 0) return;
    reviewPdfPaths(selectedPaths);
  }

  async function importPdfs(): Promise<void> {
    if (context.pdfCandidates.some((candidate) => candidate.draft.title.trim().length === 0)) {
      throw new Error("每个 PDF 都需要确认标题后才能导入");
    }
    const candidates = context.pdfCandidates.map((candidate) => ({
      ...candidate,
      draft: applyLiteratureCreatorInput(
        candidate.draft,
        context.pdfCreatorInputs[candidate.path]
          ?? createLiteratureCreatorInput(candidate.draft.creators),
      ),
    }));
    const job = await context.gateway.importPdfs(candidates);
    context.setLastImportJob(job);
    context.setPdfCandidates([]);
    context.setPdfCreatorInputs({});
    context.setPanel(undefined);
    await finishImportJob(job);
  }

  async function attachPdf(): Promise<void> {
    if (context.selected === undefined) return;
    if (!hasPlatformCapabilities()) {
      context.setError("请在桌面模式中为文献添加 PDF 附件。");
      return;
    }
    const path = await open({ multiple: false, filters: [{ name: "PDF", extensions: ["pdf"] }] });
    if (path === null || Array.isArray(path)) return;
    await context.gateway.attachPdf(context.selected.id, path);
    context.setNotice("PDF 已复制到不可变的本地内容存储并关联到此文献");
    await context.refresh(context.query);
    context.setSelectedId(context.selected.id);
  }

  async function importBibtex(): Promise<void> {
    if (context.bibtexPreview.error !== undefined) throw new Error(context.bibtexPreview.error);
    if (context.bibtexPreview.drafts.length === 0) throw new Error("没有识别到 BibTeX 条目");
    const job = await context.gateway.importBibtex(context.bibtexPreview.drafts);
    context.setLastImportJob(job);
    context.setBibtex("");
    context.setPanel(undefined);
    await finishImportJob(job);
  }

  async function retryFailedImport(): Promise<void> {
    if (context.lastImportJob === undefined) return;
    const retryable = retryableImportResults(context.lastImportJob);
    if (retryable.length === 0) return;
    if (context.lastImportJob.sourceKind === "pdf") {
      setPdfReviewCandidates(retryable.map((result) => candidateFromRawInput(result.rawInput)));
      context.setPanel("pdf");
      context.setNotice(`已恢复 ${retryable.length} 个 PDF 的原始候选；请确认后重试`);
      return;
    }
    if (context.lastImportJob.sourceKind === "bibtex") {
      const drafts = retryable.map((result) => JSON.parse(result.rawInput) as LiteratureDraft);
      const job = await context.gateway.importBibtex(drafts);
      context.setLastImportJob(job);
      context.setNotice(`已重试 ${drafts.length} 条 BibTeX 输入`);
      await finishImportJob(job);
      return;
    }
    if (context.lastImportJob.sourceKind === "doi") {
      await importByDoi(retryable[0]?.rawInput ?? "");
    }
  }

  async function cancelImport(): Promise<void> {
    if (context.lastImportJob === undefined) return;
    await context.gateway.cancelImportJob(context.lastImportJob.id);
    context.setLastImportJob(await context.gateway.getImportJob(context.lastImportJob.id));
    context.setNotice("已请求取消；当前文件处理结束后停止剩余项目");
  }

  async function importByDoi(input = context.doi): Promise<void> {
    const preview = await context.doiRequest.load(input);
    if (preview === undefined) return;
    context.setMetadataPreview(preview);
    setManualDraftForEditing(preview.draft);
    context.setDoi("");
    context.setPanel("manual");
    context.setNotice("已获取 DOI 元数据，请确认后添加到文献库");
    for (const warning of preview.warnings ?? []) context.setWarning(warning);
  }

  async function saveManual(): Promise<void> {
    const finalized = applyLiteratureCreatorInput(context.manual, context.manualCreatorInput);
    if (finalized.title.trim().length === 0) throw new Error("请输入标题后再添加到文献库");
    const item = context.metadataPreview === undefined
      ? await context.gateway.save({ ...finalized, sourceKind: "user" })
      : await context.gateway.applyMetadataCandidate(context.metadataPreview.id, finalized);
    context.setNotice(`已保存：${item.title}`);
    resetManualDraft();
    context.setMetadataPreview(undefined);
    context.setPanel(undefined);
    if (context.metadataPreview?.itemId !== undefined) {
      await context.refresh(context.query);
      context.setSelectedId(item.id);
    } else await context.onImported(item.id);
    if (context.metadataPreview !== undefined) await refreshMetadataJob(context.metadataPreview.importJobId);
  }

  async function refreshMetadataJob(jobId: string): Promise<void> {
    try { context.setLastImportJob(await context.gateway.getImportJob(jobId)); }
    catch (reason: unknown) {
      context.setWarning(`DOI_JOB_STATUS_FAILED · ${jobId}：操作已完成，但无法刷新导入状态；${reason instanceof Error ? reason.message : String(reason)}`);
    }
  }

  async function cancelPanel(): Promise<void> {
    context.doiRequest.cancel();
    if (context.metadataPreview !== undefined) {
      const jobId = context.metadataPreview.importJobId;
      await context.gateway.rejectMetadataCandidate(context.metadataPreview.id);
      context.setMetadataPreview(undefined);
      resetManualDraft();
      await refreshMetadataJob(jobId);
    }
    if (context.panel === "pdf") {
      context.setPdfCandidates([]);
      context.setPdfCreatorInputs({});
    }
    if (context.panel === "manual") resetManualDraft();
    context.setPanel(undefined);
  }

  async function refreshMetadata(): Promise<void> {
    if (context.selected === undefined || context.selected.doi.trim().length === 0) return;
    const preview = await context.doiRequest.load(context.selected.doi, context.selected.id);
    if (preview === undefined) return;
    context.setMetadataPreview(preview);
    setManualDraftForEditing(mergeMetadataCandidate(context.selected, preview.draft));
    context.setPanel("manual");
    context.setNotice(`已获取字段差异；${preview.diffs.filter((diff) => diff.userConfirmed).length} 个用户确认字段不会自动覆盖`);
  }

  return {
    attachPdf,
    cancelImport,
    cancelPanel,
    choosePdfs,
    finishImportJob,
    importBibtex,
    importByDoi,
    importPdfs,
    refreshMetadata,
    resetManualDraft,
    retryFailedImport,
    reviewPdfPaths,
    saveManual,
    setManualDraftForEditing,
  };
}
