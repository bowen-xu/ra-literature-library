import { beforeEach, describe, expect, it, vi } from "vitest";

import { browserKnowledgeGateway } from "./browserKnowledgeGateway";

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length(): number { return this.values.size; }
  clear(): void { this.values.clear(); }
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  key(index: number): string | null { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string): void { this.values.delete(key); }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

const storage = new MemoryStorage();

beforeEach(() => {
  storage.clear();
  vi.stubGlobal("window", { localStorage: storage });
});

function source(paperId: string) {
  return {
    paperId,
    paperTitle: `Paper ${paperId}`,
    attachmentId: `attachment-${paperId}`,
    contentSha256: paperId === "a" ? "a".repeat(64) : "b".repeat(64),
    pageIndex: 0,
    quoteExact: "calibration",
  } as const;
}

describe("browserKnowledgeGateway", () => {
  it("rejects duplicate complete names before creating terms and preserves contextual identities",async()=>{
    const draft={preferredTerm:"感知",label:"感知`AI",explanation:"AI 中的感知。",disambiguation:"",domain:"",tradition:"",period:""};
    const first=await browserKnowledgeGateway.saveConcept(draft);
    await expect(browserKnowledgeGateway.saveConcept({...draft,preferredTerm:"不应创建的新语词",label:" 感知`AI "})).rejects.toThrow("已存在");
    expect(storage.getItem("research-assistant.terms.v1")).not.toContain("不应创建的新语词");
    const second=await browserKnowledgeGateway.saveConcept({...draft,label:"感知`心理学"});
    await expect(browserKnowledgeGateway.saveConcept({...draft,id:second.id,expectedRevision:second.revision})).rejects.toThrow("已存在");
    expect((await browserKnowledgeGateway.searchConcepts("感知")).map(value=>value.id).sort()).toEqual([first.id,second.id].sort());
  });

  it("keeps old homonyms unchanged and allows editing either without accepting a new duplicate",async()=>{
    const draft={preferredTerm:"感知",label:"感知",explanation:"旧概念。",disambiguation:"",domain:"",tradition:"",period:""};
    const first=await browserKnowledgeGateway.saveConcept(draft);
    storage.setItem("research-assistant.concepts.v1",JSON.stringify([first,{...first,id:"old-second"}]));
    expect((await browserKnowledgeGateway.searchConcepts("感知")).map(value=>value.label)).toEqual(["感知","感知"]);
    await expect(browserKnowledgeGateway.saveConcept(draft)).rejects.toThrow("已存在");
    const renamed=await browserKnowledgeGateway.saveConcept({...draft,id:first.id,expectedRevision:1,label:"感知`AI"});
    expect(renamed.id).toBe(first.id);
    const other=await browserKnowledgeGateway.saveConcept({...draft,id:"old-second",expectedRevision:1,label:"感知`心理学"});
    expect(other.id).toBe("old-second");
    expect((await browserKnowledgeGateway.searchConcepts("感知")).map(value=>value.label).sort()).toEqual(["感知`AI","感知`心理学"].sort());
  });
  it("rejects malformed localStorage records without modifying the original data", async () => {
    storage.setItem("research-assistant.concepts.v1", JSON.stringify([
      { id: "malformed", label: "缺少领域字段" },
      "not-an-object",
    ]));
    storage.setItem("research-assistant.research-object-revisions.v1", "{broken");
    const malformedConcepts = storage.getItem("research-assistant.concepts.v1");
    const malformedRevisions = storage.getItem("research-assistant.research-object-revisions.v1");
    await expect(browserKnowledgeGateway.searchConcepts("")).rejects.toThrow("原始记录未被修改");
    await expect(browserKnowledgeGateway.listRevisions("concept", "malformed"))
      .rejects.toThrow("原始记录未被修改");
    expect(storage.getItem("research-assistant.concepts.v1")).toBe(malformedConcepts);
    expect(storage.getItem("research-assistant.research-object-revisions.v1")).toBe(malformedRevisions);
  });

  it("rejects conflicting concept identity mappings instead of guessing a chain", async () => {
    const key = "research-assistant.concept-identity-mappings.v1";
    storage.setItem(key, JSON.stringify([
      { sourceConceptId: "concept-a", canonicalConceptId: "concept-b", mergeEventId: "e1", createdAt: "now" },
      { sourceConceptId: "concept-b", canonicalConceptId: "concept-c", mergeEventId: "e2", createdAt: "now" },
    ]));
    const original = storage.getItem(key);
    await expect(browserKnowledgeGateway.searchConcepts(""))
      .rejects.toThrow("身份映射存在冲突");
    expect(storage.getItem(key)).toBe(original);
  });

  it("keeps same-term concepts separate and reuses one stable concept across papers", async () => {
    const first = await browserKnowledgeGateway.captureConceptUsage({
      termText: "校准",
      language: "zh",
      anchorId: "anchor-a",
      usageText: "统计语境",
      resolution: { kind: "create_new", concept: {
        label: "统计校准", explanation: "预测概率与观察频率一致。", disambiguation: "统计学",
        domain: "统计学", tradition: "", period: "", changeReason: "selection_capture",
      }, definitionStatement: "预测频率与观察频率一致。" },
    }, source("a"));
    if (first.concept === undefined) throw new Error("expected created concept");
    const firstConceptId = first.concept.id;
    const secondConcept = await browserKnowledgeGateway.saveConcept({
      preferredTerm: "校准", language: "zh", label: "仪器校准",
      explanation: "测量装置相对于标准进行调整。", disambiguation: "测量学",
      domain: "测量学", tradition: "", period: "",
    });
    expect(await browserKnowledgeGateway.searchConcepts("校准")).toHaveLength(2);
    expect(secondConcept.id).not.toBe(first.concept?.id);

    const reused = await browserKnowledgeGateway.captureConceptUsage({
      termText: "calibration", language: "en", anchorId: "anchor-b", usageText: "English usage",
      resolution: { kind: "link_existing", conceptId: firstConceptId, definitionStatement: "Observed frequencies match predictions." },
    }, source("b"));
    expect(reused.concept).toEqual(expect.objectContaining({ id: firstConceptId, sourceCount: 2 }));
    expect(reused.usage.anchorId).toBe("anchor-b");
    expect(await browserKnowledgeGateway.listDefinitionClaims(firstConceptId)).toHaveLength(2);
  });

  it("preserves the current version when a stale manual edit is rejected", async () => {
    const created = await browserKnowledgeGateway.saveConcept({
      preferredTerm: "证据", label: "证据", explanation: "可回查的来源材料。",
      disambiguation: "", domain: "研究方法", tradition: "", period: "",
    });
    const updated = await browserKnowledgeGateway.saveConcept({
      id: created.id, preferredTerm: "证据", label: "证据",
      explanation: "可回查且与陈述关系明确的来源材料。", disambiguation: "",
      domain: "研究方法", tradition: "", period: "", expectedRevision: 1,
    });
    await expect(browserKnowledgeGateway.saveConcept({
      id: created.id, preferredTerm: "证据", label: "过期编辑", explanation: "不应覆盖。",
      disambiguation: "", domain: "", tradition: "", period: "", expectedRevision: 1,
    })).rejects.toThrow("当前版本为 2");
    expect((await browserKnowledgeGateway.searchConcepts("证据"))[0]).toEqual(expect.objectContaining({
      id: created.id, label: "证据", revision: 2, explanation: updated.explanation,
    }));
    expect(await browserKnowledgeGateway.listRevisions("concept", created.id)).toHaveLength(2);
  });

  it("stores unresolved usages and source-linked reading units as first-class manual objects", async () => {
    const unresolved = await browserKnowledgeGateway.captureConceptUsage({
      termText: "场", anchorId: "anchor-a", usageText: "语境不足", resolution: { kind: "unresolved" },
    }, source("a"));
    expect(unresolved.concept).toBeUndefined();
    expect(unresolved.usage.conceptId).toBeUndefined();

    const unit = await browserKnowledgeGateway.saveReadingUnit({
      paperId: "a", anchorId: "anchor-a", evidenceStance: "context",
      unitKind: "open_question", title: "待澄清", body: "该术语在此处如何定义？",
      epistemicRole: "question",
    });
    expect(unit).toEqual(expect.objectContaining({ revision: 1, evidenceCount: 1, provenanceKind: "human_original" }));
    expect(await browserKnowledgeGateway.listRevisions("reading_unit", unit.id)).toHaveLength(1);
  });

  it("creates and revisions a manual relation without letting stale edits overwrite it", async () => {
    const broader = await browserKnowledgeGateway.saveConcept({
      preferredTerm: "证据", label: "证据", explanation: "支持或反对陈述的材料。",
      disambiguation: "", domain: "研究方法", tradition: "", period: "",
    });
    const narrower = await browserKnowledgeGateway.saveConcept({
      preferredTerm: "直接证据", label: "直接证据", explanation: "直接关联陈述的材料。",
      disambiguation: "", domain: "研究方法", tradition: "", period: "",
    });
    const created = await browserKnowledgeGateway.saveRelationAssertion({
      subject: { kind: "concept", id: narrower.id }, predicateKind: "narrower_than",
      object: { kind: "concept", id: broader.id }, scopeNote: "当前项目 taxonomy",
      anchorId: "anchor-a", evidenceStance: "supports", evidenceRationale: "原文明确分类",
    });
    expect(created).toEqual(expect.objectContaining({
      revision: 1, evidenceCount: 1, provenanceKind: "human_original",
    }));

    const updated = await browserKnowledgeGateway.saveRelationAssertion({
      id: created.id, expectedRevision: 1,
      subject: { kind: "concept", id: narrower.id },
      predicateKind: "approximately_corresponds_to",
      object: { kind: "concept", id: broader.id }, scopeNote: "复核后减弱关系",
      anchorId: "anchor-a", evidenceStance: "supports", evidenceRationale: "同一来源",
    });
    expect(updated).toEqual(expect.objectContaining({ revision: 2, evidenceCount: 1 }));
    await expect(browserKnowledgeGateway.saveRelationAssertion({
      id: created.id, expectedRevision: 1,
      subject: { kind: "concept", id: broader.id }, predicateKind: "related_to",
      object: { kind: "concept", id: narrower.id }, scopeNote: "过期编辑",
    })).rejects.toThrow("当前版本为 2");
    expect(await browserKnowledgeGateway.listRevisions("relation_assertion", created.id))
      .toHaveLength(2);
  });

  it("rejects incomplete relation evidence before writing local data", async () => {
    const left = await browserKnowledgeGateway.saveConcept({
      preferredTerm: "左", label: "左", explanation: "左侧概念。",
      disambiguation: "", domain: "", tradition: "", period: "",
    });
    const right = await browserKnowledgeGateway.saveConcept({
      preferredTerm: "右", label: "右", explanation: "右侧概念。",
      disambiguation: "", domain: "", tradition: "", period: "",
    });
    await expect(browserKnowledgeGateway.saveRelationAssertion({
      subject: { kind: "concept", id: left.id }, predicateKind: "related_to",
      object: { kind: "concept", id: right.id }, scopeNote: "",
      anchorId: "anchor-a",
    })).rejects.toThrow("必须同时提供锚点和立场");
    expect(await browserKnowledgeGateway.listRelationAssertions()).toHaveLength(0);
  });

  it("composes reviewed reading profiles with revision conflict protection", async () => {
    const profiles = await browserKnowledgeGateway.listReadingProfiles();
    expect(profiles).toHaveLength(3);
    const implicit = await browserKnowledgeGateway.getPaperReadingProfileSelection("paper-a");
    expect(implicit).toEqual(expect.objectContaining({ revision: 0, isPersisted: false }));
    const saved = await browserKnowledgeGateway.savePaperReadingProfileSelection({
      paperId: "paper-a",
      profiles: [
        { profileId: "technical_empirical", profileVersion: 1 },
        { profileId: "philosophical_conceptual", profileVersion: 1 },
      ],
      expectedRevision: 0,
    });
    expect(saved).toEqual(expect.objectContaining({ revision: 1, isPersisted: true }));
    expect(await browserKnowledgeGateway.savePaperReadingProfileSelection({
      paperId: "paper-a",
      profiles: saved.profiles,
      expectedRevision: 1,
    })).toEqual(expect.objectContaining({ revision: 1 }));
    await expect(browserKnowledgeGateway.savePaperReadingProfileSelection({
      paperId: "paper-a",
      profiles: [{ profileId: "generic_overview", profileVersion: 1 }],
      expectedRevision: 0,
    })).rejects.toThrow("当前版本为 1");
  });

  it("merges concepts as reversible old-ID mappings without deleting definitions", async () => {
    const survivor = await browserKnowledgeGateway.saveConcept({
      preferredTerm: "证据", label: "证据", explanation: "支持或反对陈述的材料。",
      disambiguation: "", domain: "研究方法", tradition: "", period: "",
    });
    const sourceConcept = await browserKnowledgeGateway.saveConcept({
      preferredTerm: "直接证据", label: "直接证据", explanation: "直接关联陈述。",
      disambiguation: "", domain: "研究方法", tradition: "", period: "",
    });
    await browserKnowledgeGateway.saveDefinitionClaim({
      conceptId: sourceConcept.id,
      statement: "不经额外推断即可关联陈述。",
      scopeNote: "",
    });
    const relation = await browserKnowledgeGateway.saveRelationAssertion({
      subject: { kind: "concept", id: sourceConcept.id }, predicateKind: "narrower_than",
      object: { kind: "concept", id: survivor.id }, scopeNote: "",
    });
    const draft = {
      survivorId: survivor.id,
      survivorExpectedRevision: survivor.revision,
      sources: [{ id: sourceConcept.id, expectedRevision: sourceConcept.revision }],
      rationale: "人工确认同一概念",
    } as const;
    expect((await browserKnowledgeGateway.previewConceptMerge(draft)).affectedRelationIds)
      .toEqual([relation.id]);
    const merged = await browserKnowledgeGateway.mergeConcepts(draft);
    expect(await browserKnowledgeGateway.searchConcepts("")).toHaveLength(1);
    expect(await browserKnowledgeGateway.listDefinitionClaims(survivor.id)).toHaveLength(1);
    const reused = await browserKnowledgeGateway.captureConceptUsage({
      termText: "直接证据", anchorId: "anchor-a", usageText: "再次出现",
      resolution: { kind: "link_existing", conceptId: sourceConcept.id },
    }, source("a"));
    expect(reused.concept?.id).toBe(survivor.id);

    await browserKnowledgeGateway.splitConcepts({
      mergeEventId: merged.id,
      sourceConceptIds: [sourceConcept.id],
      rationale: "复核后拆回",
    });
    expect(await browserKnowledgeGateway.searchConcepts("")).toHaveLength(2);
    expect(await browserKnowledgeGateway.listDefinitionClaims(survivor.id)).toHaveLength(0);
    const events = await browserKnowledgeGateway.listConceptIdentityEvents();
    expect(events).toHaveLength(2);
    expect(events.find((event) => event.id === merged.id)?.activeSourceIds).toEqual([]);
  });
});
