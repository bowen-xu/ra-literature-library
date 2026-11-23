import type { ReferenceCaptureValue } from "./ReferenceCapturePanel";
import type { ReferenceRecordGateway } from "../../services/referenceRecordGateway";

interface PdfReferenceCaptureContext {
  readonly paperId: string;
  readonly anchorId: string;
  readonly gateway: ReferenceRecordGateway;
}

export async function savePdfReferenceCapture(
  value: ReferenceCaptureValue,
  context: PdfReferenceCaptureContext,
): Promise<string> {
  if (value.kind === "new_reference") {
    await context.gateway.save({
      citingPaperId: context.paperId,
      sourceAnchorId: context.anchorId,
      rawText: value.rawText,
      fields: [],
      parseState: "unparsed",
      identityState: "unverified",
      semanticState: "unreviewed",
      usageSummary: "",
      changeReason: "manual_pdf_reference_capture",
    });
    return "已保存原始参考条目；解析和身份仍待人工核验";
  }

  const record = value.record;
  await context.gateway.save({
    id: record.id,
    citingPaperId: record.citingPaperId,
    sourceAnchorId: record.sourceAnchorId,
    rawText: record.rawText,
    fields: record.fields,
    parseState: record.parseState,
    identityState: record.identityState,
    ...(record.matchedItemId === undefined ? {} : { matchedItemId: record.matchedItemId }),
    semanticState: "reviewed",
    usageKind: value.usageKind,
    usageSummary: value.usageSummary,
    usageAnchorId: context.anchorId,
    expectedRevision: record.revision,
    changeReason: "manual_reference_usage_review",
  });
  return "已把正文用法与参考条目关联；身份核验状态保持不变";
}
