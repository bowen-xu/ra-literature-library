# 文献管理插件

独立 Git submodule 和 pnpm 工程，当前已建立 TypeScript 迁移目录。

| 目录 | 职责 |
|---|---|
| `src` | 生产前端、公开入口与激活 |
| `backend/src` | 文献领域规则与固定资源 |
| `host/src` | Node 宿主与有限协议适配 |
| `preview/src` | 公开 Workbench 宿主上的数据适配预览 |
| `tests/contracts` | 插件自有领域与协议验收 |

## 迁移状态

归档文献插件的 TypeScript 前端、公开入口、预览树和固定 SQL 资源已经整体迁入本
submodule；当前没有活跃 Rust/Cargo 文件。`backend/src` 与 `host/src` 仍在进行领域
实现和宿主协议接线，预览中的历史 Tauri 命名适配器也将在 Electron 公共运行时修复轮
替换。迁移证据与检查命令见父仓
`docs/migration/stages-4/literature-source-transfer-2026-11-24.md`。

Core 拥有 SQL、文件字节、共享 Agent 与事务执行，插件通过版本化公开契约消费这些能力。
依赖、锁文件和严格 TypeScript 配置由本工程维护，可执行入口随能力迁移加入。
