# ra-literature-library

文献管理插件，初始版本为 0.1.0。源码、公开入口、资源、锁文件和测试由本工程维护。

## 独立构建

以下命令在本工程根目录执行。SDK 成品目录由其 `artifacts/sdk/latest.json`
定位，目录内包含 `sdk-artifacts.json` 和安装器。

```sh
pnpm sdk:install /absolute/path/to/sdk-package
pnpm install --frozen-lockfile
cargo fetch --locked --manifest-path native/Cargo.toml
pnpm build
pnpm typecheck
```

SDK 安装在本工程 `.dependencies/sdk/`。`pnpm build` 生成包含 manifest、前端
资源和 Native 程序的完整插件包，执行原有源码闭包、兼容、共享实例、资源和许可证校验。
Native 构建使用锁定依赖的离线编译，首次 `cargo fetch` 用于准备其依赖缓存。
已准备好全部依赖缓存时，可运行 `pnpm build --offline` 要求前端安装阶段也离线执行。

只生成 Native 领域包时执行以下命令。

```sh
pnpm build:native
```

## 测试

```sh
RA_WORKBENCH_SDK_DIRECTORY=/absolute/path/to/workbench/apps/web/dist pnpm test
pnpm test:native
pnpm test:build
```

UI 测试消费 Workbench 已构建的 /sdk/v1/，沿用生产包相同的 external 路径映射。纯领域测试使用本工程夹具。
Core 实现测试留在 Workbench，单插件协作测试消费公开 SDK、Native 协议或公开
测试宿主，完整产品组合验收由父仓负责。

`native/tests/` 保存候选、证据引用和长 PDF 页预算的公开契约回归。页预算夹具直接
提供与原数据库夹具相同的公开观察 DTO，原有预算、排序与稳定身份断言保留。

Native 依赖 SDK 的有限协议与 `agent-api`。Core 自身测试使用 Core 的固定契约
输入，真实包集成通过指定的预构建 Native 包及公开协议执行。

## 独立预览

`preview/` 持有 NAL 编辑器与文献领域 Mock，使用公开的
`@research-assistant/workbench-preview` 开发包。预览及协作测试需要先将选定版本的
公开宿主安装到 `preview/.dependencies/workbench-preview/`，并安装 `preview/` 的依赖。
SDK 依赖继续来自本工程的 `.dependencies/sdk/`。

父仓库联调时，在父仓库根目录执行 `pnpm prepare:previews` 自动准备这些公开产物
与依赖。随后回到本工程选择以下命令。

```sh
pnpm dev:preview
pnpm build:preview
pnpm typecheck:preview
pnpm test:preview
```

公开开发模块由 `preview/public-modules.json` 列出。

## 构建缓存与产物

| 路径 | 内容 |
|---|---|
| `artifacts/plugin/latest.json` | 当前完整插件包与回执 |
| `artifacts/native/latest.json` | 当前独立 Native 领域包 |
| `artifacts/preview/latest.json` | 当前公开预览包 |
| `.cache/cargo/native/` | Native 包构建的持久 Cargo 缓存 |
| `native/target/` | 直接执行 Native 检查与测试产生的 Cargo 缓存 |
| `.cache/build/` | 构建输入到已有包的索引 |
| `.cache/logs/` | 按次保存的构建日志 |
| `.cache/work/` | 隔离构建工作目录 |
| `node_modules/.vite/`、`preview/node_modules/.vite/` | Vite／Vitest 缓存 |

标准构建入口校验并复用 `artifacts/<kind>/<内容哈希>/package/` 中的完整产物。
回执随产物保存。清理编译缓存后，同输入构建仍可复用已保存的当前包。

工程位于 Research Assistant 父仓库时，可在父仓库根目录运行统一清理入口。

```sh
pnpm clean:cache literature --dry-run
pnpm clean:cache literature
pnpm clean:cache literature --kind logs
```

默认清理编译缓存并保留构建索引。`--kind logs` 选择构建日志，`--kind all`
还清理构建索引及残留隔离工作目录。索引清除后，构建工具回退核对当前
`latest.json` 对应的包，其他历史输入组合可能重新构建。清理范围与命令说明见
父仓库 README 的缓存章节。
