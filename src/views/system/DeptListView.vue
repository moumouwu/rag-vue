<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { systemApi } from '@/api/modules/system';
import { isApiRequestError } from '@/api/request';
import type {
  EntityId,
  SystemDept,
  SystemDeptCreatePayload,
  SystemDeptUpdatePayload,
  SystemUser,
  SystemUserQuery,
} from '@/types';
import { confirmAction, showErrorMessage, showSuccessMessage } from '@/utils/ui-feedback';

type DeptFormMode = 'create' | 'edit';

const deptTree = ref<SystemDept[]>([]);
const loading = ref(false);
const saving = ref(false);
const dialogVisible = ref(false);
const formMode = ref<DeptFormMode>('create');
const editingDeptId = ref<EntityId | null>(null);
const leaderDialogVisible = ref(false);
const leaderUsers = ref<SystemUser[]>([]);
const leaderLoading = ref(false);
const leaderPageNo = ref(1);
const leaderPageSize = ref(10);
const leaderTotal = ref(0);
const selectedLeaderText = ref('');

const deptForm = reactive<SystemDeptCreatePayload>({
  deptCode: '',
  parentId: '0',
  deptName: '',
  leaderUserId: null,
  sortOrder: 10,
  deptStatus: 'enabled',
  remark: '',
});

const leaderFilters = reactive<SystemUserQuery>({
  pageNo: 1,
  pageSize: 10,
  username: '',
  displayName: '',
  userStatus: 'enabled',
});

const dialogTitle = computed(() => (formMode.value === 'create' ? '新增部门' : '编辑部门'));
const statusText = (status: string) => (status === 'enabled' ? '启用' : '停用');
const leaderDisplayText = computed(() => {
  if (!deptForm.leaderUserId) {
    return '未选择';
  }
  return selectedLeaderText.value || '负责人名称未返回';
});

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

function userDisplayText(user: SystemUser): string {
  return `${user.displayName}（${user.username}）`;
}

function leaderText(dept: SystemDept): string {
  if (dept.leaderUserName?.trim()) {
    return dept.leaderUserName;
  }
  return dept.leaderUserId ? '负责人名称未返回' : '未设置';
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
  selectedLeaderText.value = '';
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
  selectedLeaderText.value = dept.leaderUserName?.trim() ?? '';
  deptForm.sortOrder = dept.sortOrder;
  deptForm.deptStatus = dept.deptStatus;
  deptForm.remark = dept.remark ?? '';
  dialogVisible.value = true;
}

async function loadLeaderUsers(): Promise<void> {
  leaderLoading.value = true;
  try {
    const pageData = await systemApi.listUsers({
      ...leaderFilters,
      pageNo: leaderPageNo.value,
      pageSize: leaderPageSize.value,
    });
    if (pageData.list.length === 0 && pageData.total > 0 && leaderPageNo.value > 1) {
      // 负责人选择器只保留当前页候选用户，页码失效时回退到最后一页。
      leaderPageNo.value = Math.max(1, Math.ceil(pageData.total / leaderPageSize.value));
      await loadLeaderUsers();
      return;
    }
    leaderPageNo.value = pageData.pageNo;
    leaderPageSize.value = pageData.pageSize;
    leaderTotal.value = pageData.total;
    leaderUsers.value = pageData.list;
  } catch (error) {
    showErrorMessage(resolveErrorMessage(error, '负责人候选用户加载失败'));
  } finally {
    leaderLoading.value = false;
  }
}

async function searchLeaderUsers(): Promise<void> {
  leaderPageNo.value = 1;
  await loadLeaderUsers();
}

async function openLeaderSelector(): Promise<void> {
  leaderDialogVisible.value = true;
  await searchLeaderUsers();
}

async function handleLeaderPageChange(pageNo: number): Promise<void> {
  leaderPageNo.value = pageNo;
  await loadLeaderUsers();
}

async function handleLeaderSizeChange(pageSize: number): Promise<void> {
  leaderPageSize.value = pageSize;
  leaderPageNo.value = 1;
  await loadLeaderUsers();
}

function chooseLeader(user: SystemUser): void {
  deptForm.leaderUserId = user.userId;
  selectedLeaderText.value = userDisplayText(user);
  leaderDialogVisible.value = false;
}

function clearLeader(): void {
  deptForm.leaderUserId = null;
  selectedLeaderText.value = '';
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
      <el-table-column label="负责人" min-width="130">
        <template #default="{ row }">{{ leaderText(row) }}</template>
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
            <el-form-item label="负责人">
              <div class="leader-picker">
                <el-input :model-value="leaderDisplayText" readonly />
                <el-button @click="openLeaderSelector">选择</el-button>
                <el-button :disabled="!deptForm.leaderUserId" @click="clearLeader">清空</el-button>
              </div>
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

    <el-dialog v-model="leaderDialogVisible" title="选择负责人" width="780px">
      <div class="leader-selector__filters">
        <el-input
          v-model="leaderFilters.username"
          clearable
          placeholder="搜索用户名"
          @keyup.enter="searchLeaderUsers"
        />
        <el-input
          v-model="leaderFilters.displayName"
          clearable
          placeholder="搜索姓名"
          @keyup.enter="searchLeaderUsers"
        />
        <el-button type="primary" @click="searchLeaderUsers">查询</el-button>
      </div>
      <el-table v-loading="leaderLoading" :data="leaderUsers" border row-key="userId" class="system-page__table">
        <el-table-column prop="displayName" label="姓名" min-width="140" />
        <el-table-column prop="username" label="用户名" min-width="140" />
        <el-table-column prop="userCode" label="用户编码" min-width="150" />
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <el-tag :type="row.userStatus === 'enabled' ? 'success' : 'danger'">
              {{ statusText(row.userStatus) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="90" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="chooseLeader(row)">选择</el-button>
          </template>
        </el-table-column>
      </el-table>
      <div class="leader-selector__pagination">
        <el-pagination
          v-model:current-page="leaderPageNo"
          v-model:page-size="leaderPageSize"
          background
          :page-sizes="[10, 20, 50, 100]"
          :total="leaderTotal"
          layout="total, sizes, prev, pager, next"
          @current-change="handleLeaderPageChange"
          @size-change="handleLeaderSizeChange"
        />
      </div>
    </el-dialog>
  </section>
</template>

<style scoped>
.leader-picker {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  gap: 8px;
  width: 100%;
}

.leader-selector__filters {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr)) auto;
  gap: 12px;
  margin-bottom: 12px;
}

.leader-selector__pagination {
  display: flex;
  justify-content: flex-end;
  margin-top: 12px;
}

@media (max-width: 700px) {
  .leader-picker,
  .leader-selector__filters {
    grid-template-columns: 1fr;
  }
}
</style>
