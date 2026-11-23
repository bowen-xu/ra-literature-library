import { expect,it } from "vitest";
import type { AiEvidenceItem } from "@research-assistant/core/ai";
import { structuredResourceSources } from "./structuredResourceSources";
it("resolves repeated citation keys inside their exact field/bundle scope",()=>{
  const source={ordinal:0,anchorId:"anchor",contextText:"source",relationKind:"direct_quote",validationStatus:"valid",createdAt:"now",id:"one",citationKey:"P1-T1",paperId:"paper",paperTitle:"Paper",attachmentId:"pdf-one",contentSha256:"a",pageIndex:1,quoteExact:"old source",quotePrefix:"",quoteSuffix:"",currentAnchorStatus:"exact",fieldIds:["question"]} as AiEvidenceItem & {fieldIds:readonly string[]};
  const other={...source,id:"two",attachmentId:"pdf-two",pageIndex:9,quoteExact:"new source",fieldIds:["result"]};
  const content={fields:[{field:"question",statements:[{text:"Question",evidenceItemIds:["P1-T1"],evidenceQuotes:[{evidenceItemId:"P1-T1",quote:"old source"}]}]},{field:"result",statements:[{text:"Result",evidenceItemIds:["P1-T1"],evidenceQuotes:[{evidenceItemId:"P1-T1",quote:"new source"}]}]}]};
  const values=structuredResourceSources("reading",content,[source,other]);
  expect(values.map(value=>[value.fieldId,value.evidence.attachmentId,value.evidence.pageIndex])).toEqual([["question","pdf-one",1],["result","pdf-two",9]]);
});
