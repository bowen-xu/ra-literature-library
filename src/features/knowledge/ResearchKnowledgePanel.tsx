import { useMemo, useState } from "react";
import type { SourceAnchorSummary } from "@research-assistant/core/evidence";
import type { ResearchProject } from "@research-assistant/core/project";

import { getResearchKnowledgeGateway } from "../../services/knowledgeGateway";
import { ConceptWorkspace } from "./ConceptWorkspace";
import { ReadingUnitWorkspace } from "./ReadingUnitWorkspace";
import { RelationWorkspace } from "./RelationWorkspace";

interface ResearchKnowledgePanelProps {
  readonly project?: ResearchProject;
  readonly source?: SourceAnchorSummary;
}

export function ResearchKnowledgePanel({ project, source }: ResearchKnowledgePanelProps): React.JSX.Element {
  const gateway = useMemo(() => getResearchKnowledgeGateway(), []);
  const [tab, setTab] = useState<"reading" | "concepts" | "relations">("reading");
  return <section className="research-knowledge-panel">
    <header className="research-knowledge-heading"><div><span className="eyebrow">HUMAN KNOWLEDGE</span><h2>人工知识维护</h2></div><p>AI 未配置时仍可完整新建、修改、检索和查看历史；版本冲突不会覆盖你的草稿。</p></header>
    <nav aria-label="人工知识类型"><button aria-current={tab === "reading" ? "page" : undefined} onClick={() => setTab("reading")} type="button">阅读单元</button><button aria-current={tab === "concepts" ? "page" : undefined} onClick={() => setTab("concepts")} type="button">概念与定义</button><button aria-current={tab === "relations" ? "page" : undefined} onClick={() => setTab("relations")} type="button">关系断言</button></nav>
    {tab === "reading" ? <ReadingUnitWorkspace gateway={gateway} {...(project === undefined ? {} : { project })} {...(source === undefined ? {} : { source })} /> : tab === "concepts" ? <ConceptWorkspace gateway={gateway} /> : <RelationWorkspace gateway={gateway} {...(project === undefined ? {} : { project })} {...(source === undefined ? {} : { source })} />}
  </section>;
}
