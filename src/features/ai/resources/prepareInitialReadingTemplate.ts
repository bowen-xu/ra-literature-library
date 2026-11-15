import { decodePaperTemplateSnapshot, type PaperTemplateSnapshot } from "@research-assistant/core/ai";
import type { StructuredResourceGateway } from "@research-assistant/workbench-sdk/structured-resources";

/** Each explicit extraction uses current template content; the run freezes its snapshot. */
export async function prepareInitialReadingTemplate(gateway:StructuredResourceGateway,paperId:string):Promise<PaperTemplateSnapshot>{
  const rows=await gateway.list(paperId);
  const reading=rows.find(row=>row.kind==="structuredReading"&&row.paperId===paperId);
  if(!reading)throw new Error("统一阅读资源尚未恢复，请稍后重试。");
  if(reading.content!==null&&!reading.templateRef)throw new Error("已有阅读正文尚未绑定模板，请在文献画像详情中修复模板。");
  let template=reading.templateRef?await gateway.get(reading.templateRef.resourceId)
    :rows.find(row=>row.kind==="readingTemplate"&&row.paperId===paperId);
  if(!template)throw new Error("请先生成文献画像与本文阅读模板。");
  if(template.draft){
    const draft=template.draft;
    if(!draft)throw new Error("请先生成文献画像与本文阅读模板。");
    if(draft.errors.length||draft.baseRevision!==template.revision)throw new Error("本文模板尚未通过校验，草稿已保留，请在画像详情中修复后重试。");
    const result=await gateway.write({resourceId:template.id,content:draft.content,
      expectedRevision:template.revision,expectedDraftRevision:draft.revision,editorKind:"agent",
      ...(draft.creatorConversationId?{conversationId:draft.creatorConversationId}:{}),requestId:crypto.randomUUID()});
    if(result.status!=="applied"||result.receipt?.resourceId!==template.id||result.receipt.revision!==result.resource.revision){
      throw new Error("本文模板尚未成功保存，草稿已保留，请重试。");
    }
    template=result.resource;
  }
  if(template.content===null)throw new Error("请先生成文献画像与本文阅读模板。");
  const current=(await gateway.list(paperId)).find(row=>row.id===reading.id);
  if(!current)throw new Error("阅读资源已变化，请重试。");
  if(!current.templateRef){
    await gateway.bindTemplate({paperId,templateId:template.id,templateRevision:template.revision,
      expectedRevision:current.revision,confirmed:false,requestId:crypto.randomUUID()});
  }else if(current.templateRef.resourceId!==template.id){
    throw new Error("本文采用的模板对象已变化，请重试。");
  }else if(current.templateRef.revision!==template.revision){
    await gateway.bindTemplate({paperId,templateId:template.id,templateRevision:template.revision,
      expectedRevision:current.revision,confirmed:true,requestId:crypto.randomUUID()});
  }
  return decodePaperTemplateSnapshot({templateResourceId:template.id,templateResourceRevision:template.revision,
    fields:(template.content as {fields?:unknown}|null)?.fields});
}
