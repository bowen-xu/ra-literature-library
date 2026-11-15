import { useCallback, useEffect, useRef, useState } from "react";
import type { StructuredResource } from "@research-assistant/core/structured-resources";
import { decodePaperTemplateSnapshot, type PaperTemplateSnapshot, type AiEvidenceItem } from "@research-assistant/core/ai";
import { getStructuredResourceGateway } from "@research-assistant/workbench-sdk/structured-resources";
import { getRuntimeEnvironment, ensureRuntimeStructuredResources } from "@research-assistant/workbench-sdk/environment";
import { publishPaperReadingChanged, subscribePaperReadingChanged } from "../readingPanelEvents";
/** Import preference pointers before exposing canonical content, preserving mixed versions. */
export function usePaperStructuredResources(paperId: string) {
  const runtime = getRuntimeEnvironment();
  const available = runtime.mode === "desktop" || runtime.hasStructuredResourceGateway;
  const gateway = getStructuredResourceGateway();
  const [resources, setResources] = useState<readonly StructuredResource[] | null>(null);
  const [sources, setSources] = useState<readonly AiEvidenceItem[]>([]);
  const [template, setTemplate] = useState<PaperTemplateSnapshot>();
  const [error, setError] = useState<string>(), [loading, setLoading] = useState(available);
  const alive = useRef(true), source = useRef(crypto.randomUUID()), generation = useRef(0), subscribed = useRef(false);
  const reload = useCallback(async (): Promise<void> => {
    if (!available)
      return;
    const token = ++generation.current;
    try {
      await ensureRuntimeStructuredResources(runtime);
      const rows = await gateway.list(paperId);
      const reading = rows.find(resource => resource.kind === "structuredReading");
      const sources = reading ? await gateway.getSources(reading.id) : [];
      const binding = reading?.templateRef;
      let snapshot: PaperTemplateSnapshot | undefined;
      if (binding) {
        const saved = await gateway.getVersion(binding.resourceId, binding.revision);
        const content = saved.content as {
          fields?: unknown;
        };
        snapshot = decodePaperTemplateSnapshot({
          templateResourceId: saved.id,
          templateResourceRevision: binding.revision,
          fields: content?.fields
        });
      }
      if (alive.current && token === generation.current) {
        setResources(current => {
          const next = rows.map(row => {
            const previous = current?.find(value => value.id === row.id);
            if (previous && previous.revision > row.revision) return previous;
            return previous?.revision === row.revision && JSON.stringify(previous.draft) === JSON.stringify(row.draft)
              ? previous : row;
          });
          return current?.length === next.length && next.every((row, index) => row === current[index]) ? current : next;
        });
        setSources(current => JSON.stringify(current) === JSON.stringify(sources) ? current : sources);
        setTemplate(current => JSON.stringify(current) === JSON.stringify(snapshot) ? current : snapshot);
        setError(undefined);
      }
    }
    catch (reason) {
      if (alive.current && token === generation.current)
        setError(reason instanceof Error ? reason.message : "统一资源暂不可用，旧内容已保留。");
    }
    finally {
      if (alive.current && token === generation.current)
        setLoading(false);
    }
  }, [available, gateway, paperId, runtime]);
  useEffect(() => {
    alive.current = true;
    setLoading(available);
    setResources(null);
    void reload();
    return () => {
      alive.current = false;
      generation.current++;
    };
  }, [reload]);
  useEffect(() => {
    if (!available || !gateway.subscribeChanges)
      return;
    let active = true;
    subscribed.current = false;
    const subscription = gateway.subscribeChanges(change => {
      if (active && (change.paperId === paperId || change.paperId === null))
        void reload();
    });
    void subscription.then(() => { if (active) subscribed.current = true; }).catch(reason => {
      if (active)
        setError(String(reason));
    });
    return () => {
      active = false;
      subscribed.current = false;
      void subscription.then(unlisten => unlisten()).catch(() => undefined);
    };
  }, [available, gateway, paperId, reload]);
  useEffect(() => subscribePaperReadingChanged(paperId, () => void reload(), source.current), [paperId, reload]);
  const changed = useCallback((resource: StructuredResource) => {
    setResources(current => current ? [...current.filter(value => value.id !== resource.id), resource] : [resource]);
    // Canonical gateways already notify both rails. Do not invalidate unrelated legacy
    // candidates/workflows again for each Keep or Undo.
    if (!subscribed.current) {
      publishPaperReadingChanged(paperId, source.current);
      void reload();
    }
  }, [paperId, reload]);
  return {
    resources,
    error,
    loading,
    reload,
    changed,
    gateway,
    available,
    template,
    sources,
    portrait: resources?.find(resource => resource.kind === "portrait"),
    reading: resources?.find(resource => resource.kind === "structuredReading"),
    paperTemplate: resources?.find(resource => resource.kind === "readingTemplate" && resource.paperId === paperId),
  };
}
