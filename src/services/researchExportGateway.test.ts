import { describe, expect, it, vi } from "vitest";

import {createResearchExportGateway, decodeResearchExportReport, ResearchExportGatewayError} from "./researchExportGateway";

describe("research export IPC decoder", () => {
  it("accepts a complete non-negative report", () => {
    expect(decodeResearchExportReport({
      folderName: "research-knowledge-20260804T120000Z",
      fileCount: 2,
      objectCount: 42,
      sourceCount: 7,
    })).toEqual({
      folderName: "research-knowledge-20260804T120000Z",
      fileCount: 2,
      objectCount: 42,
      sourceCount: 7,
    });
  });

  it("rejects malformed counts and unexpected fields", () => {
    expect(decodeResearchExportReport({
      folderName: "bundle", fileCount: -1, objectCount: 3, sourceCount: 1,
    })).toBeUndefined();
    expect(decodeResearchExportReport({
      folderName: "bundle", fileCount: 2, objectCount: 3, sourceCount: 1, apiKey: "secret",
    })).toBeUndefined();
  });
});

describe("research export domain adapter", () => {
  const report = {folderName: "synthetic-export", fileCount: 2, objectCount: 3, sourceCount: 1};
  it("accepts only a decoded report while preserving the requested directory", async () => {
    const exportAll = vi.fn(async () => report), cancel = vi.fn(async () => true);
    const gateway = createResearchExportGateway({exportAll, cancel});
    await expect(gateway.exportAll("/synthetic/destination")).resolves.toEqual(report);
    expect(exportAll).toHaveBeenCalledExactlyOnceWith("/synthetic/destination");
    await expect(gateway.cancel()).resolves.toBe(true);
    expect(cancel).toHaveBeenCalledExactlyOnceWith();
  });
  it.each(["invalid_target", "destination_exists", "too_large", "busy", "operation_cancelled", "export_failed"] as const)(
    "retains the existing %s failure contract", async code => {
      const failure = {code, message: "safe export failure"};
      const gateway = createResearchExportGateway({exportAll: async () => {throw failure;}, cancel: async () => {throw failure;}});
      for (const call of [() => gateway.exportAll("/synthetic"), () => gateway.cancel()])
        await expect(call()).rejects.toMatchObject({name: "ResearchExportGatewayError", code, message: failure.message});
    });
  it("preserves an existing domain error instance", async () => {
    const failure = new ResearchExportGatewayError("busy", "existing diagnostic");
    const gateway = createResearchExportGateway({exportAll: async () => {throw failure;}, cancel: async () => {throw failure;}});
    await expect(gateway.exportAll("/synthetic")).rejects.toBe(failure);
    await expect(gateway.cancel()).rejects.toBe(failure);
  });
  it("rejects malformed reports and non-boolean cancellation without accepting success", async () => {
    const gateway = createResearchExportGateway({exportAll: async () => ({...report, unrelated: "not accepted"}), cancel: async () => ({ok: true})});
    await expect(gateway.exportAll("/synthetic")).rejects.toMatchObject({code: "export_failed", message: "桌面核心返回了不兼容的导出报告；原始资料未改变"});
    await expect(gateway.cancel()).rejects.toMatchObject({code: "export_failed", message: "桌面核心返回了不兼容的取消结果"});
  });
  it("retains the safe default for unknown wire failures", async () => {
    const gateway = createResearchExportGateway({exportAll: async () => {throw {code: "not-a-domain-code", message: "safe cause"};}, cancel: async () => {throw null;}});
    await expect(gateway.exportAll("/synthetic")).rejects.toMatchObject({code: "export_failed", message: "safe cause"});
    await expect(gateway.cancel()).rejects.toMatchObject({code: "export_failed", message: "研究知识导出失败；原始资料未改变"});
  });
});
