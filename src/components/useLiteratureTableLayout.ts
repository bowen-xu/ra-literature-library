import { useRef, useState, type RefObject } from "react";
import { useVisibleLayoutMeasurement } from "@research-assistant/workbench-sdk/layout";
import {
  createLiteratureGridTemplate,
  fitLiteratureColumns,
  type LiteratureColumn,
} from "./literatureTableModel";

interface LiteratureTableLayout {
  readonly scrollRef: RefObject<HTMLDivElement | null>;
  readonly gridTemplate: string;
  readonly tableWidth: number;
}

export function useLiteratureTableLayout(columns: readonly LiteratureColumn[]): LiteratureTableLayout {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [availableWidth, setAvailableWidth] = useState<number>();
  useVisibleLayoutMeasurement(() => scrollRef.current, element => {
    // clientWidth excludes the vertical scrollbar and its reserved gutter.
    if (element.clientWidth > 0) setAvailableWidth(element.clientWidth);
  });
  const fitted = availableWidth === undefined ? columns : fitLiteratureColumns(columns, availableWidth);
  return {
    scrollRef,
    gridTemplate: createLiteratureGridTemplate(fitted),
    tableWidth: fitted.reduce((total, column) => total + column.width, 0),
  };
}
