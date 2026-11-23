import { useState } from "react";
import type { StructuredResource } from "@research-assistant/core/structured-resources";
import type { StructuredResourceGateway } from "@research-assistant/workbench-sdk/structured-resources";
import { notify } from "@research-assistant/workbench-sdk/feedback";

/** A failed write remains editable after restart; it is separate from pending review. */
export function StructuredResourceDraftEditor({resource, gateway, onChanged}: {
  readonly resource: StructuredResource;
  readonly gateway: StructuredResourceGateway;
  readonly onChanged: (resource: StructuredResource) => void;
}) {
  const draft = resource.draft;
  const [base, setBase] = useState({formalRevision: resource.revision, draftRevision: draft?.revision});
  const [text, setText] = useState(draft?.content ?? "");
  const [busy, setBusy] = useState(false);
  if (!draft) return null;

  async function save(): Promise<void> {
    setBusy(true);
    try {
      const result = await gateway.write({
        resourceId: resource.id,
        expectedRevision: base.formalRevision,
        ...(base.draftRevision === undefined ? {} : {expectedDraftRevision: base.draftRevision}),
        ...(draft!.creatorConversationId ? {conversationId: draft!.creatorConversationId} : {}),
        requestId: crypto.randomUUID(), content: text, editorKind: "human",
      });
      onChanged(result.resource);
      setBase({formalRevision: result.resource.revision, draftRevision: result.draft?.revision});
      if (result.status === "applied") notify.success("修复已应用。");
    } catch (reason) {
      notify.error(reason instanceof Error ? reason.message : "草稿保存失败，请重试。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="structured-resource-draft">
      <summary>待修复草稿{draft.errors.length > 0 ? ` · ${draft.errors.length} 项问题` : ""}</summary>
      <ul>{draft.errors.map((issue, index) => (
        <li key={`${issue.path}:${index}`}><code>{issue.path}</code> {issue.message}</li>
      ))}</ul>
      <textarea
        aria-label="修复结构化资源 JSON" rows={10} value={text} disabled={busy}
        onChange={event => setText(event.target.value)}
      />
      <button type="button" disabled={busy} onClick={() => void save()}>保存并重试校验</button>
    </details>
  );
}
