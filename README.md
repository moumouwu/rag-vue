# rag-vue

`rag-vue` 是知识库系统的前端目录，当前已补齐一套最小可用的 Vue 3 + TypeScript + Vite 工程骨架，并接入了聊天联调与任务中心联调页面。

## 启动方式

1. 复制环境变量模板：

```powershell
Copy-Item .env.example .env.local
```

2. 安装依赖：

```powershell
pnpm install
```

3. 启动开发环境：

```powershell
pnpm dev
```

4. 构建检查：

```powershell
pnpm build
```

## 环境变量

- `VITE_API_BASE_URL`：后端接口基础地址，例如 `http://localhost:8080`
- `VITE_ACCESS_TOKEN_STORAGE_KEY`：浏览器 `localStorage` 中 Bearer Token 的存储键名

## 当前范围

- 提供聊天联调工作台
- 提供任务中心联调工作台
- 复用 `src/api` 和 `src/types` 中的接口契约定义
- 暂不包含路由、Pinia、鉴权页和完整业务页面
