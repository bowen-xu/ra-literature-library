# 文献管理插件

独立 Git submodule 和 pnpm 工程，当前已建立 TypeScript 迁移目录。

| 目录 | 职责 |
|---|---|
| `src` | 生产前端、公开入口与激活 |
| `backend/src` | 文献领域规则与固定资源 |
| `host/src` | Node 宿主与有限协议适配 |
| `preview/src` | 公开 Workbench 宿主上的数据适配预览 |
| `tests/contracts` | 插件自有领域与协议验收 |

Core 拥有 SQL、文件字节、共享 Agent 与事务执行，插件通过版本化公开契约消费这些能力。
依赖、锁文件和严格 TypeScript 配置由本工程维护，可执行入口随能力迁移加入。
