import { useState, type ReactNode } from "react";
import { ReadingDetailsLoading } from "../features/ai/ReadingDetailsLoading";

/** The caller keys this owner by paper and trash state, preserving parallel child reads. */
export function LiteratureDetailContent({ hasReadingDetails, children }: {
  readonly hasReadingDetails: boolean;
  readonly children: (onReady: (ready: boolean) => void) => ReactNode;
}): React.JSX.Element {
  const [ready, setReady] = useState(!hasReadingDetails);
  return <div className="literature-detail-content" aria-busy={!ready}>
    {!ready && <ReadingDetailsLoading />}
    <div hidden={!ready}>{children(setReady)}</div>
  </div>;
}
