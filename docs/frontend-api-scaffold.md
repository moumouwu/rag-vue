# rag-vue 前端 API Scaffold 约定

## 1. 目标

当前 `rag-vue` 已初始化为最小可用的 Vue 3 + TypeScript + Vite 工程。这一批文件先用于冻结前端 API 接入边界，并提供聊天联调、任务中心联调两个工作台页面，确保后续页面开发可以直接复用，不需要再从零整理接口类型。

本批脚手架严格对齐以下接口草案：

- 后端 OpenAPI 草案：`ragboot/src/main/resources/openapi/rag-demo-openapi-draft.yaml`
- 前后端联调约定：`_bmad-output/implementation-artifacts/frontend-backend-api-contract.md`

## 2. 目录结构

```text
rag-vue/
  src/
    api/
      index.ts
      request.ts
      modules/
        chat.ts
        task.ts
    types/
      common.ts
      chat.ts
      task.ts
      index.ts
  docs/
    frontend-api-scaffold.md
```

职责说明：

- `src/types`：只放接口契约相关类型，不放页面状态。
- `src/api/request.ts`：统一请求入口、Token 注入、错误结构归一化。
- `src/api/modules/chat.ts`：聊天会话、发送消息、引用、执行记录接口。
- `src/api/modules/task.ts`：任务中心列表、详情、子任务、重试、批量重跑接口。

## 3. 接入约定

### 3.1 请求层约定

- 当前使用原生 `fetch` 封装，不依赖 `axios`，目的是先保持依赖最小、接口边界清晰。
- 页面层直接拿 `data`，失败场景统一抛出 `ApiRequestError`。
- 统一错误结构按后端草案对齐：`code`、`message`、`retryable`、`requestId`、`stageCode`、`timestamp`。
- `Authorization` 通过 `configureApiClient` 注入，不在模块层耦合 Pinia、Vuex 或具体登录方案。

### 3.2 聊天域约定

- `createSession` 对应创建会话。
- `pageSessions` 对应会话分页查询。
- `getSessionDetail` 返回消息列表摘要，不包含完整执行日志。
- `sendMessage` 支持 `selectedDocumentIds`，用于本轮会话的多选文档范围限定。
- `getCitations` 返回引用明细，默认由后端按 `displayRank` 排序。
- `getExecutionDetail` 用于查看一次问答执行链路详情。

### 3.3 任务域约定

- `pageTasks` 面向任务中心主列表。
- `getTaskDetail` 面向单个任务详情与时间线。
- `pageChildTasks` 面向批处理任务下的子任务列表。
- `retryTask` 约定为创建新任务，不覆盖原任务。
- `batchRerun` 面向批量重跑入口。

## 4. 初始化示例

后续 Vue 3 工程初始化完成后，可在应用启动阶段注入：

```ts
import { configureApiClient } from '@/api';

configureApiClient({
  baseUrl: '',
  getAccessToken: () => localStorage.getItem('token'),
});
```

页面中调用示例：

```ts
import { chatApi } from '@/api';

const sessionPage = await chatApi.pageSessions({
  pageNo: 1,
  pageSize: 20,
  sortBy: 'lastMessageTime',
  sortOrder: 'desc',
});
```

## 5. 当前边界

- 这一批已包含最小 UI 工作台页面，但仍属于联调骨架，不是正式业务前端。
- 这一批没有生成自动化代码，也没有接 OpenAPI generator，目的是先稳定字段边界，再决定后续生成策略。
- 如果后端 OpenAPI 草案字段发生变化，应先改 `src/types` 和 `src/api`，再推进页面联调，避免页面层直接依赖漂移字段。
- 当前已完成前端工程初始化，并执行过一次 `pnpm build` 构建验证。
