import { useEffect, useRef } from "react";
import type { AnnotationController } from "./AnnotationController";

/** Releases the attachment owner on unmount, without treating StrictMode's
 * synchronous effect cleanup/restart as the end of its reading session. */
export function useAnnotationControllerLifetime(controller: AnnotationController): void {
  const mounted = useRef<AnnotationController | undefined>(undefined);
  useEffect(() => {
    mounted.current = controller;
    return () => {
      mounted.current = undefined;
      queueMicrotask(() => {
        // A restarted effect retains this same owner. Replacement and actual
        // unmount must still release the old controller and its pending work.
        if (mounted.current !== controller) controller.dispose();
      });
    };
  }, [controller]);
}
