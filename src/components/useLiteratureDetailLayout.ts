import { getAppStorage } from "@research-assistant/workbench-sdk/storage";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type RefObject,
} from "react";

import {
  DEFAULT_DETAIL_PANE_RATIO,
  defaultBasicFieldsForLiteratureType,
  LITERATURE_BASIC_FIELDS,
  LITERATURE_DETAIL_PREFERENCES_STORAGE_KEY,
  detailPaneRatioFromWidth,
  normalizeLiteratureDetailPreferences,
  resolveLiteratureDetailWidth,
  type LiteratureBasicFieldKey,
} from "./literatureDetailModel";
import type { LiteratureType } from "@research-assistant/core/literature";
import { useVisibleLayoutMeasurement } from "@research-assistant/workbench-sdk/layout";

function loadPreferences() {
  try {
    return normalizeLiteratureDetailPreferences(JSON.parse(
      getAppStorage().getItem(LITERATURE_DETAIL_PREFERENCES_STORAGE_KEY) ?? "{}",
    ));
  } catch {
    return normalizeLiteratureDetailPreferences(undefined);
  }
}

interface LiteratureDetailLayout {
  readonly basicFields: readonly LiteratureBasicFieldKey[];
  readonly gridRef: RefObject<HTMLDivElement | null>;
  readonly gridStyle: CSSProperties;
  readonly toggleBasicField: (field: LiteratureBasicFieldKey) => void;
  readonly resetBasicFields: (itemType: LiteratureType) => void;
  readonly startResize: (event: PointerEvent<HTMLButtonElement>) => void;
  readonly resetPaneWidth: () => void;
  readonly handleSeparatorKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
}

export function useLiteratureDetailLayout(): LiteratureDetailLayout {
  const [preferences, setPreferences] = useState(loadPreferences);
  const [containerWidth, setContainerWidth] = useState(1_200);
  const gridRef = useRef<HTMLDivElement>(null);
  const resizeCleanupRef = useRef<() => void>(() => undefined);

  useEffect(() => () => resizeCleanupRef.current(), []);
  useEffect(() => {
    try {
      getAppStorage().setItem(
        LITERATURE_DETAIL_PREFERENCES_STORAGE_KEY,
        JSON.stringify(preferences),
      );
    } catch {
      // Layout preferences are optional; storage failures must not block the library.
    }
  }, [preferences]);

  useVisibleLayoutMeasurement(() => gridRef.current, (_element, bounds) => setContainerWidth(bounds.width));

  const setDetailWidth = useCallback((detailWidth: number): void => {
    setPreferences((current) => ({
      ...current,
      detailPaneRatio: detailPaneRatioFromWidth(containerWidth, detailWidth),
    }));
  }, [containerWidth]);

  const startResize = useCallback((event: PointerEvent<HTMLButtonElement>): void => {
    event.preventDefault();
    resizeCleanupRef.current();
    const startX = event.clientX;
    const startWidth = resolveLiteratureDetailWidth(containerWidth, preferences.detailPaneRatio);
    const onMove = (moveEvent: globalThis.PointerEvent): void => {
      setDetailWidth(startWidth + startX - moveEvent.clientX);
    };
    const onEnd = (): void => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onEnd);
      window.removeEventListener("pointercancel", onEnd);
      resizeCleanupRef.current = () => undefined;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onEnd);
    window.addEventListener("pointercancel", onEnd);
    resizeCleanupRef.current = onEnd;
  }, [containerWidth, preferences.detailPaneRatio, setDetailWidth]);

  const resetPaneWidth = useCallback(() => {
    setPreferences((current) => ({ ...current, detailPaneRatio: DEFAULT_DETAIL_PANE_RATIO }));
  }, []);

  const handleSeparatorKeyDown = useCallback((event: KeyboardEvent<HTMLButtonElement>): void => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const width = resolveLiteratureDetailWidth(containerWidth, preferences.detailPaneRatio);
    setDetailWidth(width + (event.key === "ArrowLeft" ? 10 : -10));
  }, [containerWidth, preferences.detailPaneRatio, setDetailWidth]);

  const toggleBasicField = useCallback((field: LiteratureBasicFieldKey): void => {
    setPreferences((current) => {
      const selected = new Set(current.basicFields);
      if (selected.has(field)) selected.delete(field);
      else selected.add(field);
      return {
        ...current,
        basicFields: LITERATURE_BASIC_FIELDS
          .map((definition) => definition.key)
          .filter((key) => selected.has(key)),
      };
    });
  }, []);

  const resetBasicFields = useCallback((itemType: LiteratureType) => {
    setPreferences((current) => ({ ...current, basicFields: defaultBasicFieldsForLiteratureType(itemType) }));
  }, []);

  const detailWidth = resolveLiteratureDetailWidth(containerWidth, preferences.detailPaneRatio);
  const gridStyle = useMemo(() => ({
    "--literature-detail-width": `${detailWidth}px`,
  }) as CSSProperties, [detailWidth]);

  return {
    basicFields: preferences.basicFields,
    gridRef,
    gridStyle,
    toggleBasicField,
    resetBasicFields,
    startResize,
    resetPaneWidth,
    handleSeparatorKeyDown,
  };
}
