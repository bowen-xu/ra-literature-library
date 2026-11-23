import {StrictMode} from "react";
import {createRoot} from "react-dom/client";
import {ApplicationKeyboardPolicy} from "@research-assistant/workbench-preview/application-keyboard-policy";
import {NalEditorPreview} from "./nal/NalEditorPreview";
import "@research-assistant/workbench-preview/styles/global";
createRoot(document.getElementById("root")!).render(<StrictMode><NalEditorPreview keyboardPolicy={<ApplicationKeyboardPolicy/>}/></StrictMode>);
