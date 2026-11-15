import type {
  KnowledgeEpistemicRole,
  StructuredReadingUnitKind,
} from "@research-assistant/core/knowledge";

export const readingUnitKindLabels: Readonly<Record<StructuredReadingUnitKind, string>> = {
  research_question: "研究问题",
  approach: "方法／路径",
  key_result: "关键结果",
  conclusion: "结论",
  limitation: "局限",
  open_question: "开放问题",
  argument: "论证",
  objection: "反对意见",
  response: "回应",
  other: "其他",
};

export const epistemicRoleLabels: Readonly<Record<KnowledgeEpistemicRole, string>> = {
  assertion: "观点陈述",
  source_paraphrase: "来源转述",
  synthesis: "人工综合",
  inference: "推论",
  hypothesis: "假设",
  question: "问题",
  definition: "定义",
  working_note: "工作笔记",
};

export const provenanceLabels = {
  human_original: "人工原创",
  ai_accepted_unchanged: "AI 建议·人工原样接受",
  ai_accepted_after_edit: "AI 建议·人工修改后接受",
  legacy_ai: "旧版 AI 内容·待核验",
} as const;
