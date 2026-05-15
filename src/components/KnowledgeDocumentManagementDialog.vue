<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { usePermission } from '@/auth/permissions';
import { knowledgeApi } from '@/api/modules/knowledge';
import { systemApi } from '@/api/modules/system';
import { isApiRequestError } from '@/api/request';
import KnowledgeDocumentPermissionDialog from '@/components/KnowledgeDocumentPermissionDialog.vue';
import SystemFileUploadDialog from '@/components/SystemFileUploadDialog.vue';
import type {
  EntityId,
  KnowledgeBaseChunkStrategy,
  KnowledgeChunkConfig,
  KnowledgeChunkStrategyOption,
  KnowledgeChunkStrategyType,
  KnowledgeBase,
  KnowledgeDocument,
  KnowledgeDocumentBusinessStatus,
  KnowledgeDocumentChunk,
  KnowledgeDocumentCreatePayload,
  KnowledgeDocumentProcessingStatus,
  KnowledgeDocumentSourceType,
  KnowledgeDocumentUpdatePayload,
  SystemDept,
  SystemFile,
} from '@/types';
import { confirmAction, showErrorMessage, showSuccessMessage } from '@/utils/ui-feedback';

type FormMode = 'create' | 'edit';

interface DocumentFormState {
  documentCode: string;
  title: string;
  summary: string;
  contentText: string;
  sourceType: KnowledgeDocumentSourceType;
  sourceFileId: string;
  sourceFileName: string;
  externalUrl: string;
  categoryName: string;
  tags: string[];
  ownerDeptId: string;
  chunkStrategyType: KnowledgeChunkStrategyType;
  chunkSize: number;
  overlapSize: number;
  minChunkSize: number;
  separators: string;
  targetChunkSize: number;
  maxChunkSize: number;
  similarityThreshold: number;
  windowSize: number;
  processingStatus: KnowledgeDocumentProcessingStatus;
  remark: string;
}

const props = defineProps<{
  modelValue?: boolean;
  knowledgeBase?: KnowledgeBase | null;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  changed: [];
}>();

const { hasPermission, hasAnyPermission } = usePermission();
const route = useRoute();
const router = useRouter();
const documents = ref<KnowledgeDocument[]>([]);
const deptOptions = ref<SystemDept[]>([]);
const strategyOptions = ref<KnowledgeChunkStrategyOption[]>([]);
const baseChunkStrategy = ref<KnowledgeBaseChunkStrategy | null>(null);
const loading = ref(false);
const saving = ref(false);
const formVisible = ref(false);
const uploadVisible = ref(false);
const permissionVisible = ref(false);
const chunkVisible = ref(false);
const formMode = ref<FormMode>('create');
const editingDocumentId = ref<EntityId | null>(null);
const permissionDocumentId = ref<EntityId | null>(null);
const chunkDocument = ref<KnowledgeDocument | null>(null);
const chunks = ref<KnowledgeDocumentChunk[]>([]);
const selectedChunk = ref<KnowledgeDocumentChunk | null>(null);
const chunkLoading = ref(false);
const chunkDetailLoading = ref(false);
const chunkPageNo = ref(1);
const chunkPageSize = ref(10);
const chunkTotal = ref(0);
const keyword = ref('');
const sourceTypeFilter = ref<KnowledgeDocumentSourceType | ''>('');
const businessStatusFilter = ref<KnowledgeDocumentBusinessStatus | ''>('');
const processingStatusFilter = ref<KnowledgeDocumentProcessingStatus | ''>('');
const pageNo = ref(1);
const pageSize = ref(10);
const total = ref(0);
const routeKnowledgeBaseName = computed(() => (typeof route.query.baseName === 'string' ? route.query.baseName : ''));
const selectedKnowledgeBaseId = computed(() => {
  if (props.knowledgeBase?.knowledgeBaseId) {
    return props.knowledgeBase.knowledgeBaseId;
  }
  const value = route.query.baseId;
  return typeof value === 'string' && value.trim() ? value.trim() : '';
});
const selectedKnowledgeBaseName = computed(() => props.knowledgeBase?.baseName ?? routeKnowledgeBaseName.value);

const form = reactive<DocumentFormState>({
  documentCode: '',
  title: '',
  summary: '',
  contentText: '',
  sourceType: 'text_input',
  sourceFileId: '',
  sourceFileName: '',
  externalUrl: '',
  categoryName: '',
  tags: [],
  ownerDeptId: '',
  chunkStrategyType: 'inherit',
  chunkSize: 1000,
  overlapSize: 200,
  minChunkSize: 100,
  separators: '\\n# ,\\n## ,\\n### ,\\n\\n,\\n,。,；,，',
  targetChunkSize: 1000,
  maxChunkSize: 2000,
  similarityThreshold: 0.72,
  windowSize: 3,
  processingStatus: 'pending',
  remark: '',
});

const pageTitle = computed(() => (selectedKnowledgeBaseName.value ? `文档管理：${selectedKnowledgeBaseName.value}` : '文档管理'));
const formTitle = computed(() => (formMode.value === 'create' ? '新增文档' : '编辑文档'));
const canQueryDocument = computed(() => hasPermission('knowledge:document:query'));
const canViewDocument = computed(() => hasPermission('knowledge:document:detail'));
const canCreateDocument = computed(() => hasPermission('knowledge:document:create'));
const canUpdateDocument = computed(() => hasPermission('knowledge:document:update'));
const canUpdateStatus = computed(() => hasPermission('knowledge:document:status'));
const canReprocessDocument = computed(() => hasPermission('knowledge:document:reprocess'));
const canDeleteDocument = computed(() => hasPermission('knowledge:document:delete'));
const canQueryPermission = computed(() => hasPermission('knowledge:document:permission-query'));
const canQueryChunks = computed(() => hasPermission('knowledge:document-chunk:query'));
const canViewChunkDetail = computed(() => hasPermission('knowledge:document-chunk:detail'));
const canQueryChunkStrategy = computed(() => hasPermission('knowledge:chunk-strategy:query'));
const canViewBaseChunkStrategy = computed(() => hasPermission('knowledge:base:chunk-strategy-detail'));
const canSubmitDocument = computed(() => (formMode.value === 'create' ? canCreateDocument.value : canUpdateDocument.value));
const canOperateDocument = computed(() => hasAnyPermission([
  'knowledge:document:detail',
  'knowledge:document:update',
  'knowledge:document:status',
  'knowledge:document:reprocess',
  'knowledge:document:delete',
  'knowledge:document:permission-query',
  'knowledge:document-chunk:query',
]));
const hasDeptOptions = computed(() => deptOptions.value.length > 0);
const selectedStrategyOption = computed(() =>
  strategyOptions.value.find((option) => option.strategyType === form.chunkStrategyType),
);

function resolveErrorMessage(error: unknown, fallback: string): string {
  return isApiRequestError(error) ? error.message : fallback;
}

function safeText(value: string | null | undefined, fallback = '未设置'): string {
  const normalized = value?.trim() ?? '';
  return normalized || fallback;
}

function sourceTypeText(sourceType: KnowledgeDocumentSourceType): string {
  return {
    text_input: '文本录入',
    uploaded_file: '上传文件',
    external_link: '外部链接',
  }[sourceType];
}

function businessStatusText(status: KnowledgeDocumentBusinessStatus): string {
  return {
    draft: '草稿',
    published: '已发布',
    offline: '已下线',
    archived: '已归档',
  }[status];
}

function businessStatusTagType(status: KnowledgeDocumentBusinessStatus): 'info' | 'success' | 'warning' | 'danger' {
  return ({
    draft: 'info',
    published: 'success',
    offline: 'warning',
    archived: 'danger',
  } as const)[status];
}

function processingStatusText(status: KnowledgeDocumentProcessingStatus): string {
  return {
    pending: '待处理',
    processing: '处理中',
    succeeded: '处理成功',
    failed: '处理失败',
    expired: '已过期',
  }[status];
}

function chunkStrategyText(strategyType: string | null | undefined): string {
  if (!strategyType) {
    return '跟随知识库默认';
  }
  return strategyOptions.value.find((option) => option.strategyType === strategyType)?.strategyName ?? strategyType;
}

function chunkStrategyTagType(executable: boolean | undefined): 'success' | 'warning' {
  return executable ? 'success' : 'warning';
}

function resolvedChunkStrategyText(): string {
  if (form.chunkStrategyType !== 'inherit') {
    return chunkStrategyText(form.chunkStrategyType);
  }
  return baseChunkStrategy.value
    ? chunkStrategyText(baseChunkStrategy.value.resolvedChunkStrategyType)
    : '跟随知识库默认';
}

function ownerDeptText(document: KnowledgeDocument): string {
  if (document.ownerDeptId == null) {
    return '未限定部门';
  }
  return safeText(document.ownerDeptName, String(document.ownerDeptId));
}

function chunkSourcePositionText(chunk: KnowledgeDocumentChunk): string {
  const pageText = chunk.sourcePageNo == null ? '页码未记录' : `第 ${chunk.sourcePageNo} 页`;
  const offsetText = chunk.sourceStartOffset == null || chunk.sourceEndOffset == null
    ? '偏移未记录'
    : `${chunk.sourceStartOffset}-${chunk.sourceEndOffset}`;
  return `${pageText} / ${offsetText}`;
}

function chunkEmptyDescription(): string {
  const document = chunkDocument.value;
  if (!document) {
    return '请选择文档';
  }
  if (!document.activeProcessingVersion) {
    return '当前文档还没有生效处理版本';
  }
  if (document.processingStatus === 'processing') {
    return '文档仍在处理中，分块生成完成后可查看';
  }
  if (document.processingStatus === 'failed') {
    return '文档处理失败，暂无可查看分块';
  }
  if (document.processingStatus === 'expired') {
    return '当前处理结果已过期，请重新处理后查看最新分块';
  }
  return '当前处理版本暂无分块';
}

function normalizeOptionalId(value: string): EntityId | null {
  const normalized = value.trim();
  return normalized ? normalized : null;
}

function splitSeparators(value: string): string[] {
  const separators = value
    .split(',')
    .map((item) => item.trim().replace(/\\n/g, '\n'))
    .filter(Boolean);
  return separators.length > 0 ? separators : ['\n# ', '\n## ', '\n### ', '\n\n', '\n', '。', '；', '，'];
}

function numberValue(config: KnowledgeChunkConfig | null | undefined, key: string, fallback: number): number {
  const value = config?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function separatorsText(config: KnowledgeChunkConfig | null | undefined, key: string, fallback: string): string {
  const value = config?.[key];
  return Array.isArray(value) ? value.map(String).join(',') : fallback;
}

function resetForm(): void {
  form.documentCode = '';
  form.title = '';
  form.summary = '';
  form.contentText = '';
  form.sourceType = 'text_input';
  form.sourceFileId = '';
  form.sourceFileName = '';
  form.externalUrl = '';
  form.categoryName = '';
  form.tags = [];
  form.ownerDeptId = '';
  form.chunkStrategyType = 'inherit';
  form.chunkSize = 1000;
  form.overlapSize = 200;
  form.minChunkSize = 100;
  form.separators = '\\n# ,\\n## ,\\n### ,\\n\\n,\\n,。,；,，';
  form.targetChunkSize = 1000;
  form.maxChunkSize = 2000;
  form.similarityThreshold = 0.72;
  form.windowSize = 3;
  form.processingStatus = 'pending';
  form.remark = '';
}

function fillForm(document: KnowledgeDocument): void {
  form.documentCode = document.documentCode;
  form.title = document.title;
  form.summary = document.summary ?? '';
  form.contentText = document.contentText ?? '';
  form.sourceType = document.sourceType;
  form.sourceFileId = document.sourceFileId ? String(document.sourceFileId) : '';
  form.sourceFileName = document.sourceFileName ?? '';
  form.externalUrl = document.externalUrl ?? '';
  form.categoryName = document.categoryName ?? '';
  form.tags = [...(document.tags ?? [])];
  form.ownerDeptId = document.ownerDeptId ? String(document.ownerDeptId) : '';
  form.chunkStrategyType = document.chunkStrategyType ?? 'inherit';
  const config = document.chunkConfig ?? document.resolvedChunkConfig ?? null;
  form.chunkSize = numberValue(config, 'chunkSize', numberValue(config, 'targetChunkSize', 1000));
  form.overlapSize = numberValue(config, 'overlapSize', 200);
  form.minChunkSize = numberValue(config, 'minChunkSize', 100);
  form.separators = separatorsText(config, form.chunkStrategyType === 'hybrid' ? 'recursiveSeparators' : 'separators', form.separators);
  form.targetChunkSize = numberValue(config, 'targetChunkSize', form.chunkSize);
  form.maxChunkSize = numberValue(config, 'maxChunkSize', Math.max(2000, form.targetChunkSize));
  form.similarityThreshold = numberValue(config, 'similarityThreshold', 0.72);
  form.windowSize = numberValue(config, form.chunkStrategyType === 'hybrid' ? 'semanticWindow' : 'windowSize', 3);
  form.processingStatus = document.processingStatus;
  form.remark = document.remark ?? '';
}

function validateForm(): boolean {
  if (!selectedKnowledgeBaseId.value) {
    showErrorMessage('请选择知识库');
    return false;
  }
  if (formMode.value === 'create' && !form.documentCode.trim()) {
    showErrorMessage('请填写文档编码');
    return false;
  }
  if (!form.title.trim()) {
    showErrorMessage('请填写文档标题');
    return false;
  }
  if (form.sourceType === 'text_input' && !form.contentText.trim()) {
    showErrorMessage('请填写正文内容');
    return false;
  }
  if (form.sourceType === 'uploaded_file' && !form.sourceFileId.trim()) {
    showErrorMessage('请选择来源文件');
    return false;
  }
  if (form.sourceType === 'external_link' && !form.externalUrl.trim()) {
    showErrorMessage('请填写外部链接');
    return false;
  }
  if (form.chunkStrategyType !== 'inherit' && !selectedStrategyOption.value) {
    showErrorMessage('请选择有效的分块策略');
    return false;
  }
  if (form.chunkStrategyType !== 'inherit' && form.overlapSize >= form.chunkSize) {
    showErrorMessage('重叠长度必须小于分块长度');
    return false;
  }
  return true;
}

function buildChunkConfig(): KnowledgeChunkConfig | null {
  if (form.chunkStrategyType === 'inherit') {
    return null;
  }
  if (form.chunkStrategyType === 'recursive') {
    return {
      chunkSize: form.chunkSize,
      overlapSize: form.overlapSize,
      minChunkSize: form.minChunkSize,
      separators: splitSeparators(form.separators),
      keepSeparator: true,
      fallbackStrategy: 'fixed_overlap',
    };
  }
  if (form.chunkStrategyType === 'semantic') {
    return {
      targetChunkSize: form.targetChunkSize,
      minChunkSize: form.minChunkSize,
      maxChunkSize: form.maxChunkSize,
      similarityThreshold: form.similarityThreshold,
      windowSize: form.windowSize,
      fallbackStrategy: 'recursive',
    };
  }
  if (form.chunkStrategyType === 'hybrid') {
    return {
      targetChunkSize: form.targetChunkSize,
      maxChunkSize: form.maxChunkSize,
      recursiveSeparators: splitSeparators(form.separators),
      semanticWindow: form.windowSize,
      similarityThreshold: form.similarityThreshold,
      fallbackStrategy: 'recursive',
    };
  }
  return {
    chunkSize: form.chunkSize,
    overlapSize: form.overlapSize,
    minChunkSize: form.minChunkSize,
    lengthUnit: 'char',
    preserveStructure: true,
  };
}

function buildPayload(): KnowledgeDocumentCreatePayload | KnowledgeDocumentUpdatePayload | null {
  if (!validateForm()) {
    return null;
  }
  const basePayload: KnowledgeDocumentUpdatePayload = {
    title: form.title.trim(),
    summary: form.summary.trim(),
    contentText: form.sourceType === 'text_input' ? form.contentText.trim() : null,
    sourceType: form.sourceType,
    sourceFileId: form.sourceType === 'uploaded_file' ? normalizeOptionalId(form.sourceFileId) : null,
    externalUrl: form.sourceType === 'external_link' ? form.externalUrl.trim() : '',
    categoryName: form.categoryName.trim(),
    tags: form.tags.map((tag) => tag.trim()).filter(Boolean),
    ownerDeptId: normalizeOptionalId(form.ownerDeptId),
    chunkStrategyType: form.chunkStrategyType,
    chunkConfig: buildChunkConfig(),
    remark: form.remark.trim(),
  };
  if (formMode.value === 'create') {
    return {
      knowledgeBaseId: selectedKnowledgeBaseId.value,
      documentCode: form.documentCode.trim(),
      businessStatus: 'draft',
      ...basePayload,
    };
  }
  return basePayload;
}

async function loadDocuments(): Promise<void> {
  if (!canQueryDocument.value) {
    documents.value = [];
    total.value = 0;
    return;
  }
  loading.value = true;
  try {
    const pageData = await knowledgeApi.listKnowledgeDocuments({
      pageNo: pageNo.value,
      pageSize: pageSize.value,
      knowledgeBaseId: selectedKnowledgeBaseId.value,
      keyword: keyword.value.trim(),
      sourceType: sourceTypeFilter.value,
      businessStatus: businessStatusFilter.value,
      processingStatus: processingStatusFilter.value,
    });
    if (pageData.list.length === 0 && pageData.total > 0 && pageNo.value > 1) {
      // 删除后当前页可能为空，回退到最后一页保持列表可见。
      pageNo.value = Math.max(1, Math.ceil(pageData.total / pageSize.value));
      await loadDocuments();
      return;
    }
    pageNo.value = pageData.pageNo;
    pageSize.value = pageData.pageSize;
    total.value = pageData.total;
    documents.value = pageData.list;
  } catch (error) {
    showErrorMessage(resolveErrorMessage(error, '文档加载失败'));
  } finally {
    loading.value = false;
  }
}

async function loadDeptOptions(): Promise<void> {
  if (!hasPermission('system:dept:list')) {
    deptOptions.value = [];
    return;
  }
  try {
    deptOptions.value = await systemApi.listDepartments();
  } catch (error) {
    showErrorMessage(resolveErrorMessage(error, '部门选项加载失败'));
  }
}

async function loadChunkStrategyOptions(): Promise<void> {
  if (canQueryChunkStrategy.value) {
    try {
      strategyOptions.value = await knowledgeApi.listKnowledgeChunkStrategies(true);
    } catch (error) {
      showErrorMessage(resolveErrorMessage(error, '分块策略选项加载失败'));
    }
  }
  if (canViewBaseChunkStrategy.value && selectedKnowledgeBaseId.value) {
    try {
      baseChunkStrategy.value = await knowledgeApi.getKnowledgeBaseChunkStrategy(selectedKnowledgeBaseId.value);
    } catch (error) {
      showErrorMessage(resolveErrorMessage(error, '知识库默认分块策略加载失败'));
    }
  }
}

async function searchDocuments(): Promise<void> {
  pageNo.value = 1;
  await loadDocuments();
}

async function handlePageChange(nextPageNo: number): Promise<void> {
  pageNo.value = nextPageNo;
  await loadDocuments();
}

async function handleSizeChange(nextPageSize: number): Promise<void> {
  pageSize.value = nextPageSize;
  pageNo.value = 1;
  await loadDocuments();
}

function openCreateDocument(): void {
  formMode.value = 'create';
  editingDocumentId.value = null;
  resetForm();
  void loadChunkStrategyOptions();
  formVisible.value = true;
}

async function openEditDocument(document: KnowledgeDocument): Promise<void> {
  if (!canViewDocument.value) {
    showErrorMessage('暂无文档详情权限');
    return;
  }
  formMode.value = 'edit';
  editingDocumentId.value = document.documentId;
  try {
    await loadChunkStrategyOptions();
    fillForm(await knowledgeApi.getKnowledgeDocument(document.documentId));
    formVisible.value = true;
  } catch (error) {
    showErrorMessage(resolveErrorMessage(error, '文档详情加载失败'));
  }
}

async function submitDocument(): Promise<void> {
  const payload = buildPayload();
  if (!payload) {
    return;
  }
  saving.value = true;
  try {
    if (formMode.value === 'create') {
      await knowledgeApi.createKnowledgeDocument(payload as KnowledgeDocumentCreatePayload);
      pageNo.value = 1;
      showSuccessMessage('文档已新增');
    } else if (editingDocumentId.value) {
      await knowledgeApi.updateKnowledgeDocument(editingDocumentId.value, payload as KnowledgeDocumentUpdatePayload);
      showSuccessMessage('文档已保存');
    }
    formVisible.value = false;
    await loadDocuments();
    emit('changed');
  } catch (error) {
    showErrorMessage(resolveErrorMessage(error, '文档保存失败'));
  } finally {
    saving.value = false;
  }
}

async function changeBusinessStatus(document: KnowledgeDocument, nextStatus: KnowledgeDocumentBusinessStatus): Promise<void> {
  const confirmed = await confirmAction({
    title: businessStatusText(nextStatus),
    message: `确认将文档“${document.title}”更新为${businessStatusText(nextStatus)}吗？`,
    confirmButtonText: businessStatusText(nextStatus),
  });
  if (!confirmed) {
    return;
  }
  try {
    await knowledgeApi.updateKnowledgeDocumentBusinessStatus(document.documentId, { businessStatus: nextStatus });
    showSuccessMessage(`文档已${businessStatusText(nextStatus)}`);
    await loadDocuments();
    emit('changed');
  } catch (error) {
    showErrorMessage(resolveErrorMessage(error, '文档状态更新失败'));
  }
}

async function reprocessDocument(document: KnowledgeDocument): Promise<void> {
  const confirmed = await confirmAction({
    title: '重新处理',
    message: `确认重新处理文档“${document.title}”吗？系统会重新解析来源并在后台重建分块和向量索引。`,
    confirmButtonText: '重新处理',
  });
  if (!confirmed) {
    return;
  }
  try {
    await knowledgeApi.reprocessKnowledgeDocument(document.documentId);
    showSuccessMessage('文档已提交重新处理');
    await loadDocuments();
    emit('changed');
  } catch (error) {
    showErrorMessage(resolveErrorMessage(error, '文档重新处理失败'));
  }
}

async function deleteDocument(document: KnowledgeDocument): Promise<void> {
  const confirmed = await confirmAction({
    title: '删除文档',
    message: `确认删除文档“${document.title}”吗？删除后编码可重新使用。`,
    confirmButtonText: '删除',
  });
  if (!confirmed) {
    return;
  }
  try {
    await knowledgeApi.deleteKnowledgeDocument(document.documentId);
    showSuccessMessage('文档已删除');
    await loadDocuments();
    emit('changed');
  } catch (error) {
    showErrorMessage(resolveErrorMessage(error, '文档删除失败'));
  }
}

function openPermission(document: KnowledgeDocument): void {
  permissionDocumentId.value = document.documentId;
  permissionVisible.value = true;
}

async function openChunks(document: KnowledgeDocument): Promise<void> {
  chunkDocument.value = document;
  chunks.value = [];
  selectedChunk.value = null;
  chunkPageNo.value = 1;
  chunkTotal.value = 0;
  chunkVisible.value = true;
  await loadChunks();
}

async function loadChunks(): Promise<void> {
  const document = chunkDocument.value;
  if (!document || !canQueryChunks.value) {
    chunks.value = [];
    chunkTotal.value = 0;
    return;
  }
  if (!document.activeProcessingVersion) {
    chunks.value = [];
    chunkTotal.value = 0;
    return;
  }
  chunkLoading.value = true;
  try {
    const pageData = await knowledgeApi.listKnowledgeDocumentChunks(document.documentId, {
      pageNo: chunkPageNo.value,
      pageSize: chunkPageSize.value,
      processingVersion: document.activeProcessingVersion,
    });
    chunkPageNo.value = pageData.pageNo;
    chunkPageSize.value = pageData.pageSize;
    chunkTotal.value = pageData.total;
    chunks.value = pageData.list;
  } catch (error) {
    showErrorMessage(resolveErrorMessage(error, '分块列表加载失败'));
  } finally {
    chunkLoading.value = false;
  }
}

async function handleChunkPageChange(nextPageNo: number): Promise<void> {
  chunkPageNo.value = nextPageNo;
  await loadChunks();
}

async function handleChunkSizeChange(nextPageSize: number): Promise<void> {
  chunkPageSize.value = nextPageSize;
  chunkPageNo.value = 1;
  await loadChunks();
}

async function viewChunkDetail(chunk: KnowledgeDocumentChunk): Promise<void> {
  const document = chunkDocument.value;
  if (!document || !canViewChunkDetail.value) {
    return;
  }
  chunkDetailLoading.value = true;
  try {
    selectedChunk.value = await knowledgeApi.getKnowledgeDocumentChunk(document.documentId, chunk.chunkId);
  } catch (error) {
    showErrorMessage(resolveErrorMessage(error, '分块详情加载失败'));
  } finally {
    chunkDetailLoading.value = false;
  }
}

function handleUploaded(file: SystemFile): void {
  // 上传文件只回填来源文件ID，是否可用于文档来源仍以后端保存校验为准。
  form.sourceType = 'uploaded_file';
  form.sourceFileId = String(file.fileId);
  form.sourceFileName = file.originFileName;
  form.title = file.originFileName;
}

function canPublish(document: KnowledgeDocument): boolean {
  return canUpdateStatus.value && (document.businessStatus === 'draft' || document.businessStatus === 'offline');
}

function canOffline(document: KnowledgeDocument): boolean {
  return canUpdateStatus.value && document.businessStatus === 'published';
}

function canArchive(document: KnowledgeDocument): boolean {
  return canUpdateStatus.value && document.businessStatus !== 'archived';
}

function canReprocess(document: KnowledgeDocument): boolean {
  return canReprocessDocument.value
    && document.businessStatus === 'published'
    && document.processingStatus !== 'processing'
    && document.sourceType !== 'external_link';
}

function backToKnowledgeBases(): void {
  router.push({ name: 'KnowledgeLibrary' });
}

watch(() => props.modelValue, async (visible) => {
  if (visible) {
    pageNo.value = 1;
    await Promise.all([loadDocuments(), loadDeptOptions(), loadChunkStrategyOptions()]);
  }
});

watch(() => route.query.baseId, async () => {
  pageNo.value = 1;
  await Promise.all([loadDocuments(), loadChunkStrategyOptions()]);
});

onMounted(async () => {
  await Promise.all([loadDocuments(), loadDeptOptions(), loadChunkStrategyOptions()]);
});
</script>

<template>
  <section class="workspace-card system-page knowledge-document-page">
    <div class="system-page__header">
      <div>
        <h2 class="section-heading__title">{{ pageTitle }}</h2>
        <p class="section-heading__desc">维护知识库文档来源、元数据、权限和处理状态。</p>
      </div>
      <el-button @click="backToKnowledgeBases">返回知识库</el-button>
    </div>
    <div class="document-toolbar">
      <el-input v-model="keyword" clearable placeholder="搜索标题、编码、摘要、分类或文件名" @keyup.enter="searchDocuments" />
      <el-select v-model="sourceTypeFilter" placeholder="全部来源" clearable>
        <el-option label="全部来源" value="" />
        <el-option label="文本录入" value="text_input" />
        <el-option label="上传文件" value="uploaded_file" />
        <el-option label="外部链接" value="external_link" />
      </el-select>
      <el-select v-model="businessStatusFilter" placeholder="全部业务状态" clearable>
        <el-option label="全部业务状态" value="" />
        <el-option label="草稿" value="draft" />
        <el-option label="已发布" value="published" />
        <el-option label="已下线" value="offline" />
        <el-option label="已归档" value="archived" />
      </el-select>
      <el-select v-model="processingStatusFilter" placeholder="全部处理状态" clearable>
        <el-option label="全部处理状态" value="" />
        <el-option label="待处理" value="pending" />
        <el-option label="处理中" value="processing" />
        <el-option label="处理成功" value="succeeded" />
        <el-option label="处理失败" value="failed" />
        <el-option label="已过期" value="expired" />
      </el-select>
      <el-button type="primary" :disabled="!canQueryDocument" @click="searchDocuments">查询</el-button>
      <el-button v-if="canCreateDocument" type="primary" @click="openCreateDocument">新增文档</el-button>
    </div>

    <el-empty v-if="!canQueryDocument" description="暂无文档查询权限" />
    <template v-else>
      <el-table v-loading="loading" :data="documents" border row-key="documentId" class="document-table">
        <el-table-column label="文档标题" min-width="190" show-overflow-tooltip>
          <template #default="{ row }">
            <div class="document-title">
              <span>{{ row.title }}</span>
              <el-tag :type="businessStatusTagType(row.businessStatus)" size="small">
                {{ row.businessStatusName || businessStatusText(row.businessStatus) }}
              </el-tag>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="documentCode" label="编码" min-width="150" show-overflow-tooltip />
        <el-table-column label="来源" width="104">
          <template #default="{ row }">{{ row.sourceTypeName || sourceTypeText(row.sourceType) }}</template>
        </el-table-column>
        <el-table-column label="分类" min-width="110" show-overflow-tooltip>
          <template #default="{ row }">{{ safeText(row.categoryName) }}</template>
        </el-table-column>
        <el-table-column label="标签" min-width="150" show-overflow-tooltip>
          <template #default="{ row }">{{ row.tags?.length ? row.tags.join('，') : '未设置' }}</template>
        </el-table-column>
        <el-table-column label="归属部门" min-width="120" show-overflow-tooltip>
          <template #default="{ row }">{{ ownerDeptText(row) }}</template>
        </el-table-column>
        <el-table-column label="处理状态" width="112">
          <template #default="{ row }">{{ row.processingStatusName || processingStatusText(row.processingStatus) }}</template>
        </el-table-column>
        <el-table-column label="分块策略" min-width="130" show-overflow-tooltip>
          <template #default="{ row }">{{ chunkStrategyText(row.chunkStrategyType) }}</template>
        </el-table-column>
        <el-table-column prop="businessVersion" label="业务版本" width="94" />
        <el-table-column label="摘要" min-width="210" show-overflow-tooltip>
          <template #default="{ row }">{{ safeText(row.summary) }}</template>
        </el-table-column>
        <el-table-column v-if="canOperateDocument" label="操作" width="396" fixed="right">
          <template #default="{ row }">
            <el-button v-if="canViewDocument && canUpdateDocument" link type="primary" @click="openEditDocument(row)">编辑</el-button>
            <el-button v-if="canQueryChunks" link type="primary" @click="openChunks(row)">分块</el-button>
            <el-button v-if="canPublish(row)" link type="primary" @click="changeBusinessStatus(row, 'published')">发布</el-button>
            <el-button v-if="canReprocess(row)" link type="primary" @click="reprocessDocument(row)">重新处理</el-button>
            <el-button v-if="canOffline(row)" link type="primary" @click="changeBusinessStatus(row, 'offline')">下线</el-button>
            <el-button v-if="canArchive(row)" link type="primary" @click="changeBusinessStatus(row, 'archived')">归档</el-button>
            <el-button v-if="canQueryPermission" link type="primary" @click="openPermission(row)">权限</el-button>
            <el-button v-if="canDeleteDocument" link type="danger" @click="deleteDocument(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
      <div class="document-pagination">
        <el-pagination
          v-model:current-page="pageNo"
          v-model:page-size="pageSize"
          background
          :page-sizes="[10, 20, 50, 100]"
          :total="total"
          layout="total, sizes, prev, pager, next"
          @current-change="handlePageChange"
          @size-change="handleSizeChange"
        />
      </div>
    </template>

    <el-dialog v-model="formVisible" :title="formTitle" width="860px" align-center append-to-body>
      <el-form :model="form" label-position="top" class="document-form">
        <div class="document-form__grid">
          <el-form-item label="文档编码" required>
            <el-input v-if="formMode === 'create'" v-model="form.documentCode" maxlength="64" placeholder="例如 doc_policy_001" />
            <el-input v-else v-model="form.documentCode" disabled />
          </el-form-item>
          <el-form-item label="文档标题" required>
            <el-input v-model="form.title" maxlength="256" placeholder="请输入文档标题" />
          </el-form-item>
          <el-form-item label="来源类型" required>
            <el-radio-group v-model="form.sourceType">
              <el-radio-button label="text_input">文本录入</el-radio-button>
              <el-radio-button label="uploaded_file">上传文件</el-radio-button>
              <el-radio-button label="external_link">外部链接</el-radio-button>
            </el-radio-group>
          </el-form-item>
          <el-form-item label="归属部门">
            <el-select v-if="hasDeptOptions" v-model="form.ownerDeptId" clearable filterable placeholder="不限定部门">
              <el-option label="不限定部门" value="" />
              <el-option
                v-for="dept in deptOptions"
                :key="dept.deptId"
                :label="dept.deptName"
                :value="String(dept.deptId)"
              />
            </el-select>
            <el-input v-else v-model="form.ownerDeptId" clearable placeholder="归属部门ID，可为空" />
          </el-form-item>
          <el-form-item label="分类">
            <el-input v-model="form.categoryName" maxlength="128" placeholder="例如 制度流程" />
          </el-form-item>
          <el-form-item label="处理状态">
            <el-input :model-value="processingStatusText(form.processingStatus)" disabled />
          </el-form-item>
        </div>

        <div class="document-section-title">分块设置</div>
        <el-alert
          title="保存配置不等于立即生成分块；发布或处理文档时才会生成处理版本和 chunk。"
          type="info"
          :closable="false"
          show-icon
        />
        <div class="chunk-strategy-summary">
          <span>最终生效</span>
          <el-tag :type="chunkStrategyTagType(selectedStrategyOption?.executable)">
            {{ resolvedChunkStrategyText() }}
          </el-tag>
          <span v-if="selectedStrategyOption && !selectedStrategyOption.executable" class="chunk-strategy-summary__warning">
            {{ selectedStrategyOption.disabledReason }}
          </span>
        </div>
        <div class="document-form__grid">
          <el-form-item label="分块方式">
            <el-select v-model="form.chunkStrategyType" filterable>
              <el-option
                v-for="option in strategyOptions"
                :key="option.strategyType"
                :label="option.strategyName"
                :value="option.strategyType"
              >
                <span>{{ option.strategyName }}</span>
                <el-tag
                  v-if="option.strategyType !== 'inherit'"
                  class="chunk-option-tag"
                  size="small"
                  :type="chunkStrategyTagType(option.executable)"
                >
                  {{ option.executable ? '可执行' : '预留' }}
                </el-tag>
              </el-option>
            </el-select>
          </el-form-item>
          <el-form-item
            v-if="form.chunkStrategyType === 'fixed_overlap' || form.chunkStrategyType === 'recursive'"
            label="分块长度"
          >
            <el-input-number v-model="form.chunkSize" :min="300" :max="4000" controls-position="right" />
          </el-form-item>
          <el-form-item
            v-if="form.chunkStrategyType === 'fixed_overlap' || form.chunkStrategyType === 'recursive'"
            label="重叠长度"
          >
            <el-input-number v-model="form.overlapSize" :min="0" :max="1000" controls-position="right" />
          </el-form-item>
          <el-form-item v-if="form.chunkStrategyType !== 'inherit' && form.chunkStrategyType !== 'hybrid'" label="最小片段长度">
            <el-input-number v-model="form.minChunkSize" :min="20" :max="4000" controls-position="right" />
          </el-form-item>
          <el-form-item
            v-if="form.chunkStrategyType === 'semantic' || form.chunkStrategyType === 'hybrid'"
            label="目标片段长度"
          >
            <el-input-number v-model="form.targetChunkSize" :min="300" :max="4000" controls-position="right" />
          </el-form-item>
          <el-form-item
            v-if="form.chunkStrategyType === 'semantic' || form.chunkStrategyType === 'hybrid'"
            label="最大片段长度"
          >
            <el-input-number v-model="form.maxChunkSize" :min="300" :max="8000" controls-position="right" />
          </el-form-item>
          <el-form-item
            v-if="form.chunkStrategyType === 'semantic' || form.chunkStrategyType === 'hybrid'"
            label="语义相似度阈值"
          >
            <el-input-number
              v-model="form.similarityThreshold"
              :min="0.1"
              :max="0.95"
              :step="0.01"
              controls-position="right"
            />
          </el-form-item>
          <el-form-item
            v-if="form.chunkStrategyType === 'semantic' || form.chunkStrategyType === 'hybrid'"
            label="语义窗口"
          >
            <el-input-number v-model="form.windowSize" :min="1" :max="8" controls-position="right" />
          </el-form-item>
        </div>
        <el-form-item v-if="form.chunkStrategyType === 'recursive' || form.chunkStrategyType === 'hybrid'" label="结构分隔符">
          <el-input v-model="form.separators" type="textarea" :rows="3" />
        </el-form-item>

        <el-form-item v-if="form.sourceType === 'text_input'" label="正文内容" required>
          <el-input v-model="form.contentText" type="textarea" :rows="7" placeholder="请输入正文快照" />
        </el-form-item>
        <el-form-item v-if="form.sourceType === 'uploaded_file'" label="来源文件" required>
          <div class="document-file-picker">
            <el-input v-model="form.sourceFileName" disabled placeholder="请选择来源文件" />
            <el-button @click="uploadVisible = true">上传文件</el-button>
          </div>
        </el-form-item>
        <el-form-item v-if="form.sourceType === 'external_link'" label="外部链接" required>
          <div class="document-external-link">
            <el-input v-model="form.externalUrl" maxlength="1024" placeholder="https://example.com/doc" />
            <el-alert
              title="当前仅保存链接地址，不会抓取网页正文；需要入库检索的内容请先使用文本录入或上传文件。"
              type="warning"
              :closable="false"
              show-icon
            />
          </div>
        </el-form-item>

        <el-form-item label="标签">
          <el-select
            v-model="form.tags"
            multiple
            filterable
            allow-create
            default-first-option
            placeholder="输入后回车添加标签"
          />
        </el-form-item>
        <el-form-item label="摘要">
          <el-input v-model="form.summary" type="textarea" :rows="3" maxlength="1000" show-word-limit />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="form.remark" type="textarea" :rows="2" maxlength="500" show-word-limit />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="formVisible = false">取消</el-button>
        <el-button v-if="canSubmitDocument" type="primary" :loading="saving" @click="submitDocument">保存</el-button>
      </template>
    </el-dialog>

    <SystemFileUploadDialog
      v-model="uploadVisible"
      default-source-module="knowledge_document"
      default-source-biz-type="document_source"
      :default-source-biz-name="form.title"
      append-to-body
      @uploaded="handleUploaded"
    />

    <KnowledgeDocumentPermissionDialog
      v-if="permissionDocumentId"
      v-model="permissionVisible"
      :document-id="permissionDocumentId"
    />

    <el-drawer v-model="chunkVisible" title="文档分块" size="72%" append-to-body>
      <div v-if="chunkDocument" class="chunk-drawer">
        <div class="chunk-drawer__summary">
          <div>
            <div class="chunk-drawer__title">{{ chunkDocument.title }}</div>
            <div class="chunk-drawer__meta">
              当前处理版本：{{ chunkDocument.activeProcessingVersion || '未生成' }} /
              处理状态：{{ chunkDocument.processingStatusName || processingStatusText(chunkDocument.processingStatus) }}
            </div>
          </div>
          <el-tag :type="businessStatusTagType(chunkDocument.businessStatus)">
            {{ chunkDocument.businessStatusName || businessStatusText(chunkDocument.businessStatus) }}
          </el-tag>
        </div>

        <el-empty v-if="!canQueryChunks" description="暂无分块查询权限" />
        <template v-else>
          <el-table v-loading="chunkLoading" :data="chunks" border row-key="chunkId" class="chunk-table">
            <el-table-column prop="chunkSeq" label="序号" width="72" />
            <el-table-column label="标题路径" min-width="170" show-overflow-tooltip>
              <template #default="{ row }">{{ safeText(row.titlePath, '未记录标题路径') }}</template>
            </el-table-column>
            <el-table-column label="来源位置" min-width="150" show-overflow-tooltip>
              <template #default="{ row }">{{ chunkSourcePositionText(row) }}</template>
            </el-table-column>
            <el-table-column prop="charCount" label="字符数" width="86" />
            <el-table-column prop="tokenCount" label="Token" width="86" />
            <el-table-column label="片段摘要" min-width="280" show-overflow-tooltip>
              <template #default="{ row }">{{ safeText(row.contentText, '暂无摘要') }}</template>
            </el-table-column>
            <el-table-column label="状态" width="84">
              <template #default="{ row }">
                <el-tag :type="row.enabled ? 'success' : 'info'" size="small">{{ row.enabled ? '可检索' : '停用' }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column v-if="canViewChunkDetail" label="操作" width="80" fixed="right">
              <template #default="{ row }">
                <el-button link type="primary" @click="viewChunkDetail(row)">详情</el-button>
              </template>
            </el-table-column>
          </el-table>
          <el-empty v-if="!chunkLoading && chunks.length === 0" :description="chunkEmptyDescription()" />
          <div class="document-pagination">
            <el-pagination
              v-model:current-page="chunkPageNo"
              v-model:page-size="chunkPageSize"
              background
              :page-sizes="[10, 20, 50, 100]"
              :total="chunkTotal"
              layout="total, sizes, prev, pager, next"
              @current-change="handleChunkPageChange"
              @size-change="handleChunkSizeChange"
            />
          </div>
        </template>

        <el-divider />
        <el-skeleton v-if="chunkDetailLoading" :rows="5" animated />
        <div v-else-if="selectedChunk" class="chunk-detail">
          <div class="chunk-detail__header">
            <strong>Chunk #{{ selectedChunk.chunkSeq }}</strong>
            <span>{{ chunkSourcePositionText(selectedChunk) }}</span>
          </div>
          <div class="chunk-detail__meta">
            <span>处理版本：{{ selectedChunk.processingVersion }}</span>
            <span>业务版本：{{ selectedChunk.basedOnBusinessVersion }}</span>
            <span>字符数：{{ selectedChunk.charCount }}</span>
            <span>Token：{{ selectedChunk.tokenCount }}</span>
          </div>
          <el-input :model-value="selectedChunk.contentText" type="textarea" :rows="10" readonly />
        </div>
        <el-empty v-else description="选择一个分块查看详情" />
      </div>
    </el-drawer>
  </section>
</template>

<style scoped>
.document-toolbar {
  display: flex;
  gap: 10px;
  align-items: center;
  margin-bottom: 12px;
}

.document-toolbar .el-input {
  width: 280px;
}

.document-toolbar .el-select {
  width: 150px;
}

.document-table {
  width: 100%;
}

.document-title {
  display: flex;
  gap: 8px;
  align-items: center;
  min-width: 0;
}

.document-title span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.document-pagination {
  display: flex;
  justify-content: flex-end;
  margin-top: 12px;
}

.document-form__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 16px;
}

.document-section-title {
  margin: 4px 0 10px;
  font-size: 15px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.chunk-strategy-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin: 10px 0 12px;
  color: var(--el-text-color-regular);
}

.chunk-strategy-summary__warning {
  color: var(--el-color-warning);
}

.chunk-option-tag {
  margin-left: 8px;
}

.document-form :deep(.el-input-number) {
  width: 100%;
}

.document-file-picker {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  width: 100%;
}

.document-external-link {
  display: grid;
  gap: 8px;
  width: 100%;
}

.chunk-drawer {
  display: grid;
  gap: 14px;
}

.chunk-drawer__summary,
.chunk-detail__header,
.chunk-detail__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  justify-content: space-between;
}

.chunk-drawer__title {
  font-size: 16px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.chunk-drawer__meta,
.chunk-detail__meta {
  margin-top: 4px;
  color: var(--el-text-color-secondary);
}

.chunk-table {
  width: 100%;
}

.chunk-detail {
  display: grid;
  gap: 10px;
}

@media (max-width: 860px) {
  .document-toolbar,
  .document-form__grid,
  .document-file-picker {
    display: grid;
    grid-template-columns: 1fr;
  }

  .document-toolbar .el-input,
  .document-toolbar .el-select {
    width: 100%;
  }
}
</style>
