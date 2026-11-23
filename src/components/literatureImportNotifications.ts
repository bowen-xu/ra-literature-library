import type { ImportJob } from "@research-assistant/core/literature";

import { notify } from "@research-assistant/workbench-sdk/feedback";
import { retryableImportResults, terminalImportStates } from "./literatureWorkspaceModel";

interface ImportNotificationActions {
  readonly onCancel: () => void;
  readonly onRetry: () => void;
}

function sourceLabel(sourceKind: string): string {
  if (sourceKind === "pdf") return "PDF";
  if (sourceKind === "bibtex") return "BibTeX";
  if (sourceKind === "doi") return "DOI";
  return sourceKind.toUpperCase();
}

function failedResultDescription(job: ImportJob): string {
  const messages = job.results
    .filter((result) => result.state !== "imported")
    .slice(0, 3)
    .map((result) => result.errorMessage === undefined
      ? result.inputLabel
      : `${result.inputLabel}：${result.errorMessage}`);
  const remaining = job.results.filter((result) => result.state !== "imported").length - messages.length;
  return [
    `${sourceLabel(job.sourceKind)} · ${job.completedCount}/${job.totalCount}`,
    ...messages,
    remaining > 0 ? `另有 ${remaining} 项` : "",
  ].filter(Boolean).join("；");
}

export function showImportJobNotification(
  job: ImportJob,
  actions: ImportNotificationActions,
): string | number {
  const id = `literature-import:${job.id}`;
  if (job.sourceKind === "doi" && job.state === "queued") {
    return notify.info("DOI 元数据待确认", { id, description: "确认候选后才会添加到文献库" });
  }
  if (!terminalImportStates.has(job.state)) {
    return notify.loading(`正在导入 · ${job.completedCount}/${job.totalCount}`, {
      id,
      className: "import-toast",
      description: sourceLabel(job.sourceKind),
      ...(job.sourceKind === "pdf"
        ? { actions: [{ id: `cancel-import:${job.id}`, label: "取消", onClick: actions.onCancel }] }
        : {}),
    });
  }
  if (job.state === "completed") {
    return notify.success(`已导入 ${job.completedCount} 篇文献`, {
      id,
      className: "import-toast",
      description: sourceLabel(job.sourceKind),
    });
  }
  if (job.state === "cancelled") {
    return notify.info("导入已取消", {
      id,
      className: "import-toast",
      description: `${sourceLabel(job.sourceKind)} · ${job.completedCount}/${job.totalCount}`,
      duration: 6_000,
    });
  }

  const retryableCount = retryableImportResults(job).length;
  const options = {
    id,
    className: "import-toast",
    description: failedResultDescription(job),
    duration: Infinity,
    ...(retryableCount > 0
      ? { actions: [{ id: `retry-import:${job.id}`, label: `重试 ${retryableCount} 项`, onClick: actions.onRetry }] }
      : {}),
  };
  const title = `导入结束 · ${job.completedCount}/${job.totalCount}`;
  return job.state === "failed"
    ? notify.error(title, options)
    : notify.warning(title, options);
}
