<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { usePermission } from '@/auth/permissions';
import { systemApi } from '@/api/modules/system';
import { isApiRequestError } from '@/api/request';
import type { SystemLoginLog, SystemLoginLogArchive, SystemOperationLog, SystemOperationLogArchive } from '@/types';
import { showErrorMessage } from '@/utils/ui-feedback';

type LogTab = 'login' | 'operation';
type LogStorage = 'hot' | 'archive';

const activeTab = ref<LogTab>('login');
const logStorage = ref<LogStorage>('hot');
const loginLogs = ref<Array<SystemLoginLog | SystemLoginLogArchive>>([]);
const operationLogs = ref<Array<SystemOperationLog | SystemOperationLogArchive>>([]);
const loginLoading = ref(false);
const operationLoading = ref(false);
const loginTotal = ref(0);
const operationTotal = ref(0);
const loginTimeRange = ref<[Date, Date] | []>([]);
const operationTimeRange = ref<[Date, Date] | []>([]);
const loginArchiveTimeRange = ref<[Date, Date] | []>([]);
const operationArchiveTimeRange = ref<[Date, Date] | []>([]);
const { hasPermission, hasAnyPermission } = usePermission();

const loginQuery = reactive({
  pageNo: 1,
  pageSize: 10,
  username: '',
  loginMethod: '',
  eventType: '',
  result: '',
  ipAddress: '',
  requestId: '',
  sourceLogId: '',
  archiveBatchNo: '',
});

const operationQuery = reactive({
  pageNo: 1,
  pageSize: 10,
  operatorName: '',
  moduleCode: '',
  operationType: '',
  targetId: '',
  result: '',
  requestId: '',
  sourceLogId: '',
  archiveBatchNo: '',
});

const canQueryLoginLog = computed(() => hasPermission('system:log:login:list'));
const canQueryOperationLog = computed(() => hasPermission('system:log:operation:list'));
const canQueryLoginArchiveLog = computed(() => hasPermission('system:log:login:archive:list'));
const canQueryOperationArchiveLog = computed(() => hasPermission('system:log:operation:archive:list'));
// 冷数据使用独立权限，避免只有热日志权限的用户看到长期归档记录。
const canQueryAnyHotLog = computed(() => hasAnyPermission(['system:log:login:list', 'system:log:operation:list']));
const canQueryAnyArchiveLog = computed(() =>
  hasAnyPermission(['system:log:login:archive:list', 'system:log:operation:archive:list']),
);
const canQueryAnyLog = computed(() => canQueryAnyHotLog.value || canQueryAnyArchiveLog.value);
const canQueryCurrentLoginLog = computed(() =>
  logStorage.value === 'archive' ? canQueryLoginArchiveLog.value : canQueryLoginLog.value,
);
const canQueryCurrentOperationLog = computed(() =>
  logStorage.value === 'archive' ? canQueryOperationArchiveLog.value : canQueryOperationLog.value,
);
const canQueryCurrentStorageLog = computed(() =>
  logStorage.value === 'archive' ? canQueryAnyArchiveLog.value : canQueryAnyHotLog.value,
);
const isArchiveStorage = computed(() => logStorage.value === 'archive');

function resolveErrorMessage(error: unknown, fallback: string): string {
  return isApiRequestError(error) ? error.message : fallback;
}

function toIsoTimeRange(range: [Date, Date] | []): { startTime?: string; endTime?: string } {
  if (range.length !== 2) {
    return {};
  }
  return {
    startTime: range[0].toISOString(),
    endTime: range[1].toISOString(),
  };
}

function toIsoArchiveTimeRange(range: [Date, Date] | []): { archiveStartTime?: string; archiveEndTime?: string } {
  if (range.length !== 2) {
    return {};
  }
  return {
    archiveStartTime: range[0].toISOString(),
    archiveEndTime: range[1].toISOString(),
  };
}

function formatTime(value: string | null | undefined): string {
  if (!value) {
    return '-';
  }
  return new Date(value).toLocaleString('zh-CN', { hour12: false });
}

function resultText(result: string): string {
  return result === 'success' ? '成功' : '失败';
}

function resultTagType(result: string): 'success' | 'danger' {
  return result === 'success' ? 'success' : 'danger';
}

function loginMethodText(method: string): string {
  const labels: Record<string, string> = {
    password: '账号密码',
    sso: '单点登录',
    token: '令牌',
  };
  return labels[method] ?? method;
}

function loginEventText(eventType: string): string {
  const labels: Record<string, string> = {
    login_success: '登录成功',
    login_failure: '登录失败',
    logout: '退出登录',
    token_expired: '令牌过期',
    token_invalid: '令牌失效',
    sso_callback: '单点回调',
  };
  return labels[eventType] ?? eventType;
}

function operationTypeText(operationType: string): string {
  const labels: Record<string, string> = {
    create: '新增',
    update: '修改',
    delete: '删除',
    status: '启停',
    authorize: '授权',
    import: '导入',
    export: '导出',
    config: '配置',
    test: '测试',
    reprocess: '重新处理',
    retry: '重试',
    batch_rerun: '批量重跑',
    batch_reprocess: '批量重处理',
  };
  return labels[operationType] ?? operationType;
}

function resolveLoginRowKey(row: SystemLoginLog | SystemLoginLogArchive): string {
  return 'archiveLogId' in row ? `archive-${row.archiveLogId}` : `hot-${row.loginLogId}`;
}

function resolveOperationRowKey(row: SystemOperationLog | SystemOperationLogArchive): string {
  return 'archiveLogId' in row ? `archive-${row.archiveLogId}` : `hot-${row.operationLogId}`;
}

function resolveArchivedAt(row: SystemLoginLog | SystemLoginLogArchive | SystemOperationLog | SystemOperationLogArchive): string {
  return 'archivedAt' in row ? row.archivedAt : '';
}

async function loadLoginLogs(): Promise<void> {
  if (!canQueryCurrentLoginLog.value) {
    loginLogs.value = [];
    loginTotal.value = 0;
    return;
  }
  loginLoading.value = true;
  try {
    const baseQuery = {
      pageNo: loginQuery.pageNo,
      pageSize: loginQuery.pageSize,
      username: loginQuery.username.trim(),
      loginMethod: loginQuery.loginMethod as 'password' | 'sso' | 'token' | '',
      eventType: loginQuery.eventType,
      result: loginQuery.result as 'success' | 'failure' | '',
      ipAddress: loginQuery.ipAddress.trim(),
      requestId: loginQuery.requestId.trim(),
      ...toIsoTimeRange(loginTimeRange.value),
    };
    const pageData = isArchiveStorage.value
      ? await systemApi.listLoginLogArchives({
        ...baseQuery,
        sourceLogId: loginQuery.sourceLogId.trim(),
        archiveBatchNo: loginQuery.archiveBatchNo.trim(),
        ...toIsoArchiveTimeRange(loginArchiveTimeRange.value),
      })
      : await systemApi.listLoginLogs(baseQuery);
    loginQuery.pageNo = pageData.pageNo;
    loginQuery.pageSize = pageData.pageSize;
    loginTotal.value = pageData.total;
    loginLogs.value = pageData.list;
  } catch (error) {
    showErrorMessage(resolveErrorMessage(error, '登录日志加载失败'));
  } finally {
    loginLoading.value = false;
  }
}

async function loadOperationLogs(): Promise<void> {
  if (!canQueryCurrentOperationLog.value) {
    operationLogs.value = [];
    operationTotal.value = 0;
    return;
  }
  operationLoading.value = true;
  try {
    const baseQuery = {
      pageNo: operationQuery.pageNo,
      pageSize: operationQuery.pageSize,
      operatorName: operationQuery.operatorName.trim(),
      moduleCode: operationQuery.moduleCode,
      operationType: operationQuery.operationType,
      targetId: operationQuery.targetId.trim(),
      result: operationQuery.result as 'success' | 'failure' | '',
      requestId: operationQuery.requestId.trim(),
      ...toIsoTimeRange(operationTimeRange.value),
    };
    const pageData = isArchiveStorage.value
      ? await systemApi.listOperationLogArchives({
        ...baseQuery,
        sourceLogId: operationQuery.sourceLogId.trim(),
        archiveBatchNo: operationQuery.archiveBatchNo.trim(),
        ...toIsoArchiveTimeRange(operationArchiveTimeRange.value),
      })
      : await systemApi.listOperationLogs(baseQuery);
    operationQuery.pageNo = pageData.pageNo;
    operationQuery.pageSize = pageData.pageSize;
    operationTotal.value = pageData.total;
    operationLogs.value = pageData.list;
  } catch (error) {
    showErrorMessage(resolveErrorMessage(error, '操作日志加载失败'));
  } finally {
    operationLoading.value = false;
  }
}

async function refreshActiveTab(): Promise<void> {
  if (!canQueryCurrentStorageLog.value) {
    return;
  }
  if (activeTab.value === 'login') {
    await loadLoginLogs();
    return;
  }
  await loadOperationLogs();
}

async function handleStorageChange(): Promise<void> {
  loginQuery.pageNo = 1;
  operationQuery.pageNo = 1;
  if (activeTab.value === 'login' && !canQueryCurrentLoginLog.value) {
    activeTab.value = 'operation';
  }
  if (activeTab.value === 'operation' && !canQueryCurrentOperationLog.value) {
    activeTab.value = 'login';
  }
  await refreshActiveTab();
}

async function searchLoginLogs(): Promise<void> {
  loginQuery.pageNo = 1;
  await loadLoginLogs();
}

async function searchOperationLogs(): Promise<void> {
  operationQuery.pageNo = 1;
  await loadOperationLogs();
}

async function handleLoginPageChange(pageNo: number): Promise<void> {
  loginQuery.pageNo = pageNo;
  await loadLoginLogs();
}

async function handleLoginSizeChange(pageSize: number): Promise<void> {
  loginQuery.pageSize = pageSize;
  loginQuery.pageNo = 1;
  await loadLoginLogs();
}

async function handleOperationPageChange(pageNo: number): Promise<void> {
  operationQuery.pageNo = pageNo;
  await loadOperationLogs();
}

async function handleOperationSizeChange(pageSize: number): Promise<void> {
  operationQuery.pageSize = pageSize;
  operationQuery.pageNo = 1;
  await loadOperationLogs();
}

function resetLoginQuery(): void {
  loginQuery.username = '';
  loginQuery.loginMethod = '';
  loginQuery.eventType = '';
  loginQuery.result = '';
  loginQuery.ipAddress = '';
  loginQuery.requestId = '';
  loginQuery.sourceLogId = '';
  loginQuery.archiveBatchNo = '';
  loginTimeRange.value = [];
  loginArchiveTimeRange.value = [];
  void searchLoginLogs();
}

function resetOperationQuery(): void {
  operationQuery.operatorName = '';
  operationQuery.moduleCode = '';
  operationQuery.operationType = '';
  operationQuery.targetId = '';
  operationQuery.result = '';
  operationQuery.requestId = '';
  operationQuery.sourceLogId = '';
  operationQuery.archiveBatchNo = '';
  operationTimeRange.value = [];
  operationArchiveTimeRange.value = [];
  void searchOperationLogs();
}

onMounted(() => {
  if (!canQueryAnyHotLog.value && canQueryAnyArchiveLog.value) {
    logStorage.value = 'archive';
  }
  if (canQueryCurrentLoginLog.value) {
    activeTab.value = 'login';
    void loadLoginLogs();
    return;
  }
  if (canQueryCurrentOperationLog.value) {
    activeTab.value = 'operation';
    void loadOperationLogs();
  }
});
</script>

<template>
  <section class="workspace-card system-page">
    <div class="system-page__header">
      <div>
        <h2 class="section-heading__title">系统日志</h2>
        <p class="section-heading__desc">查询登录事件和后台关键操作，按 requestId 串联排查问题。</p>
      </div>
      <div class="log-header-actions">
        <el-radio-group v-if="canQueryAnyArchiveLog" v-model="logStorage" @change="handleStorageChange">
          <el-radio-button label="hot" :disabled="!canQueryAnyHotLog">热数据</el-radio-button>
          <el-radio-button label="archive" :disabled="!canQueryAnyArchiveLog">归档数据</el-radio-button>
        </el-radio-group>
        <el-button :disabled="!canQueryCurrentStorageLog" @click="refreshActiveTab">刷新</el-button>
      </div>
    </div>

    <el-empty v-if="!canQueryAnyLog" description="当前账号没有系统日志查询权限" />

    <el-tabs v-else v-model="activeTab" class="log-tabs" @tab-change="refreshActiveTab">
      <el-tab-pane v-if="canQueryCurrentLoginLog" label="登录日志" name="login">
        <div class="log-filters">
          <el-input
            v-if="isArchiveStorage"
            v-model="loginQuery.sourceLogId"
            clearable
            placeholder="来源日志ID"
            @keyup.enter="searchLoginLogs"
          />
          <el-input
            v-if="isArchiveStorage"
            v-model="loginQuery.archiveBatchNo"
            clearable
            placeholder="归档批次"
            @keyup.enter="searchLoginLogs"
          />
          <el-input v-model="loginQuery.username" clearable placeholder="登录账号" @keyup.enter="searchLoginLogs" />
          <el-select v-model="loginQuery.loginMethod" clearable placeholder="登录方式">
            <el-option label="账号密码" value="password" />
            <el-option label="单点登录" value="sso" />
            <el-option label="令牌" value="token" />
          </el-select>
          <el-select v-model="loginQuery.eventType" clearable placeholder="事件类型">
            <el-option label="登录成功" value="login_success" />
            <el-option label="登录失败" value="login_failure" />
            <el-option label="退出登录" value="logout" />
            <el-option label="令牌过期" value="token_expired" />
            <el-option label="令牌失效" value="token_invalid" />
            <el-option label="单点回调" value="sso_callback" />
          </el-select>
          <el-select v-model="loginQuery.result" clearable placeholder="结果">
            <el-option label="成功" value="success" />
            <el-option label="失败" value="failure" />
          </el-select>
          <el-input v-model="loginQuery.ipAddress" clearable placeholder="IP" @keyup.enter="searchLoginLogs" />
          <el-input v-model="loginQuery.requestId" clearable placeholder="requestId" @keyup.enter="searchLoginLogs" />
          <el-date-picker
            v-model="loginTimeRange"
            type="datetimerange"
            start-placeholder="开始时间"
            end-placeholder="结束时间"
          />
          <el-date-picker
            v-if="isArchiveStorage"
            v-model="loginArchiveTimeRange"
            type="datetimerange"
            start-placeholder="归档开始"
            end-placeholder="归档结束"
          />
          <div class="log-filter-actions">
            <el-button type="primary" @click="searchLoginLogs">查询</el-button>
            <el-button @click="resetLoginQuery">重置</el-button>
          </div>
        </div>

        <el-table
          v-loading="loginLoading"
          :data="loginLogs"
          border
          :row-key="resolveLoginRowKey"
          class="system-page__table"
        >
          <el-table-column v-if="isArchiveStorage" prop="sourceLogId" label="来源ID" min-width="110" />
          <el-table-column v-if="isArchiveStorage" prop="archiveBatchNo" label="归档批次" min-width="170" show-overflow-tooltip />
          <el-table-column v-if="isArchiveStorage" label="归档时间" min-width="170">
            <template #default="{ row }">{{ formatTime(resolveArchivedAt(row)) }}</template>
          </el-table-column>
          <el-table-column label="发生时间" min-width="170">
            <template #default="{ row }">{{ formatTime(row.eventTime) }}</template>
          </el-table-column>
          <el-table-column prop="username" label="登录账号" min-width="140" show-overflow-tooltip />
          <el-table-column prop="displayName" label="用户名称" min-width="120" show-overflow-tooltip />
          <el-table-column label="登录方式" width="100">
            <template #default="{ row }">{{ loginMethodText(row.loginMethod) }}</template>
          </el-table-column>
          <el-table-column label="事件类型" width="110">
            <template #default="{ row }">{{ loginEventText(row.eventType) }}</template>
          </el-table-column>
          <el-table-column label="结果" width="90">
            <template #default="{ row }">
              <el-tag :type="resultTagType(row.result)">{{ resultText(row.result) }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="failureReason" label="失败原因" min-width="140" show-overflow-tooltip />
          <el-table-column prop="ipAddress" label="IP" min-width="130" show-overflow-tooltip />
          <el-table-column prop="requestId" label="requestId" min-width="180" show-overflow-tooltip />
          <el-table-column prop="userAgent" label="User-Agent" min-width="220" show-overflow-tooltip />
        </el-table>
        <div class="log-pagination">
          <el-pagination
            v-model:current-page="loginQuery.pageNo"
            v-model:page-size="loginQuery.pageSize"
            background
            :page-sizes="[10, 20, 50, 100]"
            :total="loginTotal"
            layout="total, sizes, prev, pager, next"
            @current-change="handleLoginPageChange"
            @size-change="handleLoginSizeChange"
          />
        </div>
      </el-tab-pane>

      <el-tab-pane v-if="canQueryCurrentOperationLog" label="操作日志" name="operation">
        <div class="log-filters">
          <el-input
            v-if="isArchiveStorage"
            v-model="operationQuery.sourceLogId"
            clearable
            placeholder="来源日志ID"
            @keyup.enter="searchOperationLogs"
          />
          <el-input
            v-if="isArchiveStorage"
            v-model="operationQuery.archiveBatchNo"
            clearable
            placeholder="归档批次"
            @keyup.enter="searchOperationLogs"
          />
          <el-input v-model="operationQuery.operatorName" clearable placeholder="操作人" @keyup.enter="searchOperationLogs" />
          <el-select v-model="operationQuery.moduleCode" clearable placeholder="操作模块">
            <el-option label="用户管理" value="system_user" />
            <el-option label="角色管理" value="system_role" />
            <el-option label="部门管理" value="system_dept" />
            <el-option label="菜单管理" value="system_menu" />
            <el-option label="权限管理" value="system_permission" />
            <el-option label="数据字典" value="system_dict" />
            <el-option label="AI模型配置" value="ai_model" />
            <el-option label="知识库管理" value="knowledge_base" />
            <el-option label="文档管理" value="knowledge_document" />
            <el-option label="任务中心" value="knowledge_task" />
          </el-select>
          <el-select v-model="operationQuery.operationType" clearable placeholder="操作类型">
            <el-option label="新增" value="create" />
            <el-option label="修改" value="update" />
            <el-option label="删除" value="delete" />
            <el-option label="启停" value="status" />
            <el-option label="授权" value="authorize" />
            <el-option label="配置" value="config" />
            <el-option label="测试" value="test" />
            <el-option label="重新处理" value="reprocess" />
            <el-option label="重试" value="retry" />
            <el-option label="批量重跑" value="batch_rerun" />
            <el-option label="批量重处理" value="batch_reprocess" />
          </el-select>
          <el-select v-model="operationQuery.result" clearable placeholder="结果">
            <el-option label="成功" value="success" />
            <el-option label="失败" value="failure" />
          </el-select>
          <el-input v-model="operationQuery.targetId" clearable placeholder="对象ID" @keyup.enter="searchOperationLogs" />
          <el-input v-model="operationQuery.requestId" clearable placeholder="requestId" @keyup.enter="searchOperationLogs" />
          <el-date-picker
            v-model="operationTimeRange"
            type="datetimerange"
            start-placeholder="开始时间"
            end-placeholder="结束时间"
          />
          <el-date-picker
            v-if="isArchiveStorage"
            v-model="operationArchiveTimeRange"
            type="datetimerange"
            start-placeholder="归档开始"
            end-placeholder="归档结束"
          />
          <div class="log-filter-actions">
            <el-button type="primary" @click="searchOperationLogs">查询</el-button>
            <el-button @click="resetOperationQuery">重置</el-button>
          </div>
        </div>

        <el-table
          v-loading="operationLoading"
          :data="operationLogs"
          border
          :row-key="resolveOperationRowKey"
          class="system-page__table"
        >
          <el-table-column v-if="isArchiveStorage" prop="sourceLogId" label="来源ID" min-width="110" />
          <el-table-column v-if="isArchiveStorage" prop="archiveBatchNo" label="归档批次" min-width="170" show-overflow-tooltip />
          <el-table-column v-if="isArchiveStorage" label="归档时间" min-width="170">
            <template #default="{ row }">{{ formatTime(resolveArchivedAt(row)) }}</template>
          </el-table-column>
          <el-table-column label="发生时间" min-width="170">
            <template #default="{ row }">{{ formatTime(row.eventTime) }}</template>
          </el-table-column>
          <el-table-column prop="operatorName" label="操作人" min-width="120" show-overflow-tooltip />
          <el-table-column prop="moduleName" label="模块" width="110" />
          <el-table-column label="操作类型" width="100">
            <template #default="{ row }">{{ operationTypeText(row.operationType) }}</template>
          </el-table-column>
          <el-table-column label="结果" width="90">
            <template #default="{ row }">
              <el-tag :type="resultTagType(row.result)">{{ resultText(row.result) }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="targetType" label="对象类型" width="110" />
          <el-table-column prop="targetId" label="对象ID" min-width="110" show-overflow-tooltip />
          <el-table-column prop="failureReason" label="失败原因" min-width="140" show-overflow-tooltip />
          <el-table-column prop="requestMethod" label="方法" width="80" />
          <el-table-column prop="requestPath" label="请求路径" min-width="220" show-overflow-tooltip />
          <el-table-column prop="requestParams" label="入参摘要" min-width="220" show-overflow-tooltip />
          <el-table-column prop="responseParams" label="出参摘要" min-width="220" show-overflow-tooltip />
          <el-table-column prop="requestId" label="requestId" min-width="180" show-overflow-tooltip />
          <el-table-column prop="ipAddress" label="IP" min-width="130" show-overflow-tooltip />
        </el-table>
        <div class="log-pagination">
          <el-pagination
            v-model:current-page="operationQuery.pageNo"
            v-model:page-size="operationQuery.pageSize"
            background
            :page-sizes="[10, 20, 50, 100]"
            :total="operationTotal"
            layout="total, sizes, prev, pager, next"
            @current-change="handleOperationPageChange"
            @size-change="handleOperationSizeChange"
          />
        </div>
      </el-tab-pane>
    </el-tabs>
  </section>
</template>

<style scoped>
.log-tabs {
  margin-top: 4px;
}

.log-header-actions {
  display: flex;
  gap: 10px;
  align-items: center;
}

.log-filters {
  display: grid;
  grid-template-columns: repeat(4, minmax(150px, 1fr));
  gap: 10px;
  margin-bottom: 14px;
}

.log-filters :deep(.el-date-editor) {
  width: 100%;
}

.log-filter-actions {
  display: flex;
  gap: 10px;
  align-items: center;
}

.log-pagination {
  display: flex;
  justify-content: flex-end;
  margin-top: 12px;
}

@media (max-width: 1100px) {
  .log-filters {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 700px) {
  .log-header-actions,
  .log-filters,
  .log-filter-actions {
    display: grid;
    grid-template-columns: 1fr;
  }
}
</style>
