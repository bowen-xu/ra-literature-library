const TRASH_RETENTION_DAYS = 14;

export function formatLiteratureTrashConfirmation(title: string): string {
  return `将“${title}”移入回收站？\n\nPDF、批注、笔记和项目关联会完整保留，可在 14 天内恢复。超过 14 天后将自动永久清理。`;
}

export function trashRetentionLabel(trashedAt: string | undefined, now = Date.now()): string {
  if (trashedAt === undefined) return "将在 14 天后自动清理";
  const elapsedDays = Math.max(0, (now - Date.parse(trashedAt)) / (24 * 60 * 60 * 1000));
  const remainingDays = Math.max(0, Math.ceil(TRASH_RETENTION_DAYS - elapsedDays));
  return remainingDays === 0 ? "即将自动清理" : `还可保留 ${remainingDays} 天`;
}
