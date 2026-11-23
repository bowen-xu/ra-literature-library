import {createElement} from "react";
import type {PluginActivationContext} from "@research-assistant/workbench-sdk/activation";
import {LiteratureWorkspace} from "./public/workspace";
import {ReadingNoteResearchActions} from "./public/research";
import {ReadingTemplateDialog, requestPortraitDetail, libraryNavigationRestore} from "./public/navigation";
import {configureLiteratureServices} from "./services/configureLiteratureServices";

export {LiteratureWorkspace};
export {literatureLibraryManifest} from "./public/manifest";
export {literatureConfiguration as configuration} from "./public/configuration";

/** Register the original production tree and source actions in the same owner. */
export function activate(context: PluginActivationContext): void {
  context.onDispose(configureLiteratureServices(context.literatureRuntime));
  const view = context.registerView({
    id: "library", title: "文献", priority: 300, restore: libraryNavigationRestore,
    reading: {ReadingActions: ReadingNoteResearchActions, ReadingTemplateDialog, requestPortraitDetail},
    render({active, workspace}) {
      if (!workspace) throw new Error("plugin_workspace_host_unavailable:literature_library/library");
      return createElement(LiteratureWorkspace, {...workspace, active});
    },
  });
  context.onDispose(() => view.dispose());
}
