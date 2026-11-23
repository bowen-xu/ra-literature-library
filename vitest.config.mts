import {defineConfig, type Plugin} from "vitest/config";
import production from "./vite.config.ts";
import {existsSync} from "node:fs";
import {fileURLToPath, pathToFileURL} from "node:url";
const paths = (production.build!.rolldownOptions!.output as {paths: (id: string) => string}).paths;
const toolingPath = fileURLToPath(new URL("./.dependencies/sdk/tooling/runtime-sdk-tests.mjs", import.meta.url));
let runtimeSdkTestPlugin: ((paths: (id: string) => string) => Plugin) | undefined;
if (existsSync(toolingPath)) {
  const module = await import(pathToFileURL(toolingPath).href) as {readonly runtimeSdkTestPlugin: (paths: (id: string) => string) => Plugin};
  runtimeSdkTestPlugin = module.runtimeSdkTestPlugin;
}
export default defineConfig({plugins: runtimeSdkTestPlugin === undefined ? [] : [runtimeSdkTestPlugin(paths)], test: {
  exclude: ["preview/**", "artifacts/**", ".cache/**", "**/node_modules/**", ".tmp/**", ".dependencies/**", "build/**", "backend/**", "host/**", "scripts/*.test.mjs"],
  execArgv: process.allowedNodeEnvironmentFlags.has("--no-experimental-webstorage") ? ["--no-experimental-webstorage"] : [],
}});
