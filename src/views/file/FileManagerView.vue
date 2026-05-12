<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import SystemFileUploadDialog from '@/components/SystemFileUploadDialog.vue';
import { usePermission } from '@/auth/permissions';
import { fileApi } from '@/api/modules/file';
import { isApiRequestError } from '@/api/request';
import type { EntityId, SystemFile } from '@/types';
import { confirmAction, showErrorMessage, showSuccessMessage } from '@/utils/ui-feedback';

interface FileQueryForm {
  keyword: string;
  sourceModule: string;
  fileStatus: SystemFile['fileStatus'] | '';
  startTime: string;
  endTime: string;
}

const { hasPermission } = usePermission();
const uploadDialogVisible = ref(false);
const files = ref<SystemFile[]>([]);
const loadingFiles = ref(false);
const fileTotal = ref(0);
const filePageNo = ref(1);
const filePageSize = ref(10);
const detailVisible = ref(false);
const detailLoading = ref(false);
const selectedDetail = ref<SystemFile | null>(null);
const uploadTimeRange = ref<[Date, Date] | null>(null);

const canUploadFile = computed(() => hasPermission('file:upload'));
const canQueryFiles = computed(() => hasPermission('file:query'));
const canViewFileDetail = computed(() => hasPermission('file:detail'));
const canPreviewFile = computed(() => hasPermission('file:preview'));
const canDownloadFile = computed(() => hasPermission('file:download'));
const canDeleteFile = computed(() => hasPermission('file:delete'));

const queryForm = reactive<FileQueryForm>({
  keyword: '',
  sourceModule: '',
  fileStatus: '',
  startTime: '',
  endTime: '',
});

const sourceModuleOptions = [
  { label: '系统文件', value: 'system_file' },
  { label: '知识库文档', value: 'knowledge_document' },
  { label: '聊天会话', value: 'chat_session' },
  { label: '任务中心', value: 'task_center' },
];

const fileStatusOptions = [
  { label: '可用', value: 'available' },
  { label: '待扫描', value: 'pending_scan' },
  { label: '已阻断', value: 'blocked' },
  { label: '已删除', value: 'deleted' },
];

function resolveErrorMessage(error: unknown, fallback: string): string {
  return isApiRequestError(error) ? error.message : fallback;
}

async function handleUploadedFile(): Promise<void> {
  if (canQueryFiles.value) {
    // 上传组件只负责提交文件，列表刷新由当前页面按自身查询权限决定。
    filePageNo.value = 1;
    await loadFiles();
  }
}

async function loadFiles(): Promise<void> {
  if (!canQueryFiles.value) {
    return;
  }
  loadingFiles.value = true;
  try {
    const pageData = await fileApi.listFiles({
      pageNo: filePageNo.value,
      pageSize: filePageSize.value,
      keyword: queryForm.keyword.trim(),
      sourceModule: queryForm.sourceModule,
      fileStatus: queryForm.fileStatus,
      // 上传时间按后端创建时间 created_at 过滤，避免前端另造“上传时间”字段。
      startTime: queryForm.startTime,
      endTime: queryForm.endTime,
    });
    if (pageData.list.length === 0 && pageData.total > 0 && filePageNo.value > 1) {
      filePageNo.value = Math.max(1, Math.ceil(pageData.total / filePageSize.value));
      await loadFiles();
      return;
    }
    filePageNo.value = pageData.pageNo;
    filePageSize.value = pageData.pageSize;
    fileTotal.value = pageData.total;
    files.value = pageData.list;
  } catch (error) {
    showErrorMessage(resolveErrorMessage(error, '文件列表查询失败'));
  } finally {
    loadingFiles.value = false;
  }
}

async function queryFiles(): Promise<void> {
  filePageNo.value = 1;
  await loadFiles();
}

async function resetQuery(): Promise<void> {
  queryForm.keyword = '';
  queryForm.sourceModule = '';
  queryForm.fileStatus = '';
  queryForm.startTime = '';
  queryForm.endTime = '';
  uploadTimeRange.value = null;
  await queryFiles();
}

function handleUploadTimeChange(value: [Date, Date] | null): void {
  // 上传时间筛选只按日期选择，后端仍按 created_at 做完整时间范围过滤。
  const startDate = value?.[0];
  const endDate = value?.[1];
  if (!startDate || !endDate) {
    queryForm.startTime = '';
    queryForm.endTime = '';
    return;
  }
  const endOfDay = new Date(endDate);
  endOfDay.setHours(23, 59, 59, 999);
  queryForm.startTime = startDate.toISOString();
  queryForm.endTime = endOfDay.toISOString();
}

async function handleFilePageChange(pageNo: number): Promise<void> {
  filePageNo.value = pageNo;
  await loadFiles();
}

async function handleFileSizeChange(pageSize: number): Promise<void> {
  filePageSize.value = pageSize;
  filePageNo.value = 1;
  await loadFiles();
}

async function openDetail(row: SystemFile): Promise<void> {
  if (!canViewFileDetail.value) {
    return;
  }
  detailVisible.value = true;
  detailLoading.value = true;
  selectedDetail.value = null;
  try {
    // 详情必须重新请求后端，避免列表字段未来裁剪后弹窗误用过期快照。
    selectedDetail.value = await fileApi.getFile(row.fileId);
  } catch (error) {
    showErrorMessage(resolveErrorMessage(error, '文件详情查询失败'));
    detailVisible.value = false;
  } finally {
    detailLoading.value = false;
  }
}

async function previewFile(row: SystemFile): Promise<void> {
  try {
    const blob = await fileApi.previewFile(row.fileId);
    const previewUrl = URL.createObjectURL(blob);
    const openedWindow = window.open(previewUrl, '_blank', 'noopener');
    if (!openedWindow) {
      showErrorMessage('浏览器阻止了预览窗口');
    }
    window.setTimeout(() => URL.revokeObjectURL(previewUrl), 60_000);
  } catch (error) {
    showErrorMessage(resolveErrorMessage(error, '文件预览失败'));
  }
}

async function downloadFile(row: SystemFile): Promise<void> {
  try {
    const blob = await fileApi.downloadFile(row.fileId);
    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = row.originFileName || `file-${row.fileId}`;
    // 通过临时链接触发浏览器下载，避免把鉴权 Token 暴露到 URL。
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(downloadUrl);
  } catch (error) {
    showErrorMessage(resolveErrorMessage(error, '文件下载失败'));
  }
}

async function deleteFile(row: SystemFile): Promise<void> {
  if (row.sourceBizId) {
    showErrorMessage('该文件已绑定来源业务，不能直接删除');
    return;
  }
  const confirmed = await confirmAction({
    title: '删除文件',
    message: `确认删除文件“${row.originFileName}”吗？`,
    confirmButtonText: '删除',
    type: 'warning',
  });
  if (!confirmed) {
    return;
  }
  try {
    await fileApi.deleteFile(row.fileId);
    showSuccessMessage('文件已删除');
    await loadFiles();
  } catch (error) {
    showErrorMessage(resolveErrorMessage(error, '文件删除失败'));
  }
}

function formatFileSize(size: number): string {
  if (size < 1024) {
    return `${size} B`;
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function formatDateTime(value: string | null): string {
  if (!value) {
    return '-';
  }
  return value.replace('T', ' ').replace(/\.\d+.*$/, '');
}

function statusText(status: string): string {
  const matched = fileStatusOptions.find((option) => option.value === status);
  return matched?.label ?? status;
}

function moduleText(moduleCode: string): string {
  const matched = sourceModuleOptions.find((option) => option.value === moduleCode);
  return matched?.label ?? moduleCode;
}

function emptyText(value: string | EntityId | null): string {
  return value === null || value === '' ? '-' : String(value);
}

onMounted(() => {
  if (canQueryFiles.value) {
    void loadFiles();
  }
});
</script>

<template>
  <section class="workspace-card file-manager-page">
    <div class="system-page__header">
      <div>
        <h2 class="section-heading__title">文件管理</h2>
        <p class="section-heading__desc">统一维护系统文件元数据。</p>
      </div>
      <div class="file-manager-page__actions">
        <el-button v-if="canQueryFiles" :loading="loadingFiles" @click="loadFiles">刷新</el-button>
        <el-button v-if="canUploadFile" type="primary" @click="uploadDialogVisible = true">上传文件</el-button>
      </div>
    </div>

    <section v-if="canQueryFiles" class="file-list-section">
      <div class="file-query-toolbar">
        <el-input v-model="queryForm.keyword" maxlength="128" placeholder="文件名、来源或备注" clearable />
        <el-select v-model="queryForm.sourceModule" clearable placeholder="来源模块">
          <el-option
            v-for="option in sourceModuleOptions"
            :key="option.value"
            :label="option.label"
            :value="option.value"
          />
        </el-select>
        <el-select v-model="queryForm.fileStatus" clearable placeholder="文件状态">
          <el-option
            v-for="option in fileStatusOptions"
            :key="option.value"
            :label="option.label"
            :value="option.value"
          />
        </el-select>
        <el-date-picker
          v-model="uploadTimeRange"
          type="daterange"
          format="YYYY-MM-DD"
          unlink-panels
          start-placeholder="上传开始"
          end-placeholder="上传结束"
          range-separator="至"
          @change="handleUploadTimeChange"
        />
        <div class="file-query-toolbar__actions">
          <el-button type="primary" :loading="loadingFiles" @click="queryFiles">查询</el-button>
          <el-button @click="resetQuery">重置</el-button>
        </div>
      </div>

      <el-table v-loading="loadingFiles" :data="files" class="file-table" row-key="fileId">
        <el-table-column prop="originFileName" label="文件名" min-width="190" show-overflow-tooltip />
        <el-table-column label="来源模块" width="120">
          <template #default="{ row }">{{ moduleText(row.sourceModule) }}</template>
        </el-table-column>
        <el-table-column prop="sourceBizName" label="来源业务" min-width="150" show-overflow-tooltip>
          <template #default="{ row }">{{ emptyText(row.sourceBizName) }}</template>
        </el-table-column>
        <el-table-column prop="fileExt" label="扩展名" width="90">
          <template #default="{ row }">{{ emptyText(row.fileExt) }}</template>
        </el-table-column>
        <el-table-column label="大小" width="110">
          <template #default="{ row }">{{ formatFileSize(row.fileSize) }}</template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag size="small" effect="plain">{{ statusText(row.fileStatus) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="storageProvider" label="存储" width="100" />
        <el-table-column label="上传人" width="130">
          <template #default="{ row }">{{ emptyText(row.createdByName) }}</template>
        </el-table-column>
        <el-table-column label="上传时间" width="180">
          <template #default="{ row }">{{ formatDateTime(row.createdTime) }}</template>
        </el-table-column>
        <el-table-column
          v-if="canViewFileDetail || canPreviewFile || canDownloadFile || canDeleteFile"
          label="操作"
          width="220"
          fixed="right"
        >
          <template #default="{ row }">
            <el-button v-if="canViewFileDetail" link type="primary" @click="openDetail(row)">详情</el-button>
            <el-button v-if="canPreviewFile" link type="primary" @click="previewFile(row)">预览</el-button>
            <el-button v-if="canDownloadFile" link type="primary" @click="downloadFile(row)">下载</el-button>
            <el-button
              v-if="canDeleteFile"
              link
              type="danger"
              :disabled="!!row.sourceBizId"
              @click="deleteFile(row)"
            >
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-pagination
        v-model:current-page="filePageNo"
        v-model:page-size="filePageSize"
        class="table-pagination"
        :page-sizes="[10, 20, 50, 100]"
        :total="fileTotal"
        layout="total, sizes, prev, pager, next"
        @current-change="handleFilePageChange"
        @size-change="handleFileSizeChange"
      />
    </section>

    <el-empty v-else description="当前账号没有文件查询权限" />

    <el-dialog v-model="detailVisible" title="文件详情" width="720px" align-center>
      <el-skeleton v-if="detailLoading" :rows="6" animated />
      <dl v-else-if="selectedDetail" class="definition-list file-detail-list">
        <div>
          <dt>文件ID</dt>
          <dd>{{ selectedDetail.fileId }}</dd>
        </div>
        <div>
          <dt>文件名</dt>
          <dd>{{ selectedDetail.originFileName }}</dd>
        </div>
        <div>
          <dt>来源模块</dt>
          <dd>{{ moduleText(selectedDetail.sourceModule) }}</dd>
        </div>
        <div>
          <dt>来源业务类型</dt>
          <dd>{{ emptyText(selectedDetail.sourceBizType) }}</dd>
        </div>
        <div>
          <dt>来源业务ID</dt>
          <dd>{{ emptyText(selectedDetail.sourceBizId) }}</dd>
        </div>
        <div>
          <dt>来源业务名称</dt>
          <dd>{{ emptyText(selectedDetail.sourceBizName) }}</dd>
        </div>
        <div>
          <dt>文件大小</dt>
          <dd>{{ formatFileSize(selectedDetail.fileSize) }}</dd>
        </div>
        <div>
          <dt>状态</dt>
          <dd>{{ statusText(selectedDetail.fileStatus) }}</dd>
        </div>
        <div>
          <dt>存储提供者</dt>
          <dd>{{ selectedDetail.storageProvider }}</dd>
        </div>
        <div>
          <dt>存储桶</dt>
          <dd>{{ emptyText(selectedDetail.bucket) }}</dd>
        </div>
        <div>
          <dt>存储键</dt>
          <dd>{{ selectedDetail.storageKey }}</dd>
        </div>
        <div>
          <dt>文件校验标识</dt>
          <dd>{{ emptyText(selectedDetail.etag) }}</dd>
        </div>
        <div>
          <dt>上传人</dt>
          <dd>{{ emptyText(selectedDetail.createdByName) }}</dd>
        </div>
        <div>
          <dt>上传时间</dt>
          <dd>{{ formatDateTime(selectedDetail.createdTime) }}</dd>
        </div>
        <div>
          <dt>备注</dt>
          <dd>{{ emptyText(selectedDetail.remark) }}</dd>
        </div>
      </dl>
    </el-dialog>

    <SystemFileUploadDialog
      v-model="uploadDialogVisible"
      :source-module-options="sourceModuleOptions"
      @uploaded="handleUploadedFile"
    />
  </section>
</template>

<style scoped>
.file-manager-page__actions {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}

.file-list-section {
  margin-top: 20px;
}

.file-query-toolbar {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr)) auto;
  gap: 12px;
  align-items: center;
  margin-bottom: 12px;
}

.file-query-toolbar :deep(.el-date-editor) {
  width: 100%;
}

.file-query-toolbar__actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.file-table {
  width: 100%;
}

.table-pagination {
  justify-content: flex-end;
  margin-top: 14px;
}

.file-detail-list dd {
  word-break: break-all;
}

@media (max-width: 1180px) {
  .file-query-toolbar {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 860px) {
  .file-query-toolbar {
    grid-template-columns: 1fr;
  }

  .file-manager-page__actions,
  .file-query-toolbar__actions {
    width: 100%;
    justify-content: flex-start;
  }
}
</style>
