import { createContext, useContext } from "react";

/** Hosts constrain the shared editor to the structures their gateway can store. */
export interface NalEditorPolicy {
  readonly purpose: "query" | "statements";
  readonly paperBinding?: string;
}
export const NalEditorPolicyContext = createContext<NalEditorPolicy>({ purpose: "query" });
export function useNalEditorPolicy(): NalEditorPolicy { return useContext(NalEditorPolicyContext); }
