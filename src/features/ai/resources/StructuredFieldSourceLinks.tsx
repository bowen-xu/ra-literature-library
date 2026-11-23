import { ArrowUpRight } from "lucide-react";
import { memo } from "react";
import type { AiEvidenceItem } from "@research-assistant/core/ai";
import type { StructuredResource } from "@research-assistant/core/structured-resources";
import { notify } from "@research-assistant/workbench-sdk/feedback";
import { ControlHint } from "@research-assistant/workbench-sdk/overlay";
import { inspectAiReadingSource, readingSourceForAiEvidence } from "../aiEvidenceNavigation";
import { structuredResourceSources } from "./structuredResourceSources";

export const StructuredFieldSourceLinks = memo(function StructuredFieldSourceLinks({resource, fieldId, evidence}: {
  readonly resource: StructuredResource;
  readonly fieldId: string;
  readonly evidence: readonly (AiEvidenceItem & {readonly fieldIds?: readonly string[]})[];
}) {
  const sources = structuredResourceSources(resource.id, resource.content, evidence)
    .filter(value => value.fieldId === fieldId);
  if (sources.length === 0) return null;
  return (
    <div className="reading-field-sources" aria-label="字段的原文引用">
      {sources.map((source, index) => (
        <ControlHint key={source.id} content={`${source.evidence.paperTitle} · ${source.evidence.quoteExact}`}>
          <button type="button" aria-label={`${source.fieldTitle}原文 ${index + 1}`} onClick={() => {
            if (["stale", "missing"].includes(source.evidence.currentAnchorStatus)) {
              notify.error("来源已变化或不可用，请重新核对。");
              return;
            }
            void inspectAiReadingSource(readingSourceForAiEvidence(source.evidence))
              .catch(reason => notify.error(reason instanceof Error ? reason.message : "无法打开原文"));
          }}>
            <ArrowUpRight size={12} aria-hidden="true"/>
            {index + 1} · p{source.evidence.pageLabel ?? source.evidence.pageIndex + 1}
          </button>
        </ControlHint>
      ))}
    </div>
  );
}, (before, after) => before.resource.id === after.resource.id && before.fieldId === after.fieldId
  && (before.resource.content === after.resource.content || JSON.stringify(before.resource.content) === JSON.stringify(after.resource.content))
  && (before.evidence === after.evidence || JSON.stringify(before.evidence) === JSON.stringify(after.evidence)));
