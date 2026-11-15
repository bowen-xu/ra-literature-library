import {defineConfig, type Plugin} from "vite";
import react from "@vitejs/plugin-react";
import {fileURLToPath} from "node:url";

const sdk = "@research-assistant/workbench-sdk";
const sdkLeaves = new Set([
  "agent-context", "agent-ui", "ai-assistance", "annotation-notes", "block-controls", "concept-retrieval",
  "configuration-hooks", "dictionary", "docling", "document-recovery", "documents", "environment", "feedback",
  "hbs", "layout", "library-capture", "literature-notes", "literature-runtime", "model-route-picker", "note-resources",
  "overlay", "pdf", "pdf-geometry", "platform", "reorder", "settings", "shortcuts", "source-navigation", "storage",
  "structured-field-colors", "structured-resources", "text-documents", "ui", "workbench", "workspace-state",
]);
const bareModules: Readonly<Record<string, string>> = {
  "@research-assistant/core/agent": "core-agent", "@research-assistant/core/ai": "core-ai",
  "@research-assistant/core/citation": "core-citation", "@research-assistant/core/collections": "core-collections",
  "@research-assistant/core/content-trust": "core-content-trust", "@research-assistant/core/dictionary": "core-dictionary",
  "@research-assistant/core/hbs": "core-hbs", "@research-assistant/core/knowledge": "core-knowledge",
  "@research-assistant/core/literature": "core-literature", "@research-assistant/core/nal": "core-nal",
  "@research-assistant/core/notes": "core-notes", "@research-assistant/core/reader": "core-reader",
  "@research-assistant/core/source": "core-source", "@research-assistant/core/structured-resources": "core-structured-resources",
  "@research-assistant/core/synthesis": "core-synthesis", "@research-assistant/data/hbs": "data-hbs",
  "@research-assistant/data/notes": "data-notes", "@ariakit/react": "ariakit-react",
  "pdfjs-dist/legacy/build/pdf.mjs": "pdfjs", "pdfjs-dist/legacy/build/pdf.worker.mjs?url": "pdfjs-worker",
  "react": "react", "react/jsx-runtime": "react-jsx-runtime", "react/jsx-dev-runtime": "react-jsx-dev-runtime",
  "react-dom": "react-dom", "react-dom/client": "react-dom-client",
};
const sharedPath = (id: string): string | undefined => {
  if (id === sdk) return "/sdk/v1/index.js";
  if (id.startsWith(sdk + "/") && sdkLeaves.has(id.slice(sdk.length + 1))) return "/sdk/v1/" + id.slice(sdk.length + 1) + ".js";
  return bareModules[id] ? "/sdk/v1/" + bareModules[id] + ".js" : undefined;
};

function independentClosure(): Plugin {
  return {
    name: "literature-library-independent-closure",
    generateBundle() {
      const modules = [...this.getModuleIds()].filter(id => !id.startsWith("\0")).sort();
      const forbidden = modules.filter(id => /\/apps\/(?:web|desktop)\/|\/src\/(?:core|app)\/|\/node_modules\/(?:\.pnpm\/)?(?:react(?:@|\/)|react-dom(?:@|\/)|pdfjs-dist(?:@|\/)|@ariakit\/)|\/node_modules\/@research-assistant\/(?:core|data|workbench-sdk)\//u.test(id));
      if (forbidden.length) this.error("plugin_build_closure_violation:\n" + forbidden.join("\n"));
      this.emitFile({type: "asset", fileName: "source-closure.json", source: JSON.stringify({
        modules, sharedImports: modules.filter(id => sharedPath(id) !== undefined),
      }, null, 2)});
    },
  };
}

export default defineConfig({
  plugins: [react(), independentClosure()],
  build: {
    outDir: "build", emptyOutDir: true,
    lib: {entry: fileURLToPath(new URL("./src/index.ts", import.meta.url)), formats: ["es"], fileName: () => "entry.js", cssFileName: "style"},
    rolldownOptions: {external: id => sharedPath(id) !== undefined, output: {paths: id => sharedPath(id) ?? id}},
  },
});
