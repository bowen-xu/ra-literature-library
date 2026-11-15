import { ControlHint } from "@research-assistant/workbench-sdk/overlay";
import { Fragment } from "react";
import { formatNalTerm, type NalPattern, type NalQuery, type NalVocabulary } from "@research-assistant/core/nal";
import { ConceptName } from "../knowledge/ConceptName";
import type { NalDisplayVocabulary } from "./nalPaperCitation";
import "./NalExpression.css";

function Variable({name,prefix="?"}:{readonly name:string;readonly prefix?:"?"|"$"}) {
  return <span className="nal-variable-term">{prefix}{name}</span>;
}

export function NalTerm({term, vocabulary,emptyTermLabel}:{readonly term:NalPattern;readonly vocabulary:readonly NalDisplayVocabulary[];readonly emptyTermLabel?:string|undefined}) {
  if("terms" in term) return <>({term.terms.map((value,index)=><Fragment key={index}>{index>0 && (term.kind === "product" ? " × " : term.kind === "conjunction" ? " ∧ " : term.kind === "compound" ? " [选择连接符] " : " ∨ ")}<NalTerm term={value} vocabulary={vocabulary} emptyTermLabel={emptyTermLabel}/></Fragment>)})</>;
  if(term.kind === "statement") return <>{"<"}<NalExpression statement={term} vocabulary={vocabulary} emptyTermLabel={emptyTermLabel}/>{">"}</>;
  if(emptyTermLabel && (("id" in term && !term.id) || (term.kind === "variable" && !term.name.trim())))return <span className="nal-expression-placeholder">{emptyTermLabel}</span>;
  if(term.kind === "variable")return <Variable name={term.name}/>;
  const text=formatNalTerm(term,vocabulary,{displayOnly:true});
  if(term.kind === "paper"){
    const entry=vocabulary.find(value=>value.atom.kind === "paper" && value.atom.id === term.id);
    if(!entry)return <>{text}</>;
    const citation=entry.paperCitation ?? entry.label;
    return <span className="nal-paper-term">{"{"}<ControlHint content={citation}><span className="nal-paper-name">{citation}</span></ControlHint>{"}"}</span>;
  }
  if(term.kind !== "concept")return <>{text}</>;
  const label=vocabulary.find(value=>value.atom.kind === "concept" && value.atom.id === term.id)?.label;
  if(label === text)return <span className="nal-concept-term"><ConceptName label={label}/></span>;
  if(label && JSON.stringify(label) === text)return <span className="nal-concept-term">"<ConceptName label={label}/>"</span>;
  return <>{text}</>;
}

export function NalExpression({statement,vocabulary,emptyTermLabel}:{readonly statement:NalQuery;readonly vocabulary:readonly NalDisplayVocabulary[];readonly emptyTermLabel?:string|undefined}) {
  return <><NalTerm term={statement.subject} vocabulary={vocabulary} emptyTermLabel={emptyTermLabel}/>{statement.copula === "implication" ? " ⇒ " : " → "}<NalTerm term={statement.predicate} vocabulary={vocabulary} emptyTermLabel={emptyTermLabel}/></>;
}

/** The fixed rule template shares concept rendering with statements, without parsing display text. */
export function NalTransitivityExpression({conceptId,vocabulary}:{readonly conceptId:string;readonly vocabulary:readonly NalVocabulary[]}) {
  const relation=<NalTerm term={{kind:"concept",id:conceptId}} vocabulary={vocabulary}/>;
  const statement=(left:string,right:string)=><>{"("}<Variable name={left} prefix="$"/>{" × "}<Variable name={right} prefix="$"/>{") → "}{relation}</>;
  return <>{statement("y","z")}{" ∧ "}{statement("x","y")}{" ⇒ "}{statement("x","z")}</>;
}
