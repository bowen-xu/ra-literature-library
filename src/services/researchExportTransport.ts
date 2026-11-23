import type {ResearchExportErrorCode, ResearchExportGateway, ResearchExportReport, ResearchExportTransport} from "../public/contracts/researchExportGateway";
export type {ResearchExportErrorCode, ResearchExportGateway, ResearchExportReport} from "../public/contracts/researchExportGateway";

export class ResearchExportGatewayError extends Error {
  constructor(
    readonly code: ResearchExportErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "ResearchExportGatewayError";
  }
}

function safeCount(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

export function decodeResearchExportReport(value: unknown): ResearchExportReport | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const data = value as Record<string, unknown>;
  const folderName = data.folderName;
  const fileCount = safeCount(data.fileCount);
  const objectCount = safeCount(data.objectCount);
  const sourceCount = safeCount(data.sourceCount);
  if (typeof folderName !== "string" || folderName.trim().length === 0) return undefined;
  if (fileCount === undefined || objectCount === undefined || sourceCount === undefined) return undefined;
  if (Object.keys(data).some((key) => !["folderName", "fileCount", "objectCount", "sourceCount"].includes(key))) {
    return undefined;
  }
  return { folderName, fileCount, objectCount, sourceCount };
}

function exportError(reason: unknown): ResearchExportGatewayError {
  if (typeof reason === "object" && reason !== null) {
    const value = reason as { readonly code?: unknown; readonly message?: unknown };
    const knownCodes: readonly ResearchExportErrorCode[] = [
      "invalid_target", "destination_exists", "too_large", "busy", "operation_cancelled", "export_failed",
    ];
    const code = typeof value.code === "string" && knownCodes.includes(value.code as ResearchExportErrorCode)
      ? value.code as ResearchExportErrorCode
      : "export_failed";
    const message = typeof value.message === "string" && value.message.trim().length > 0
      ? value.message
      : "研究知识导出失败；原始资料未改变";
    return new ResearchExportGatewayError(code, message, {cause: reason});
  }
  return new ResearchExportGatewayError("export_failed", "研究知识导出失败；原始资料未改变");
}

export function createResearchExportGateway(transport: ResearchExportTransport): ResearchExportGateway {
  return {
    async exportAll(targetDirectory) {
      try {
        const value = await transport.exportAll(targetDirectory);
        const report = decodeResearchExportReport(value);
        if (report === undefined) throw new ResearchExportGatewayError(
          "export_failed",
          "桌面核心返回了不兼容的导出报告；原始资料未改变",
        );
        return report;
      } catch (reason: unknown) {
        if (reason instanceof ResearchExportGatewayError) throw reason;
        throw exportError(reason);
      }
    },
    async cancel() {
      try {
        const value = await transport.cancel();
        if (typeof value !== "boolean") throw new ResearchExportGatewayError(
          "export_failed",
          "桌面核心返回了不兼容的取消结果",
        );
        return value;
      } catch (reason: unknown) {
        if (reason instanceof ResearchExportGatewayError) throw reason;
        throw exportError(reason);
      }
    },
  };
}
