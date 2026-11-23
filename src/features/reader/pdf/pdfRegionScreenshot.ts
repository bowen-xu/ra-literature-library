import {
  GlobalWorkerOptions,
  getDocument,
} from "pdfjs-dist/legacy/build/pdf.mjs";
import workerUrl from "pdfjs-dist/legacy/build/pdf.worker.mjs?url";
import type { SourceRect } from "@research-assistant/core/literature";

GlobalWorkerOptions.workerSrc = workerUrl;

export async function renderPdfRegionPng(
  bytes: Uint8Array,
  pageIndex: number,
  rect: SourceRect,
): Promise<string> {
  const loadingTask = getDocument({ data: bytes.slice().buffer });
  const document = await loadingTask.promise;
  try {
    const page = await document.getPage(pageIndex + 1);
    try {
      const viewport = page.getViewport({ scale: 2 });
      const pageCanvas = globalThis.document.createElement("canvas");
      const pageContext = pageCanvas.getContext("2d");
      if (pageContext === null) throw new Error("当前环境无法创建 PDF 截图画布");
      pageCanvas.width = Math.ceil(viewport.width);
      pageCanvas.height = Math.ceil(viewport.height);
      await page.render({ canvas: pageCanvas, canvasContext: pageContext, viewport }).promise;

      const x = Math.max(0, Math.floor(rect.x * pageCanvas.width));
      const y = Math.max(0, Math.floor(rect.y * pageCanvas.height));
      const width = Math.min(pageCanvas.width - x, Math.ceil(rect.width * pageCanvas.width));
      const height = Math.min(pageCanvas.height - y, Math.ceil(rect.height * pageCanvas.height));
      if (width <= 0 || height <= 0) throw new Error("结构化图片区域为空，无法截图");

      const cropCanvas = globalThis.document.createElement("canvas");
      const cropContext = cropCanvas.getContext("2d");
      if (cropContext === null) throw new Error("当前环境无法创建 PDF 截图画布");
      cropCanvas.width = width;
      cropCanvas.height = height;
      cropContext.drawImage(pageCanvas, x, y, width, height, 0, 0, width, height);
      return cropCanvas.toDataURL("image/png");
    } finally {
      page.cleanup();
    }
  } finally {
    await loadingTask.destroy();
  }
}
