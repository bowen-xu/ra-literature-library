# ra-literature-library

文献管理插件，初始版本为 0.1.0。源码、公开入口、资源、锁文件和测试由本工程维护。

## 独立构建

```sh
pnpm sdk:install -- /path/to/sdk-artifacts
pnpm install --frozen-lockfile
pnpm build --offline
pnpm typecheck
```

SDK 来自版本化公开产物，安装在本工程 .dependencies/sdk/。构建复用原有源码闭包、兼容、共享实例、资源和许可证校验。可复用插件包及回执位于 artifacts/plugin/，Native 独立包位于 artifacts/native/。

## 测试

```sh
RA_WORKBENCH_SDK_DIRECTORY=/path/to/workbench-web-dist pnpm test
pnpm test:native
pnpm test:build
pnpm build:test-support
```

UI 测试消费 Workbench 已构建的 /sdk/v1/，沿用生产包相同的 external 路径映射。纯领域测试使用本工程夹具。
Core 实现测试留在 Workbench，单插件协作测试消费公开 SDK、Native 协议或公开
测试宿主，完整产品组合验收由父仓负责。

`native/tests/` 保存候选、证据引用和长 PDF 页预算的公开契约回归。页预算夹具直接
提供与原数据库夹具相同的公开观察 DTO，原有预算、排序与稳定身份断言保留。

Native 依赖 SDK 的有限协议与 agent-api。测试支持源码产物用于 Core 的现有回归，由本工程单独打包并记录版本与完整性。

## 独立预览

preview/ 持有NAL 编辑器与文献领域 Mock，使用公开的 @research-assistant/workbench-preview 开发包。
父仓 pnpm prepare:previews 准备公开依赖后，可在本项目运行 pnpm dev:preview、pnpm build:preview 和 pnpm typecheck:preview。
公开开发模块由 preview/public-modules.json 列出，产物保存在 artifacts/preview/。

## 构建缓存与产物

标准构建入口复用通过完整性校验的既有包。产物在本工程 `artifacts/<kind>/<内容哈希>/package/`，当前入口在 `artifacts/<kind>/latest.json`。回执随产物保存，`.cache/build` 保存索引，`.cache/logs` 保存日志，`.cache/work` 为完成后清理的隔离工作目录。清理编译缓存后仍可复用已保存的当前包。
