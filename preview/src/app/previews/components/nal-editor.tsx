import { ApplicationKeyboardPolicy } from "@research-assistant/workbench-preview/application-keyboard-policy";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { NalEditorPreview } from "../../../../nal/NalEditorPreview";
import "@research-assistant/workbench-preview/styles/global";

const root = document.getElementById("root");
if (!root) throw new Error("NAL_EDITOR_PREVIEW_ROOT_MISSING");
createRoot(root).render(<StrictMode><NalEditorPreview keyboardPolicy={<ApplicationKeyboardPolicy />} /></StrictMode>);
