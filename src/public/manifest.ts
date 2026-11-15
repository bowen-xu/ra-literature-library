import type {BuiltinPluginManifest} from "@research-assistant/workbench-sdk";

/** Pure build and application declaration; importing it cannot load the workspace. */
export const literatureLibraryManifest = {
  id: "literature_library",
  apiVersion: 1,
  dependencies: { required: [], optional: [] },
  provides: [{ id: "literature.catalog", version: 1 }, { id: "literature.citations", version: 1 }],
  consumes: {
    required: ["core.workbench", "core.workbench.source-workspace-host", "core.sdk.literature-shared", "core.structured-resources.write-diagnostics", "core.notes", "core.editor", "core.hbs", "core.agent", "core.agent.tools", "core.resources", "core.pdf", "core.models", "core.docling", "core.platform", "core.platform.confirmation"]
      .map(id => ({ id, version: 1, provider: "core" })),
    optional: ["core.agent.skills", "core.agent.mcp"].map(id => ({id, version: 1, provider: "core"})),
  },
} as const satisfies BuiltinPluginManifest;
