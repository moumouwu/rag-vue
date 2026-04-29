<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { systemApi } from '@/api/modules/system';
import { isApiRequestError } from '@/api/request';
import type {
  EntityId,
  SystemDictItem,
  SystemDictItemCreatePayload,
  SystemDictItemUpdatePayload,
  SystemDictType,
  SystemDictTypeCreatePayload,
  SystemDictTypeUpdatePayload,
} from '@/types';
import { confirmAction, showErrorMessage, showSuccessMessage } from '@/utils/ui-feedback';

type FormMode = 'create' | 'edit';

const dictTypes = ref<SystemDictType[]>([]);
const dictItems = ref<SystemDictItem[]>([]);
const selectedTypeId = ref<EntityId | ''>('');
const typeLoading = ref(false);
const itemLoading = ref(false);
const saving = ref(false);
const typeDialogVisible = ref(false);
const itemDialogVisible = ref(false);
const typeFormMode = ref<FormMode>('create');
const itemFormMode = ref<FormMode>('create');
const editingItemId = ref<EntityId | null>(null);
const typeKeyword = ref('');
const typeStatusFilter = ref<'enabled' | 'disabled' | ''>('');
const typePageNo = ref(1);
const typePageSize = ref(10);
const typeTotal = ref(0);
const itemKeyword = ref('');

const typeForm = reactive<SystemDictTypeCreatePayload>({
  dictTypeCode: '',
  dictTypeName: '',
  sortOrder: 10,
  typeStatus: 'enabled',
  remark: '',
});

const itemForm = reactive<SystemDictItemCreatePayload>({
  itemValue: '',
  itemLabel: '',
  sortOrder: 10,
  itemStatus: 'enabled',
  remark: '',
});

const selectedType = computed(() =>
  dictTypes.value.find((dictType) => dictType.dictTypeId === selectedTypeId.value) ?? null,
);
const typeDialogTitle = computed(() => (typeFormMode.value === 'create' ? '新增字典类型' : '编辑字典类型'));
const itemDialogTitle = computed(() => (itemFormMode.value === 'create' ? '新增字典项' : '编辑字典项'));
const currentPageEnabledTypeCount = computed(
  () => dictTypes.value.filter((dictType) => dictType.typeStatus === 'enabled').length,
);
const enabledItemCount = computed(
  () => dictItems.value.filter((dictItem) => dictItem.itemStatus === 'enabled').length,
);

const filteredItems = computed(() => {
  const keyword = itemKeyword.value.trim().toLowerCase();
  if (!keyword) {
    return dictItems.value;
  }
  return dictItems.value.filter((dictItem) =>
    [dictItem.itemLabel, dictItem.itemValue, dictItem.remark]
      .some((value) => safeText(value).toLowerCase().includes(keyword)),
  );
});

function resolveErrorMessage(error: unknown, fallback: string): string {
  return isApiRequestError(error) ? error.message : fallback;
}

function safeText(value: string | null | undefined): string {
  return value?.trim() ?? '';
}

function statusText(status: string): string {
  return status === 'enabled' ? '启用' : '停用';
}

function resetTypeForm(): void {
  typeForm.dictTypeCode = '';
  typeForm.dictTypeName = '';
  typeForm.sortOrder = 10;
  typeForm.typeStatus = 'enabled';
  typeForm.remark = '';
}

function resetItemForm(): void {
  itemForm.itemValue = '';
  itemForm.itemLabel = '';
  itemForm.sortOrder = 10;
  itemForm.itemStatus = 'enabled';
  itemForm.remark = '';
}

async function loadTypes(): Promise<void> {
  typeLoading.value = true;
  try {
    const pageData = await systemApi.listDictTypes({
      pageNo: typePageNo.value,
      pageSize: typePageSize.value,
      keyword: typeKeyword.value.trim(),
      typeStatus: typeStatusFilter.value,
    });
    if (pageData.list.length === 0 && pageData.total > 0 && typePageNo.value > 1) {
      // 删除或筛选导致当前页无数据时，回到最后一页，避免右侧停留在空选择上。
      typePageNo.value = Math.max(1, Math.ceil(pageData.total / typePageSize.value));
      await loadTypes();
      return;
    }
    typePageNo.value = pageData.pageNo;
    typePageSize.value = pageData.pageSize;
    typeTotal.value = pageData.total;
    dictTypes.value = pageData.list;
    if (!dictTypes.value.some((dictType) => dictType.dictTypeId === selectedTypeId.value)) {
      selectedTypeId.value = dictTypes.value[0]?.dictTypeId ?? '';
    }
    await loadItems();
  } catch (error) {
    showErrorMessage(resolveErrorMessage(error, '字典类型加载失败'));
  } finally {
    typeLoading.value = false;
  }
}

async function searchTypes(): Promise<void> {
  typePageNo.value = 1;
  await loadTypes();
}

async function handleTypePageChange(pageNo: number): Promise<void> {
  typePageNo.value = pageNo;
  await loadTypes();
}

async function handleTypeSizeChange(pageSize: number): Promise<void> {
  typePageSize.value = pageSize;
  typePageNo.value = 1;
  await loadTypes();
}

async function loadItems(): Promise<void> {
  if (!selectedTypeId.value) {
    dictItems.value = [];
    return;
  }
  itemLoading.value = true;
  try {
    dictItems.value = await systemApi.listDictItems(selectedTypeId.value);
  } catch (error) {
    showErrorMessage(resolveErrorMessage(error, '字典项加载失败'));
  } finally {
    itemLoading.value = false;
  }
}

async function selectType(dictType: SystemDictType): Promise<void> {
  if (selectedTypeId.value === dictType.dictTypeId) {
    return;
  }
  selectedTypeId.value = dictType.dictTypeId;
  itemKeyword.value = '';
  await loadItems();
}

function openCreateType(): void {
  typeFormMode.value = 'create';
  resetTypeForm();
  typeDialogVisible.value = true;
}

function openEditType(dictType: SystemDictType): void {
  typeFormMode.value = 'edit';
  typeForm.dictTypeCode = dictType.dictTypeCode;
  typeForm.dictTypeName = dictType.dictTypeName;
  typeForm.sortOrder = dictType.sortOrder;
  typeForm.typeStatus = dictType.typeStatus;
  typeForm.remark = dictType.remark ?? '';
  typeDialogVisible.value = true;
}

function buildTypePayload(): SystemDictTypeCreatePayload | null {
  // 只做基础必填拦截，编码唯一性和预置保护以后端为准。
  const payload: SystemDictTypeCreatePayload = {
    dictTypeCode: typeForm.dictTypeCode.trim(),
    dictTypeName: typeForm.dictTypeName.trim(),
    sortOrder: typeForm.sortOrder,
    typeStatus: typeForm.typeStatus,
    remark: typeForm.remark.trim(),
  };
  if (typeFormMode.value === 'create' && !payload.dictTypeCode) {
    showErrorMessage('请填写字典类型编码');
    return null;
  }
  if (!payload.dictTypeName) {
    showErrorMessage('请填写字典类型名称');
    return null;
  }
  return payload;
}

async function submitType(): Promise<void> {
  const payload = buildTypePayload();
  if (!payload) {
    return;
  }
  saving.value = true;
  try {
    if (typeFormMode.value === 'create') {
      const created = await systemApi.createDictType(payload);
      typeKeyword.value = '';
      typeStatusFilter.value = '';
      typePageNo.value = 1;
      selectedTypeId.value = created.dictTypeId;
      showSuccessMessage('字典类型已新增');
    } else if (selectedType.value) {
      const updatePayload: SystemDictTypeUpdatePayload = {
        dictTypeName: payload.dictTypeName,
        sortOrder: payload.sortOrder,
        typeStatus: payload.typeStatus,
        remark: payload.remark,
      };
      await systemApi.updateDictType(selectedType.value.dictTypeId, updatePayload);
      showSuccessMessage('字典类型已保存');
    }
    typeDialogVisible.value = false;
    await loadTypes();
  } catch (error) {
    showErrorMessage(resolveErrorMessage(error, '字典类型保存失败'));
  } finally {
    saving.value = false;
  }
}

async function deleteType(dictType: SystemDictType): Promise<void> {
  const confirmed = await confirmAction({
    title: '删除字典类型',
    message: `确认删除字典类型“${dictType.dictTypeName}”吗？`,
    confirmButtonText: '删除',
  });
  if (!confirmed) {
    return;
  }
  try {
    await systemApi.deleteDictType(dictType.dictTypeId);
    showSuccessMessage('字典类型已删除');
    if (selectedTypeId.value === dictType.dictTypeId) {
      selectedTypeId.value = '';
    }
    if (dictTypes.value.length === 1 && typePageNo.value > 1) {
      typePageNo.value -= 1;
    }
    await loadTypes();
  } catch (error) {
    showErrorMessage(resolveErrorMessage(error, '字典类型删除失败'));
  }
}

function openCreateItem(): void {
  if (!selectedType.value) {
    showErrorMessage('请先选择字典类型');
    return;
  }
  itemFormMode.value = 'create';
  editingItemId.value = null;
  resetItemForm();
  itemDialogVisible.value = true;
}

function openEditItem(item: SystemDictItem): void {
  itemFormMode.value = 'edit';
  editingItemId.value = item.dictItemId;
  itemForm.itemValue = item.itemValue;
  itemForm.itemLabel = item.itemLabel;
  itemForm.sortOrder = item.sortOrder;
  itemForm.itemStatus = item.itemStatus;
  itemForm.remark = item.remark ?? '';
  itemDialogVisible.value = true;
}

function buildItemPayload(): SystemDictItemCreatePayload | null {
  // 字典值是业务保存值，前端只在新增时提交，编辑时由后端保持不变。
  const payload: SystemDictItemCreatePayload = {
    itemValue: itemForm.itemValue.trim(),
    itemLabel: itemForm.itemLabel.trim(),
    sortOrder: itemForm.sortOrder,
    itemStatus: itemForm.itemStatus,
    remark: itemForm.remark.trim(),
  };
  if (itemFormMode.value === 'create' && !payload.itemValue) {
    showErrorMessage('请填写字典项值');
    return null;
  }
  if (!payload.itemLabel) {
    showErrorMessage('请填写字典项标签');
    return null;
  }
  return payload;
}

async function submitItem(): Promise<void> {
  const payload = buildItemPayload();
  if (!payload || !selectedType.value) {
    return;
  }
  saving.value = true;
  try {
    if (itemFormMode.value === 'create') {
      await systemApi.createDictItem(selectedType.value.dictTypeId, payload);
      showSuccessMessage('字典项已新增');
    } else if (editingItemId.value) {
      const updatePayload: SystemDictItemUpdatePayload = {
        itemLabel: payload.itemLabel,
        sortOrder: payload.sortOrder,
        itemStatus: payload.itemStatus,
        remark: payload.remark,
      };
      await systemApi.updateDictItem(selectedType.value.dictTypeId, editingItemId.value, updatePayload);
      showSuccessMessage('字典项已保存');
    }
    itemDialogVisible.value = false;
    await loadItems();
  } catch (error) {
    showErrorMessage(resolveErrorMessage(error, '字典项保存失败'));
  } finally {
    saving.value = false;
  }
}

async function deleteItem(item: SystemDictItem): Promise<void> {
  if (!selectedType.value) {
    return;
  }
  const confirmed = await confirmAction({
    title: '删除字典项',
    message: `确认删除字典项“${item.itemLabel}”吗？`,
    confirmButtonText: '删除',
  });
  if (!confirmed) {
    return;
  }
  try {
    await systemApi.deleteDictItem(selectedType.value.dictTypeId, item.dictItemId);
    showSuccessMessage('字典项已删除');
    await loadItems();
  } catch (error) {
    showErrorMessage(resolveErrorMessage(error, '字典项删除失败'));
  }
}

onMounted(loadTypes);
</script>

<template>
  <section class="workspace-card system-page">
    <div class="system-page__header">
      <div>
        <h2 class="section-heading__title">数据字典</h2>
        <p class="section-heading__desc">维护系统枚举和展示值，业务保存值保持稳定。</p>
      </div>
      <div class="dict-actions">
        <el-button @click="loadTypes">刷新</el-button>
        <el-button type="primary" @click="openCreateType">新增类型</el-button>
      </div>
    </div>

    <div class="dict-layout">
      <section class="dict-panel dict-panel--types">
        <div class="dict-panel__header">
          <div>
            <h3>字典类型</h3>
            <span>共 {{ typeTotal }} 类，当前页启用 {{ currentPageEnabledTypeCount }} 类</span>
          </div>
          <div class="dict-type-filters">
            <el-input
              v-model="typeKeyword"
              clearable
              placeholder="搜索类型名称或编码"
              class="dict-panel__search"
              @keyup.enter="searchTypes"
            />
            <el-select v-model="typeStatusFilter" class="dict-panel__status" @change="searchTypes">
              <el-option label="全部状态" value="" />
              <el-option label="启用" value="enabled" />
              <el-option label="停用" value="disabled" />
            </el-select>
            <el-button @click="searchTypes">查询</el-button>
          </div>
        </div>
        <el-table
          v-loading="typeLoading"
          :data="dictTypes"
          border
          highlight-current-row
          row-key="dictTypeId"
          class="system-page__table"
          @row-click="selectType"
        >
          <el-table-column prop="dictTypeName" label="类型名称" min-width="130" />
          <el-table-column label="类型标识" min-width="150" show-overflow-tooltip>
            <template #default="{ row }">{{ row.dictTypeCode }}</template>
          </el-table-column>
          <el-table-column label="状态" width="82">
            <template #default="{ row }">
              <el-tag :type="row.typeStatus === 'enabled' ? 'success' : 'danger'">
                {{ statusText(row.typeStatus) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="预置" width="70">
            <template #default="{ row }">{{ row.preset ? '是' : '否' }}</template>
          </el-table-column>
          <el-table-column label="操作" width="136" fixed="right">
            <template #default="{ row }">
              <el-button link type="primary" @click.stop="openEditType(row)">编辑</el-button>
              <el-button link type="danger" :disabled="row.preset" @click.stop="deleteType(row)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
        <div class="dict-pagination">
          <el-pagination
            v-model:current-page="typePageNo"
            v-model:page-size="typePageSize"
            background
            :page-sizes="[10, 20, 50, 100]"
            :total="typeTotal"
            layout="total, sizes, prev, pager, next"
            @current-change="handleTypePageChange"
            @size-change="handleTypeSizeChange"
          />
        </div>
      </section>

      <section class="dict-panel">
        <div class="dict-panel__header">
          <div>
            <h3>{{ selectedType?.dictTypeName ?? '字典项' }}</h3>
            <span>共 {{ dictItems.length }} 项，启用 {{ enabledItemCount }} 项</span>
          </div>
          <div class="dict-item-actions">
            <el-input v-model="itemKeyword" clearable placeholder="搜索字典项" class="dict-panel__search" />
            <el-button type="primary" :disabled="!selectedType" @click="openCreateItem">新增字典项</el-button>
          </div>
        </div>
        <el-table v-loading="itemLoading" :data="filteredItems" border row-key="dictItemId" class="system-page__table">
          <el-table-column prop="itemLabel" label="字典项标签" min-width="140" />
          <el-table-column label="字典项值" min-width="150" show-overflow-tooltip>
            <template #default="{ row }">{{ row.itemValue }}</template>
          </el-table-column>
          <el-table-column label="状态" width="90">
            <template #default="{ row }">
              <el-tag :type="row.itemStatus === 'enabled' ? 'success' : 'danger'">
                {{ statusText(row.itemStatus) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="预置" width="80">
            <template #default="{ row }">{{ row.preset ? '是' : '否' }}</template>
          </el-table-column>
          <el-table-column prop="sortOrder" label="排序" width="80" />
          <el-table-column prop="remark" label="备注" min-width="180" show-overflow-tooltip />
          <el-table-column label="操作" width="150" fixed="right">
            <template #default="{ row }">
              <el-button link type="primary" @click="openEditItem(row)">编辑</el-button>
              <el-button link type="danger" :disabled="row.preset" @click="deleteItem(row)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </section>
    </div>

    <el-dialog v-model="typeDialogVisible" :title="typeDialogTitle" width="620px">
      <el-form :model="typeForm" label-position="top" class="dict-form">
        <el-form-item label="类型编码" required>
          <el-input
            v-if="typeFormMode === 'create'"
            v-model="typeForm.dictTypeCode"
            maxlength="64"
            placeholder="例如 system_status"
          />
          <el-input v-else v-model="typeForm.dictTypeCode" disabled />
        </el-form-item>
        <el-form-item label="类型名称" required>
          <el-input v-model="typeForm.dictTypeName" maxlength="128" placeholder="例如 通用启停状态" />
        </el-form-item>
        <div class="dict-form__grid">
          <el-form-item label="状态" required>
            <el-radio-group v-model="typeForm.typeStatus">
              <el-radio-button label="enabled">启用</el-radio-button>
              <el-radio-button label="disabled">停用</el-radio-button>
            </el-radio-group>
          </el-form-item>
          <el-form-item label="排序" required>
            <el-input-number v-model="typeForm.sortOrder" :min="0" :max="999999" controls-position="right" />
          </el-form-item>
        </div>
        <el-form-item label="备注">
          <el-input v-model="typeForm.remark" type="textarea" maxlength="500" show-word-limit />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="typeDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitType">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="itemDialogVisible" :title="itemDialogTitle" width="620px">
      <el-form :model="itemForm" label-position="top" class="dict-form">
        <div class="dict-form__grid">
          <el-form-item label="字典项值" required>
            <el-input
              v-if="itemFormMode === 'create'"
              v-model="itemForm.itemValue"
              maxlength="128"
              placeholder="例如 enabled"
            />
            <el-input v-else v-model="itemForm.itemValue" disabled />
          </el-form-item>
          <el-form-item label="字典项标签" required>
            <el-input v-model="itemForm.itemLabel" maxlength="128" placeholder="例如 启用" />
          </el-form-item>
          <el-form-item label="状态" required>
            <el-radio-group v-model="itemForm.itemStatus">
              <el-radio-button label="enabled">启用</el-radio-button>
              <el-radio-button label="disabled">停用</el-radio-button>
            </el-radio-group>
          </el-form-item>
          <el-form-item label="排序" required>
            <el-input-number v-model="itemForm.sortOrder" :min="0" :max="999999" controls-position="right" />
          </el-form-item>
        </div>
        <el-form-item label="备注">
          <el-input v-model="itemForm.remark" type="textarea" maxlength="500" show-word-limit />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="itemDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitItem">保存</el-button>
      </template>
    </el-dialog>
  </section>
</template>

<style scoped>
.dict-actions,
.dict-item-actions,
.dict-type-filters {
  display: flex;
  gap: 10px;
  align-items: center;
}

.dict-layout {
  display: grid;
  grid-template-columns: minmax(360px, 0.9fr) minmax(460px, 1.1fr);
  gap: 16px;
  align-items: start;
}

.dict-panel {
  min-width: 0;
}

.dict-panel__header {
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.dict-panel__header h3 {
  margin: 0 0 4px;
  color: var(--el-text-color-primary);
  font-size: 16px;
}

.dict-panel__header span {
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

.dict-panel__search {
  width: 220px;
}

.dict-panel__status {
  width: 116px;
}

.dict-pagination {
  display: flex;
  justify-content: flex-end;
  margin-top: 12px;
}

.dict-form__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 16px;
}

@media (max-width: 980px) {
  .dict-layout {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 700px) {
  .dict-actions,
  .dict-item-actions,
  .dict-type-filters,
  .dict-panel__header,
  .dict-form__grid {
    display: grid;
    grid-template-columns: 1fr;
  }

  .dict-panel__search {
    width: 100%;
  }

  .dict-panel__status {
    width: 100%;
  }
}
</style>
