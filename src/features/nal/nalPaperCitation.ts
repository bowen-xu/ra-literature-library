import type { LiteratureItem } from "@research-assistant/core/literature";
import type { NalConceptKind, NalVocabulary } from "@research-assistant/core/nal";

/** Presentation metadata leaves title-based syntax lookup and stable IDs unchanged. */
export interface NalDisplayVocabulary extends NalVocabulary {
  readonly paperCitation?: string;
  readonly conceptKind?: NalConceptKind;
}

export function nalPaperCitation(paper: Pick<LiteratureItem,"title"|"creators"|"issuedYear">): string {
  const author=paper.creators.find(creator=>(creator.role === "author" || !creator.role)
    && (creator.familyName.trim() || creator.literalName.trim() || creator.givenName.trim()));
  const name=author && (author.familyName.trim() || author.literalName.trim() || author.givenName.trim());
  return `(${name || "未知作者"}, ${paper.issuedYear ?? "年份不详"}) ${paper.title.trim() || "无标题文献"}`;
}
