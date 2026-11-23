import { useEffect, useState } from "react";
import { LoaderCircle } from "lucide-react";
import "./ReadingDetailsLoading.css";

/** Reveal once per mounted paper; background refreshes keep existing details visible. */
export function useReadingDetailsReady(settled: boolean, onReady?: (ready: boolean) => void): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => { if (settled) setReady(true); }, [settled]);
  useEffect(() => { if (ready) onReady?.(true); }, [ready, onReady]);
  return ready;
}

export function ReadingDetailsLoading(): React.JSX.Element {
  return <div className="paper-reading-details-loading" role="status">
    <LoaderCircle className="paper-reading-loading-spinner" size={18} aria-hidden="true" />
    <span>加载中…</span>
  </div>;
}
