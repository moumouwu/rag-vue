<script setup lang="ts">
import { reactive, ref } from 'vue';
import { chatApi } from '@/api';
import type {
  BindingObjectType,
  ChatExecutionDetailData,
  ChatMode,
  ChatSessionDetailData,
  ChatSessionSummary,
  CitationDetailItem,
  RetentionStatus,
  SendMessageData,
  SortOrder,
} from '@/types';
import { formatJson, getErrorMessage, normalizeOptionalText, splitTextToIds } from '@/utils/api-feedback';

interface SessionPageForm {
  keyword: string;
  chatMode: ChatMode | '';
  retentionStatus: RetentionStatus | '';
  pageNo: number;
  pageSize: number;
  sortBy: string;
  sortOrder: SortOrder;
}

interface CreateSessionForm {
  chatMode: ChatMode;
  bindingObjectType: BindingObjectType;
  bindingObjectId: string;
  knowledgeBindingType: string;
  knowledgeBindingIdsText: string;
  firstMessageContent: string;
}

interface MessageForm {
  sessionId: string;
  messageContent: string;
  selectedDocumentIdsText: string;
  templateVariablesText: string;
}

interface TraceForm {
  sessionId: string;
  messageId: string;
  executionId: string;
}

const sessionPageForm = reactive<SessionPageForm>({
  keyword: '',
  chatMode: 'knowledge_base',
  retentionStatus: '',
  pageNo: 1,
  pageSize: 10,
  sortBy: 'lastMessageTime',
  sortOrder: 'desc',
});

const createSessionForm = reactive<CreateSessionForm>({
  chatMode: 'knowledge_base',
  bindingObjectType: 'knowledge_base',
  bindingObjectId: '',
  knowledgeBindingType: '',
  knowledgeBindingIdsText: '',
  firstMessageContent: '',
});

const messageForm = reactive<MessageForm>({
  sessionId: '',
  messageContent: '',
  selectedDocumentIdsText: '',
  templateVariablesText: '{}',
});

const traceForm = reactive<TraceForm>({
  sessionId: '',
  messageId: '',
  executionId: '',
});

const loading = reactive({
  paging: false,
  creating: false,
  sessionDetail: false,
  sending: false,
  citations: false,
  execution: false,
});

const successMessage = ref('');
const errorMessage = ref('');
const sessionRows = ref<ChatSessionSummary[]>([]);
const sessionTotal = ref(0);
const sessionDetail = ref<ChatSessionDetailData | null>(null);
const latestReply = ref<SendMessageData | null>(null);
const citations = ref<CitationDetailItem[]>([]);
const executionDetail = ref<ChatExecutionDetailData | null>(null);

function resetFeedback(): void {
  successMessage.value = '';
  errorMessage.value = '';
}

function setSuccess(message: string): void {
  successMessage.value = message;
  errorMessage.value = '';
}

function setError(error: unknown): void {
  successMessage.value = '';
  errorMessage.value = getErrorMessage(error);
}

function parseTemplateVariables(rawText: string): Record<string, unknown> | undefined {
  const value = rawText.trim();
  if (!value) {
    return undefined;
  }

  // 这里强制要求对象结构，避免模板变量误传数组或基础类型。
  const parsed = JSON.parse(value) as unknown;
  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
    throw new Error('模板变量必须是 JSON 对象');
  }

  return parsed as Record<string, unknown>;
}

async function handlePageSessions(): Promise<void> {
  resetFeedback();
  loading.paging = true;
  try {
    const pageData = await chatApi.pageSessions({
      keyword: normalizeOptionalText(sessionPageForm.keyword),
      chatMode: sessionPageForm.chatMode || undefined,
      retentionStatus: sessionPageForm.retentionStatus || undefined,
      pageNo: sessionPageForm.pageNo,
      pageSize: sessionPageForm.pageSize,
      sortBy: sessionPageForm.sortBy,
      sortOrder: sessionPageForm.sortOrder,
    });
    sessionRows.value = pageData.list;
    sessionTotal.value = pageData.total;
    setSuccess(`会话查询完成，共返回 ${pageData.total} 条记录`);
  } catch (error) {
    setError(error);
  } finally {
    loading.paging = false;
  }
}

async function loadSessionDetail(sessionId: string): Promise<void> {
  resetFeedback();
  loading.sessionDetail = true;
  try {
    const detailData = await chatApi.getSessionDetail(sessionId);
    sessionDetail.value = detailData;
    messageForm.sessionId = detailData.sessionId;
    traceForm.sessionId = detailData.sessionId;
    setSuccess(`已加载会话 ${detailData.sessionId} 的消息明细`);
  } catch (error) {
    setError(error);
  } finally {
    loading.sessionDetail = false;
  }
}

async function handleCreateSession(): Promise<void> {
  resetFeedback();
  loading.creating = true;
  try {
    if (!createSessionForm.bindingObjectId.trim()) {
      throw new Error('绑定对象 ID 不能为空');
    }

    const createdSession = await chatApi.createSession({
      chatMode: createSessionForm.chatMode,
      bindingObjectType: createSessionForm.bindingObjectType,
      bindingObjectId: createSessionForm.bindingObjectId.trim(),
      knowledgeBindingType: normalizeOptionalText(createSessionForm.knowledgeBindingType) ?? null,
      knowledgeBindingIds: splitTextToIds(createSessionForm.knowledgeBindingIdsText),
      firstMessageContent: normalizeOptionalText(createSessionForm.firstMessageContent) ?? null,
    });
    messageForm.sessionId = createdSession.sessionId;
    traceForm.sessionId = createdSession.sessionId;
    setSuccess(`会话创建成功：${createdSession.sessionId}`);
    await loadSessionDetail(createdSession.sessionId);
  } catch (error) {
    setError(error);
  } finally {
    loading.creating = false;
  }
}

async function handleSendMessage(): Promise<void> {
  resetFeedback();
  loading.sending = true;
  try {
    if (!messageForm.sessionId.trim()) {
      throw new Error('会话 ID 不能为空');
    }
    if (!messageForm.messageContent.trim()) {
      throw new Error('问题内容不能为空');
    }

    const replyData = await chatApi.sendMessage(messageForm.sessionId, {
      messageContent: messageForm.messageContent.trim(),
      selectedDocumentIds: splitTextToIds(messageForm.selectedDocumentIdsText),
      templateVariables: parseTemplateVariables(messageForm.templateVariablesText),
    });
    latestReply.value = replyData;
    traceForm.messageId = replyData.assistantMessageId;
    setSuccess(`消息发送成功，AI 消息标识：${replyData.assistantMessageId}`);
    await loadSessionDetail(messageForm.sessionId);
  } catch (error) {
    setError(error);
  } finally {
    loading.sending = false;
  }
}

async function handleLoadCitations(): Promise<void> {
  resetFeedback();
  loading.citations = true;
  try {
    if (!traceForm.sessionId.trim()) {
      throw new Error('查询引用时，会话 ID 不能为空');
    }
    if (!traceForm.messageId.trim()) {
      throw new Error('查询引用时，消息 ID 不能为空');
    }

    const citationList = await chatApi.getCitations(traceForm.sessionId, traceForm.messageId);
    citations.value = citationList;
    setSuccess(`已查询到 ${citationList.length} 条引用明细`);
  } catch (error) {
    setError(error);
  } finally {
    loading.citations = false;
  }
}

async function handleLoadExecution(): Promise<void> {
  resetFeedback();
  loading.execution = true;
  try {
    if (!traceForm.executionId.trim()) {
      throw new Error('执行记录 ID 不能为空');
    }

    const detailData = await chatApi.getExecutionDetail(traceForm.executionId);
    executionDetail.value = detailData;
    setSuccess(`已加载执行记录 ${detailData.executionId}`);
  } catch (error) {
    setError(error);
  } finally {
    loading.execution = false;
  }
}
</script>

<template>
  <div class="view-shell">
    <div>
      <h2 class="view-shell__title">聊天联调工作台</h2>
      <p class="view-shell__desc">
        适合先联调会话创建、消息发送、引用核验和执行记录四个关键动作。
      </p>
    </div>

    <div v-if="successMessage" class="status-banner status-banner--success">
      {{ successMessage }}
    </div>
    <div v-if="errorMessage" class="status-banner status-banner--error">
      {{ errorMessage }}
    </div>

    <div class="panel-grid">
      <div class="panel-stack">
        <section class="panel">
          <div class="panel__header">
            <div>
              <h3 class="panel__title">会话分页查询</h3>
              <p class="panel__desc">用于验证列表接口、分页参数和主状态字段。</p>
            </div>
            <span class="badge">总数：{{ sessionTotal }}</span>
          </div>

          <form class="form-grid" @submit.prevent="handlePageSessions">
            <label class="field">
              <span class="field__label">关键字</span>
              <input v-model="sessionPageForm.keyword" class="input" placeholder="例如：请假、审批" />
            </label>
            <label class="field">
              <span class="field__label">聊天模式</span>
              <select v-model="sessionPageForm.chatMode" class="select">
                <option value="">全部</option>
                <option value="knowledge_base">knowledge_base</option>
                <option value="prompt_template">prompt_template</option>
              </select>
            </label>
            <label class="field">
              <span class="field__label">冷热状态</span>
              <select v-model="sessionPageForm.retentionStatus" class="select">
                <option value="">全部</option>
                <option value="hot">hot</option>
                <option value="cold">cold</option>
              </select>
            </label>
            <label class="field">
              <span class="field__label">排序字段</span>
              <input v-model="sessionPageForm.sortBy" class="input" placeholder="lastMessageTime" />
            </label>
            <label class="field">
              <span class="field__label">页码</span>
              <input v-model.number="sessionPageForm.pageNo" class="input" type="number" min="1" />
            </label>
            <label class="field">
              <span class="field__label">每页数量</span>
              <input v-model.number="sessionPageForm.pageSize" class="input" type="number" min="1" max="100" />
            </label>
            <label class="field">
              <span class="field__label">排序方向</span>
              <select v-model="sessionPageForm.sortOrder" class="select">
                <option value="desc">desc</option>
                <option value="asc">asc</option>
              </select>
            </label>
            <div class="field">
              <span class="field__label">动作</span>
              <div class="action-row" style="margin-top: 0;">
                <button class="button button--primary" type="submit" :disabled="loading.paging">
                  {{ loading.paging ? '查询中...' : '查询会话' }}
                </button>
              </div>
            </div>
          </form>

          <div class="data-card" style="margin-top: 18px;">
            <h4 class="data-card__title">会话列表结果</h4>
            <div v-if="sessionRows.length" class="table-wrap">
              <table class="table">
                <thead>
                  <tr>
                    <th>会话 ID</th>
                    <th>标题摘要</th>
                    <th>主绑定对象</th>
                    <th>最后消息时间</th>
                    <th>会话状态</th>
                    <th>冷热状态</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="row in sessionRows" :key="row.sessionId">
                    <td>{{ row.sessionId }}</td>
                    <td>{{ row.titleSummary }}</td>
                    <td>{{ row.bindingObjectName }}</td>
                    <td>{{ row.lastMessageTime }}</td>
                    <td>{{ row.sessionStatus }}</td>
                    <td>{{ row.retentionStatus }}</td>
                    <td>
                      <button type="button" class="text-link" @click="loadSessionDetail(row.sessionId)">
                        查看详情
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p v-else class="empty-hint">还没有查询结果，可先发起一次分页查询。</p>
          </div>
        </section>

        <section class="panel">
          <div class="panel__header">
            <div>
              <h3 class="panel__title">会话详情与回答结果</h3>
              <p class="panel__desc">会话详情、最新回答、引用明细和执行记录都放在这里查看。</p>
            </div>
          </div>

          <div class="result-grid">
            <div class="result-card">
              <div class="result-block">
                <h4 class="result-block__title">会话详情</h4>
                <pre v-if="sessionDetail" class="json-viewer">{{ formatJson(sessionDetail) }}</pre>
                <p v-else class="empty-hint">暂无会话详情，创建会话或点击列表“查看详情”后展示。</p>
              </div>
            </div>
            <div class="result-card">
              <div class="result-block">
                <h4 class="result-block__title">最新回答摘要</h4>
                <pre v-if="latestReply" class="json-viewer">{{ formatJson(latestReply) }}</pre>
                <p v-else class="empty-hint">发送消息后会在这里显示最近一次回答返回。</p>
              </div>
            </div>
            <div class="result-card">
              <div class="result-block">
                <h4 class="result-block__title">引用明细</h4>
                <pre v-if="citations.length" class="json-viewer">{{ formatJson(citations) }}</pre>
                <p v-else class="empty-hint">输入会话 ID 和消息 ID 后可查询引用。</p>
              </div>
            </div>
            <div class="result-card">
              <div class="result-block">
                <h4 class="result-block__title">执行记录</h4>
                <pre v-if="executionDetail" class="json-viewer">{{ formatJson(executionDetail) }}</pre>
                <p v-else class="empty-hint">输入执行记录 ID 后可查询执行链路。</p>
              </div>
            </div>
          </div>
        </section>
      </div>

      <div class="panel-stack">
        <section class="panel">
          <div class="panel__header">
            <div>
              <h3 class="panel__title">创建会话</h3>
              <p class="panel__desc">先验证建会话参数和主绑定对象边界。</p>
            </div>
          </div>

          <form class="form-grid" @submit.prevent="handleCreateSession">
            <label class="field">
              <span class="field__label">聊天模式</span>
              <select v-model="createSessionForm.chatMode" class="select">
                <option value="knowledge_base">knowledge_base</option>
                <option value="prompt_template">prompt_template</option>
              </select>
            </label>
            <label class="field">
              <span class="field__label">绑定对象类型</span>
              <select v-model="createSessionForm.bindingObjectType" class="select">
                <option value="knowledge_base">knowledge_base</option>
                <option value="prompt_template">prompt_template</option>
              </select>
            </label>
            <label class="field field--span-2">
              <span class="field__label">绑定对象 ID</span>
              <input v-model="createSessionForm.bindingObjectId" class="input" placeholder="例如：kb_001" />
            </label>
            <label class="field">
              <span class="field__label">知识绑定类型</span>
              <input v-model="createSessionForm.knowledgeBindingType" class="input" placeholder="可为空" />
            </label>
            <label class="field">
              <span class="field__label">知识绑定 ID 列表</span>
              <input
                v-model="createSessionForm.knowledgeBindingIdsText"
                class="input"
                placeholder="使用逗号或空格分隔"
              />
            </label>
            <label class="field field--span-2">
              <span class="field__label">首条消息内容</span>
              <textarea
                v-model="createSessionForm.firstMessageContent"
                class="textarea"
                placeholder="可为空，若要验证建会话即首问可直接填写"
              />
            </label>
            <div class="field field--span-2">
              <span class="field__label">动作</span>
              <div class="action-row" style="margin-top: 0;">
                <button class="button button--primary" type="submit" :disabled="loading.creating">
                  {{ loading.creating ? '创建中...' : '创建会话' }}
                </button>
              </div>
            </div>
          </form>
        </section>

        <section class="panel">
          <div class="panel__header">
            <div>
              <h3 class="panel__title">发送消息</h3>
              <p class="panel__desc">支持会话 ID、文档范围和模板变量 JSON 的联调输入。</p>
            </div>
          </div>

          <form class="form-grid" @submit.prevent="handleSendMessage">
            <label class="field field--span-2">
              <span class="field__label">会话 ID</span>
              <input v-model="messageForm.sessionId" class="input" placeholder="例如：sess_001" />
            </label>
            <label class="field field--span-2">
              <span class="field__label">问题内容</span>
              <textarea
                v-model="messageForm.messageContent"
                class="textarea"
                placeholder="例如：请结合制度说明审批层级"
              />
            </label>
            <label class="field field--span-2">
              <span class="field__label">文档范围</span>
              <input
                v-model="messageForm.selectedDocumentIdsText"
                class="input"
                placeholder="例如：doc_1001, doc_1002"
              />
            </label>
            <label class="field field--span-2">
              <span class="field__label">模板变量 JSON</span>
              <textarea
                v-model="messageForm.templateVariablesText"
                class="textarea"
                placeholder='例如：{"employeeType":"正式员工"}'
              />
            </label>
            <div class="field field--span-2">
              <span class="field__label">动作</span>
              <div class="action-row" style="margin-top: 0;">
                <button class="button button--primary" type="submit" :disabled="loading.sending">
                  {{ loading.sending ? '发送中...' : '发送消息' }}
                </button>
              </div>
            </div>
          </form>
        </section>

        <section class="panel">
          <div class="panel__header">
            <div>
              <h3 class="panel__title">引用与执行记录查询</h3>
              <p class="panel__desc">用于联调引用核验和执行链路可追溯性。</p>
            </div>
          </div>

          <div class="form-grid">
            <label class="field field--span-2">
              <span class="field__label">会话 ID</span>
              <input v-model="traceForm.sessionId" class="input" placeholder="会话 ID" />
            </label>
            <label class="field">
              <span class="field__label">消息 ID</span>
              <input v-model="traceForm.messageId" class="input" placeholder="AI 消息 ID" />
            </label>
            <div class="field">
              <span class="field__label">引用动作</span>
              <div class="action-row" style="margin-top: 0;">
                <button class="button button--secondary" type="button" :disabled="loading.citations" @click="handleLoadCitations">
                  {{ loading.citations ? '查询中...' : '查询引用' }}
                </button>
              </div>
            </div>
            <label class="field">
              <span class="field__label">执行记录 ID</span>
              <input v-model="traceForm.executionId" class="input" placeholder="exec_001" />
            </label>
            <div class="field">
              <span class="field__label">执行动作</span>
              <div class="action-row" style="margin-top: 0;">
                <button class="button button--secondary" type="button" :disabled="loading.execution" @click="handleLoadExecution">
                  {{ loading.execution ? '查询中...' : '查询执行记录' }}
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>
