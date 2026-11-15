import {useEffect, useMemo, useState} from "react";
import {useNoteAnnotations, useNoteResourceVersion} from "@research-assistant/workbench-sdk/note-resources";
import type {AnnotationController} from "./AnnotationController";

/** First mount still loads recovery state, even for a restored hidden reader.
 * Subsequent hidden invalidations are merged until that reader is shown. */
export function useAnnotationRefreshVersion(controller: AnnotationController, active: boolean): number {
  const client = useNoteAnnotations(), version = useNoteResourceVersion();
  const [refresh, setRefresh] = useState(0);
  const observation = useMemo(() => ({version: client.getVersion(), dirty: false}), [client, controller]);
  useEffect(() => {
    const changes = client.getChangesSince(observation.version);
    observation.version = client.getVersion();
    const annotations = controller.getSnapshot().annotations;
    if (changes.some(change => change.kind !== "document" || annotations.some(note =>
      note.pageId === change.pageId || String(note.id) === String(change.pageId)))) observation.dirty = true;
    if (active && observation.dirty) {
      observation.dirty = false;
      setRefresh(value => value + 1);
    }
  }, [active, client, controller, observation, version]);
  return refresh;
}
