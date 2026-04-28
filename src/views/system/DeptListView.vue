<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { systemApi } from '@/api/modules/system';
import { isApiRequestError } from '@/api/request';
import type { EntityId, SystemDept, SystemDeptCreatePayload, SystemDeptUpdatePayload } from '@/types';
import { confirmAction, showErrorMessage, showSuccessMessage } from '@/utils/ui-feedback';

type DeptFormMode = 'create' | 'edit';

const deptTree = ref<SystemDept[]>([]);
const loading = ref(false);
const saving = ref(false);
const dialogVisible = ref(false);
const formMode = ref<DeptFormMode>('create');
const editingDeptId = ref<EntityId | null>(null);

const deptForm = reactive<SystemDeptCreatePayload>({
  deptCode: '',
  parentId: '0',
  deptName: '',
  leaderUserId: null,
  sortOrder: 10,
  deptStatus: 'enabled',
  remark: '',
});

const dialogTitle = computed(() => (formMode.value === 'create' ? '新增部门' : '编辑部门'));
const statusText = (status: string) => (status === 'enabled' ? '启用' : '停用');
const emptyText = (value: string | null | undefined) => value?.trim() || '未设置';

const parentOptions = computed(() => {
  const options: Array<{ deptId: EntityId; label: string }> = [{ deptId: '0', label: '根部门' }];
  // 编辑时排除自身和下级部门，防止形成循环组织树。
  flattenDepartments(deptTree.value)
    .filter((dept) => !isSelfOrDescendant(dept))
    .forEach((dept) => {
      options.push({ deptId: dept.deptId, label: `${'　'.repeat(resolveLevel(dept))}${dept.deptName}` });
    });
  return options;
});

function resolveErrorMessage(error: unknown, fallback: string): string {
  return isApiRequestError(error) ? error.message : fallback;
}

function flattenDepartments(nodes: SystemDept[]): SystemDept[] {
  return nodes.flatMap((node) => [node, ...flattenDepartments(node.children ?? [])]);
}

function resolveLevel(dept: SystemDept): number {
  return dept.ancestors ? Math.max(dept.ancestors.split(',').length - 1, 0) : 0;
}

function isSelfOrDescendant(dept: SystemDept): boolean {
  if (!editingDeptId.value) {
    return false;
  }
  return dept.deptId === editingDeptId.value || dept.ancestors.split(',').includes(editingDeptId.value);
}

function normalizeLeaderUserId(value: EntityId | null): EntityId | null {
  // 空字符串按未指定负责人处理，避免提交空文本导致后端按用户ID校验失败。
  const normalized = value?.trim() ?? '';
  return normalized === '' ? null : normalized;
}

async function loadDepartmentTree(): Promise<void> {
  loading.value = true;
  try {
    deptTree.value = await systemApi.listDepartmentTree();
  } catch (error) {
    showErrorMessage(resolveErrorMessage(error, '部门树加载失败'));
  } finally {
    loading.value = false;
  }
}

function resetDeptForm(parentId: EntityId = '0'): void {
  deptForm.deptCode = '';
  deptForm.parentId = parentId;
  deptForm.deptName = '';
  deptForm.leaderUserId = null;
  deptForm.sortOrder = 10;
  deptForm.deptStatus = 'enabled';
  deptForm.remark = '';
}

function openCreateDepartment(parentId: EntityId = '0'): void {
  formMode.value = 'create';
  editingDeptId.value = null;
  resetDeptForm(parentId);
  dialogVisible.value = true;
}

function openEditDepartment(dept: SystemDept): void {
  formMode.value = 'edit';
  editingDeptId.value = dept.deptId;
  deptForm.deptCode = dept.deptCode;
  deptForm.parentId = dept.parentId;
  deptForm.deptName = dept.deptName;
  deptForm.leaderUserId = dept.leaderUserId;
  deptForm.sortOrder = dept.sortOrder;
  deptForm.deptStatus = dept.deptStatus;
  deptForm.remark = dept.remark ?? '';
  dialogVisible.value = true;
}

async function submitDepartment(): Promise<void> {
  saving.value = true;
  try {
    if (formMode.value === 'create') {
      // deptCode 允许为空，后端会按父级和部门名称生成可读编码。
      await systemApi.createDepartment({
        ...deptForm,
        leaderUserId: normalizeLeaderUserId(deptForm.leaderUserId),
      });
      showSuccessMessage('部门已新增');
    } else if (editingDeptId.value) {
      const payload: SystemDeptUpdatePayload = {
        parentId: deptForm.parentId,
        deptName: deptForm.deptName,
        leaderUserId: normalizeLeaderUserId(deptForm.leaderUserId),
        sortOrder: deptForm.sortOrder,
        deptStatus: deptForm.deptStatus,
        remark: deptForm.remark,
      };
      await systemApi.updateDepartment(editingDeptId.value, payload);
      showSuccessMessage('部门已保存');
    }
    dialogVisible.value = false;
    await loadDepartmentTree();
  } catch (error) {
    showErrorMessage(resolveErrorMessage(error, '部门保存失败'));
  } finally {
    saving.value = false;
  }
}

async function switchDepartmentStatus(dept: SystemDept): Promise<void> {
  const nextStatus = dept.deptStatus === 'enabled' ? 'disabled' : 'enabled';
  const nextStatusText = statusText(nextStatus);
  const confirmed = await confirmAction({
    title: `${nextStatusText}部门`,
    message: `确认${nextStatusText}部门“${dept.deptName}”吗？`,
    confirmButtonText: nextStatusText,
  });
  if (!confirmed) {
    return;
  }
  try {
    await systemApi.updateDepartmentStatus(dept.deptId, { deptStatus: nextStatus });
    showSuccessMessage(`部门已${nextStatusText}`);
    await loadDepartmentTree();
  } catch (error) {
    showErrorMessage(resolveErrorMessage(error, '部门状态更新失败'));
  }
}

async function deleteDepartment(dept: SystemDept): Promise<void> {
  const confirmed = await confirmAction({
    title: '删除部门',
    message: `确认删除部门“${dept.deptName}”吗？`,
    confirmButtonText: '删除',
  });
  if (!confirmed) {
    return;
  }
  try {
    await systemApi.deleteDepartment(dept.deptId);
    showSuccessMessage('部门已删除');
    await loadDepartmentTree();
  } catch (error) {
    showErrorMessage(resolveErrorMessage(error, '部门删除失败'));
  }
}

onMounted(loadDepartmentTree);
</script>

<template>
  <section class="workspace-card system-page">
    <div class="system-page__header">
      <div>
        <h2 class="section-heading__title">部门管理</h2>
        <p class="section-heading__desc">维护组织部门树，为用户归属和后续数据范围提供基础。</p>
      </div>
      <el-button type="primary" @click="openCreateDepartment()">新增根部门</el-button>
    </div>

    <el-table
      v-loading="loading"
      :data="deptTree"
      row-key="deptId"
      border
      default-expand-all
      class="system-page__table"
    >
      <el-table-column prop="deptName" label="部门名称" min-width="180" />
      <el-table-column prop="deptCode" label="部门编码" min-width="160" />
      <el-table-column label="负责人用户ID" min-width="130">
        <template #default="{ row }">{{ emptyText(row.leaderUserId) }}</template>
      </el-table-column>
      <el-table-column label="状态" width="90">
        <template #default="{ row }">
          <el-tag :type="row.deptStatus === 'enabled' ? 'success' : 'danger'">
            {{ statusText(row.deptStatus) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="sortOrder" label="排序" width="80" />
      <el-table-column prop="remark" label="备注" min-width="180" />
      <el-table-column label="操作" width="250" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="openCreateDepartment(row.deptId)">新增下级</el-button>
          <el-button link type="primary" @click="openEditDepartment(row)">编辑</el-button>
          <el-button link type="warning" @click="switchDepartmentStatus(row)">
            {{ row.deptStatus === 'enabled' ? '停用' : '启用' }}
          </el-button>
          <el-button link type="danger" @click="deleteDepartment(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="dialogVisible" :title="dialogTitle" width="720px" class="menu-edit-dialog">
      <el-form :model="deptForm" label-position="top" class="menu-form">
        <section class="menu-form__section menu-form__section--wide">
          <h3 class="menu-form__section-title">基础信息</h3>
          <div class="menu-form__grid">
            <el-form-item label="部门编码">
              <el-input
                v-model="deptForm.deptCode"
                :disabled="formMode === 'edit'"
                maxlength="64"
                placeholder="不填自动生成"
              />
            </el-form-item>
            <el-form-item label="部门名称" required>
              <el-input v-model="deptForm.deptName" maxlength="128" />
            </el-form-item>
            <el-form-item label="上级部门" required>
              <el-select v-model="deptForm.parentId" filterable class="system-page__control">
                <el-option
                  v-for="option in parentOptions"
                  :key="option.deptId"
                  :label="option.label"
                  :value="option.deptId"
                />
              </el-select>
            </el-form-item>
            <el-form-item label="负责人用户ID">
              <el-input v-model="deptForm.leaderUserId" clearable />
            </el-form-item>
            <el-form-item label="状态" required>
              <el-radio-group v-model="deptForm.deptStatus" class="menu-form__radio">
                <el-radio-button label="enabled">启用</el-radio-button>
                <el-radio-button label="disabled">停用</el-radio-button>
              </el-radio-group>
            </el-form-item>
            <el-form-item label="排序" required>
              <el-input-number
                v-model="deptForm.sortOrder"
                :min="0"
                :max="9999"
                controls-position="right"
                class="menu-form__number"
              />
            </el-form-item>
          </div>
        </section>
        <section class="menu-form__section menu-form__section--wide">
          <el-form-item label="备注" class="menu-form__remark">
            <el-input v-model="deptForm.remark" type="textarea" maxlength="500" show-word-limit />
          </el-form-item>
        </section>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitDepartment">保存</el-button>
      </template>
    </el-dialog>
  </section>
</template>
