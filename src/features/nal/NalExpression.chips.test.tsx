/** @vitest-environment happy-dom */
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import type { NalQuery, NalVocabulary } from "@research-assistant/core/nal";
import { NalExpression, NalTransitivityExpression } from "./NalExpression";
import { nalPaperCitation, type NalDisplayVocabulary } from "./nalPaperCitation";

const vocabulary: readonly NalVocabulary[] = [
  {atom:{kind:"concept",id:"method"},label:"active inference方法`认知科学"},
  {atom:{kind:"concept",id:"relation"},label:"基于方法"},
  {atom:{kind:"paper",id:"paper"},label:"文章1"},
];

it("distinguishes concept, paper and variable terms while keeping operators outside chips", () => {
  const statement: NalQuery = {subject:{kind:"product",terms:[{kind:"paper",id:"paper"},{kind:"concept",id:"method"},{kind:"variable",name:"x"}]},predicate:{kind:"concept",id:"relation"}};
  const host=document.createElement("div");
  host.innerHTML=renderToStaticMarkup(<NalExpression statement={statement} vocabulary={vocabulary}/>);
  const chips=host.querySelectorAll(".nal-concept-term");
  expect(chips).toHaveLength(2);
  expect(chips[0]?.querySelector(".concept-name-context")?.textContent).toBe("`认知科学");
  expect(chips[0]?.textContent).toBe("active inference方法`认知科学");
  expect(chips[1]?.textContent).toBe("基于方法");
  expect(host.querySelector(".nal-variable-term")?.textContent).toBe("?x");
  expect(host.querySelector(".nal-paper-name")?.textContent).toBe("文章1");
  expect(host.querySelector(".nal-variable-term .nal-concept-term")).toBeNull();
  expect(host.textContent).toBe("({文章1} × active inference方法`认知科学 × ?x) → 基于方法");
});

it("uses the same concept chips for all three occurrences in a transitivity rule", () => {
  const host=document.createElement("div");
  host.innerHTML=renderToStaticMarkup(<NalTransitivityExpression conceptId="relation" vocabulary={vocabulary}/>);
  expect([...host.querySelectorAll(".nal-concept-term")].map(node=>node.textContent)).toEqual(["基于方法","基于方法","基于方法"]);
  expect([...host.querySelectorAll(".nal-variable-term")].map(node=>node.textContent)).toEqual(["$y","$z","$x","$y","$x","$z"]);
  expect(host.textContent).toBe("($y × $z) → 基于方法 ∧ ($x × $y) → 基于方法 ⇒ ($x × $z) → 基于方法");
});

it("does not present missing identities or draft placeholders as known concepts", () => {
  const host=document.createElement("div");
  host.innerHTML=renderToStaticMarkup(<NalExpression statement={{subject:{kind:"concept",id:""},predicate:{kind:"concept",id:"missing"}}} vocabulary={vocabulary} emptyTermLabel="[待选择对象]"/>);
  expect(host.querySelectorAll(".nal-concept-term")).toHaveLength(0);
  expect(host.textContent).toBe("[待选择对象] → 未找到的概念");
});

it("keeps paper braces outside the colored name and retains the full citation for truncated names", () => {
  const citation=nalPaperCitation({title:"Vision by Logic: A Naïve Visual Recognition Model with Non-axiomatic Logic",issuedYear:2026,
    creators:[{role:"editor",familyName:"Editor",givenName:"",literalName:""},{role:"author",familyName:"Xu",givenName:"Bowen",literalName:""}]});
  const entries:readonly NalDisplayVocabulary[]=vocabulary.map(entry=>entry.atom.kind === "paper" ? {...entry,paperCitation:citation} : entry);
  const host=document.createElement("div");
  host.innerHTML=renderToStaticMarkup(<NalExpression statement={{subject:{kind:"paper",id:"paper"},predicate:{kind:"concept",id:"relation"}}} vocabulary={entries}/>);
  const paper=host.querySelector(".nal-paper-term"),name=paper?.querySelector(".nal-paper-name");
  expect(citation).toBe("(Xu, 2026) Vision by Logic: A Naïve Visual Recognition Model with Non-axiomatic Logic");
  expect(paper?.firstChild?.textContent).toBe("{");
  expect(paper?.lastChild?.textContent).toBe("}");
  expect(name?.textContent).toBe(citation);
  expect(name?.hasAttribute("title")).toBe(false);
  expect(host.querySelectorAll(".nal-concept-term")).toHaveLength(1);
  expect(entries.find(entry=>entry.atom.id === "paper")?.label).toBe("文章1");
});

it("formats organization authors and explicitly missing citation metadata", () => {
  expect(nalPaperCitation({title:"Research",issuedYear:2025,creators:[{role:"author",familyName:"",givenName:"",literalName:"Research Group"}]})).toBe("(Research Group, 2025) Research");
  expect(nalPaperCitation({title:"Research",creators:[]})).toBe("(未知作者, 年份不详) Research");
});
