import {afterEach, expect, it, vi} from "vitest";
import type {RuntimeLiteraturePort} from "@research-assistant/workbench-sdk/literature-runtime";
import type {Claim, ClaimDraft, EvidenceLink, SourceAnchorSummary} from "@research-assistant/core/evidence";
import {configureLiteratureServices} from "./configureLiteratureServices";
import {getEvidenceGateway} from "./evidenceGateway";

const fallback = vi.hoisted(() => vi.fn());
vi.mock("@research-assistant/workbench-sdk/literature-runtime", () => ({resolveEvidenceRuntimeGateway: fallback}));
let dispose: (() => void) | undefined;
afterEach(() => {dispose?.(); dispose = undefined; fallback.mockReset();});
const source: SourceAnchorSummary = {
  anchorId: "a", itemId: "paper", itemTitle: "Synthetic paper", attachmentId: "pdf", attachmentName: "synthetic.pdf",
  contentSha256: "a".repeat(64), pageIndex: 0, rects: [], quoteExact: "Synthetic source Ω",
  quotePrefix: "", quoteSuffix: "", annotationBody: "", createdAt: "before",
};
const claim: Claim = {
  id: "c", projectId: "p", statement: "Manual Ω", origin: "user", provenanceKind: "human_original",
  epistemicRole: "assertion", revision: 1, evidenceCount: 1, createdAt: "before", updatedAt: "after",
};
const linked: EvidenceLink = {id: "link", claimId: "c", stance: "context", rationale: "Chosen source", source, createdAt: "before"};
const draft: ClaimDraft = {projectId: "p", statement: " Manual Ω ", epistemicRole: "assertion"};

it("uses original decoders for all manual writes and revokes the captured facade", async () => {
  const methods = {
    saveClaim: vi.fn(async () => claim),
    linkEvidence: vi.fn(async () => linked),
    createClaimWithEvidence: vi.fn(async () => claim),
  };
  dispose = configureLiteratureServices({evidence: methods} as unknown as RuntimeLiteraturePort);
  const gateway = getEvidenceGateway();
  const evidence = {anchorId: "a", stance: "context" as const, rationale: "Chosen source"};
  const link = {claimId: "c", ...evidence};
  await expect(gateway.saveClaim(draft)).resolves.toEqual(claim);
  await expect(gateway.linkEvidence(link)).resolves.toEqual(linked);
  await expect(gateway.createClaimWithEvidence(draft, evidence)).resolves.toEqual(claim);
  expect(methods.saveClaim).toHaveBeenCalledExactlyOnceWith(draft);
  expect(methods.createClaimWithEvidence).toHaveBeenCalledExactlyOnceWith(draft, evidence);
  dispose();
  await expect(gateway.saveClaim(draft)).rejects.toMatchObject({code: "literature_gateway_unavailable"});
  await expect(gateway.linkEvidence(link)).rejects.toMatchObject({code: "literature_gateway_unavailable"});
  await expect(gateway.createClaimWithEvidence(draft, evidence)).rejects.toMatchObject({code: "literature_gateway_unavailable"});
  expect(methods.saveClaim).toHaveBeenCalledTimes(1);
  expect(fallback).not.toHaveBeenCalled();
});

it("rejects malformed or missing write results without falling back to static IPC", async () => {
  dispose = configureLiteratureServices({evidence: {
    saveClaim: async () => ({...claim, epistemicRole: "unbound"}),
    linkEvidence: async () => ({...linked, stance: "unbound"}),
  }} as unknown as RuntimeLiteraturePort);
  await expect(getEvidenceGateway().saveClaim(draft)).rejects.toThrow("不兼容的观点");
  await expect(getEvidenceGateway().linkEvidence({claimId: "c", anchorId: "a", stance: "context", rationale: ""}))
    .rejects.toThrow("不兼容的证据关联");
  await expect(getEvidenceGateway().createClaimWithEvidence(draft, {anchorId: "a", stance: "context", rationale: ""}))
    .rejects.toMatchObject({code: "literature_gateway_unavailable"});
  expect(fallback).not.toHaveBeenCalled();
});
