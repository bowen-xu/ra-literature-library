import type {
  PaperReadingProfileSelection,
  PaperReadingProfileSelectionDraft,
  ReadingProfile,
} from "@research-assistant/core/knowledge";

import { browserKnowledgeStorage } from "./browserKnowledgeStorage";

export const browserReadingProfiles: readonly ReadingProfile[] = [
  {
    profileId: "generic_overview", profileVersion: 1, profileKind: "generic",
    label: "通用阅读", description: "适合尚未确定论文类型时的基础阅读框架。",
    fieldKinds: ["research_question", "approach", "key_result", "conclusion", "limitation", "open_question"],
    reviewStatus: "approved", createdAt: "2026-08-04T00:00:00Z",
  },
  {
    profileId: "technical_empirical", profileVersion: 1, profileKind: "technical_empirical",
    label: "技术／实证", description: "关注研究问题、方法或系统、关键结果、结论、局限和开放问题。",
    fieldKinds: ["research_question", "approach", "key_result", "conclusion", "limitation", "open_question"],
    reviewStatus: "approved", createdAt: "2026-08-04T00:00:00Z",
  },
  {
    profileId: "philosophical_conceptual", profileVersion: 1,
    profileKind: "philosophical_conceptual", label: "哲学／概念",
    description: "关注核心问题、论证、异议、回应、结论和开放问题。",
    fieldKinds: ["research_question", "argument", "objection", "response", "conclusion", "open_question"],
    reviewStatus: "approved", createdAt: "2026-08-04T00:00:00Z",
  },
];

export function getBrowserPaperProfileSelection(
  paperId: string,
): PaperReadingProfileSelection {
  return browserKnowledgeStorage.readProfileSelections().find(
    (selection) => selection.paperId === paperId,
  ) ?? {
    paperId,
    profiles: [],
    revision: 0,
    isPersisted: false,
  };
}

export function saveBrowserPaperProfileSelection(
  draft: PaperReadingProfileSelectionDraft,
): PaperReadingProfileSelection {
  const selections = browserKnowledgeStorage.readProfileSelections();
  const current = selections.find((selection) => selection.paperId === draft.paperId);
  const currentRevision = current?.revision ?? 0;
  if (draft.expectedRevision !== currentRevision) {
    throw new Error(`对象版本冲突；当前版本为 ${currentRevision}`);
  }
  if (current !== undefined
    && current.profiles.map(profileKey).join("|") === draft.profiles.map(profileKey).join("|")) {
    return current;
  }
  const keys = new Set(draft.profiles.map((profile) =>
    `${profile.profileId}:${profile.profileVersion}`));
  const isValid = draft.profiles.length <= 3
    && keys.size === draft.profiles.length
    && draft.profiles.every((reference) => browserReadingProfiles.some((profile) =>
      profile.profileId === reference.profileId
      && profile.profileVersion === reference.profileVersion));
  if (!isValid) throw new Error("阅读画像版本不存在、重复或未经审核");
  const now = new Date().toISOString();
  const saved: PaperReadingProfileSelection = {
    paperId: draft.paperId,
    profiles: draft.profiles,
    revision: currentRevision + 1,
    isPersisted: true,
    createdAt: current?.createdAt ?? now,
    updatedAt: now,
  };
  browserKnowledgeStorage.writeProfileSelections([
    saved, ...selections.filter((selection) => selection.paperId !== draft.paperId),
  ]);
  return saved;
}

function profileKey(profile: { readonly profileId: string; readonly profileVersion: number }): string {
  return `${profile.profileId}:${profile.profileVersion}`;
}
