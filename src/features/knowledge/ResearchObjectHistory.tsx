import { useNotificationState } from "@research-assistant/workbench-sdk/feedback";
import { useEffect, useState } from "react";
import type {
  ResearchObjectKind,
  ResearchObjectRevision,
} from "@research-assistant/core/knowledge";

import { researchKnowledgeErrorMessage, type ResearchKnowledgeGateway } from "../../services/knowledgeGateway";

interface ResearchObjectHistoryProps {
  readonly gateway: ResearchKnowledgeGateway;
  readonly objectKind: ResearchObjectKind;
  readonly objectId: string;
  readonly onClose: () => void;
}

function summary(revision: ResearchObjectRevision): string {
  const snapshot = revision.snapshot;
  for (const key of ["statement", "body", "explanation", "text"]) {
    const value = snapshot[key];
    if (typeof value === "string" && value.trim().length > 0) return value;
  }
  return "该版本保存了结构或元数据调整。";
}

export function ResearchObjectHistory({
  gateway,
  objectKind,
  objectId,
  onClose,
}: ResearchObjectHistoryProps): React.JSX.Element {
  const [revisions, setRevisions] = useState<readonly ResearchObjectRevision[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useNotificationState("error");

  useEffect(() => {
    let active = true;
    void gateway.listRevisions(objectKind, objectId)
      .then((values) => { if (active) setRevisions(values); })
      .catch((reason: unknown) => {
        if (active) setError(researchKnowledgeErrorMessage(reason));
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => { active = false; };
  }, [gateway, objectId, objectKind]);

  return <section className="research-object-history" aria-busy={isLoading} aria-label="版本历史">
    <header><strong>版本历史</strong><button onClick={onClose} type="button">关闭</button></header>
    {isLoading && <p role="status">正在读取版本历史…</p>}

    {!isLoading && error === undefined && revisions.length === 0 && <p>尚无可用版本记录。</p>}
    {revisions.map((revision) => <article key={revision.id}>
      <div><b>v{revision.revision}</b><span>{revision.editorKind === "human" ? "人工保存" : revision.editorKind}</span><time dateTime={revision.createdAt}>{new Date(revision.createdAt).toLocaleString()}</time></div>
      <p>{summary(revision)}</p>
      <small>{revision.changeReason || "未注明修改原因"}</small>
    </article>)}
  </section>;
}
