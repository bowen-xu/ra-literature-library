import { ArrowUpRight } from "lucide-react";
import type { AiCandidate, AiEvidenceItem, PaperOverviewFieldV1 } from "@research-assistant/core/ai";
import type { AiAssistanceGateway } from "@research-assistant/workbench-sdk/ai-assistance";
import { aiAssistanceErrorMessage } from "@research-assistant/workbench-sdk/ai-assistance";
import { notify } from "@research-assistant/workbench-sdk/feedback";
import { ControlHint } from "@research-assistant/workbench-sdk/overlay";
import { inspectAiReadingSource, readingSourceForAiEvidence } from "./aiEvidenceNavigation";
import { fieldReadingSources } from "./readingFieldSources";

export function OverviewFieldSources({ candidate, field, gateway, onChanged, onOpenEvidence, inline = false }: {
  readonly candidate: AiCandidate;
  readonly field: PaperOverviewFieldV1;
  readonly gateway: AiAssistanceGateway;
  readonly onChanged: (candidate: AiCandidate) => void;
  readonly onOpenEvidence?: (evidence: AiEvidenceItem) => Promise<void>;
  readonly inline?: boolean;
}): React.JSX.Element | null {
  const sources = fieldReadingSources(candidate, field);
  if (sources.length === 0) return null;
  async function inspect(evidence: AiEvidenceItem): Promise<void> {
    try {
      if (["stale", "missing"].includes(evidence.currentAnchorStatus)) throw new Error("来源已变化或不可用，请重新核对。");
      if (onOpenEvidence === undefined) await inspectAiReadingSource(readingSourceForAiEvidence(evidence));
      else await onOpenEvidence(evidence);
      await gateway.recordEvidenceInspection(candidate.id, candidate.currentRevision, evidence.id);
      const updated = (await gateway.listCandidates()).find(value => value.id === candidate.id);
      if (updated !== undefined) onChanged(updated);
    } catch (reason) { notify.error(aiAssistanceErrorMessage(reason)); }
  }
  const label = "跳转到原文";
  const first = sources[0];
  if (first === undefined) return null;
  if (!inline) return <ControlHint content={`${label} · 第 ${first.evidence.pageLabel ?? first.evidence.pageIndex + 1} 页`}><button type="button" className="reading-icon-action" aria-label={label} onClick={() => void inspect(first.evidence)}><ArrowUpRight size={15} aria-hidden="true" /></button></ControlHint>;
  return <div className="reading-field-sources" aria-label={`${first.fieldTitle}的原文引用`}>
    {sources.map((source, index) => <ControlHint key={source.id} content={`${source.evidence.paperTitle} · 第 ${source.evidence.pageLabel ?? source.evidence.pageIndex + 1} 页${source.evidence.currentAnchorStatus === "page_level" ? " · 页级定位" : ""}`}>
      <button type="button" aria-label={`${first.fieldTitle}原文 ${index + 1} · 第 ${source.evidence.pageLabel ?? source.evidence.pageIndex + 1} 页`} onClick={() => void inspect(source.evidence)}>
        <ArrowUpRight size={12} aria-hidden="true" />{index + 1} · p{source.evidence.pageLabel ?? source.evidence.pageIndex + 1}
      </button>
    </ControlHint>)}
  </div>;
}
