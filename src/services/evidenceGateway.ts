import {runtimeEvidenceGateway} from "./configureLiteratureServices";
import {resolveEvidenceRuntimeGateway} from "@research-assistant/workbench-sdk/literature-runtime";
import type { EvidenceGateway } from "../public/contracts/evidenceGateway";
export type { EvidenceGateway } from "../public/contracts/evidenceGateway";
import { getAppStorage } from "@research-assistant/workbench-sdk/storage";
import type { Claim } from "@research-assistant/core/evidence";

import { appendBrowserResearchRevision } from "./browserResearchRevisionStore";
import {decodeEvidenceList, decodeLegacyBrowserClaim} from "./evidenceDecoders";

const BROWSER_CLAIMS_KEY = "research-assistant.claims.v2";
const LEGACY_BROWSER_CLAIMS_KEY = "research-assistant.claims.v1";

function readBrowserClaims(): readonly Claim[] {
  const raw = getAppStorage().getItem(BROWSER_CLAIMS_KEY)
    ?? getAppStorage().getItem(LEGACY_BROWSER_CLAIMS_KEY);
  if (raw === null) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    const decoded = decodeEvidenceList(parsed, decodeLegacyBrowserClaim);
    if (decoded === undefined) throw new Error("invalid stored claims");
    return decoded;
  } catch {
    throw new Error("本地观点数据无法读取；原始记录未被修改。");
  }
}

const browserEvidenceGateway: EvidenceGateway = {
  async listClaims(projectId) {
    return readBrowserClaims().filter((claim) => projectId === undefined || claim.projectId === projectId);
  },
  async saveClaim(draft) {
    const statement = draft.statement.trim();
    if (statement.length === 0) throw new Error("观点内容不能为空");
    const now = new Date().toISOString();
    const existing = draft.id === undefined ? undefined : readBrowserClaims().find((claim) => claim.id === draft.id);
    if (existing === undefined && draft.expectedRevision !== undefined) {
      throw new Error("找不到要更新的观点");
    }
    if (existing !== undefined && draft.expectedRevision !== existing.revision) {
      throw new Error(`观点版本冲突；当前版本为 ${existing.revision}`);
    }
    const claim: Claim = {
      id: draft.id ?? crypto.randomUUID(),
      ...(draft.projectId === undefined ? {} : { projectId: draft.projectId }),
      statement,
      origin: existing?.origin ?? "user",
      provenanceKind: existing?.provenanceKind ?? "human_original",
      epistemicRole: draft.epistemicRole,
      revision: (existing?.revision ?? 0) + 1,
      evidenceCount: existing?.evidenceCount ?? 0,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    getAppStorage().setItem(
      BROWSER_CLAIMS_KEY,
      JSON.stringify([claim, ...readBrowserClaims().filter((value) => value.id !== claim.id)]),
    );
    appendBrowserResearchRevision(
      "claim",
      claim.id,
      claim.revision,
      {
        id: claim.id,
        projectId: claim.projectId,
        statement: claim.statement,
        provenanceKind: claim.provenanceKind,
        epistemicRole: claim.epistemicRole,
        revision: claim.revision,
      },
      draft.changeReason ?? "manual_save",
    );
    return claim;
  },
  async listSources() { return []; },
  async linkEvidence() {
    throw new Error("原文证据关联只在 Tauri 桌面模式中可用");
  },
  async createClaimWithEvidence() {
    throw new Error("观点与原文证据的原子保存只在 Tauri 桌面模式中可用");
  },
  async listClaimEvidence() { return []; },
};

export function getEvidenceGateway(): EvidenceGateway {
  return runtimeEvidenceGateway() ?? resolveEvidenceRuntimeGateway(browserEvidenceGateway);
}
