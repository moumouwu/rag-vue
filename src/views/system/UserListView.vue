<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { usePermission } from '@/auth/permissions';
import { systemApi } from '@/api/modules/system';
import { isApiRequestError } from '@/api/request';
import type {
  EntityId,
  SystemDept,
  SystemRole,
  SystemUser,
  SystemUserCreatePayload,
  SystemUserQuery,
  SystemUserUpdatePayload,
} from '@/types';
import { confirmAction, showErrorMessage, showSuccessMessage } from '@/utils/ui-feedback';

type UserFormMode = 'create' | 'edit';

interface DeptOption {
  deptId: EntityId;
  label: string;
}

const users = ref<SystemUser[]>([]);
const deptTree = ref<SystemDept[]>([]);
const roleOptions = ref<SystemRole[]>([]);
const loading = ref(false);
const saving = ref(false);
const dialogLoading = ref(false);
const deptTreeLoading = ref(false);
const deptTreeUnavailableMessage = ref('');
const userDialogVisible = ref(false);
const roleDialogVisible = ref(false);
const userFormMode = ref<UserFormMode>('create');
const editingUserId = ref<EntityId | null>(null);
const assigningUser = ref<SystemUser | null>(null);
const roleAssignIds = ref<EntityId[]>([]);
const userPageNo = ref(1);
const userPageSize = ref(10);
const userTotal = ref(0);
const { hasPermission } = usePermission();

const filters = reactive<SystemUserQuery>({
  pageNo: 1,
  pageSize: 10,
  username: '',
  displayName: '',
  departmentId: '',
  userStatus: '',
});

const userForm = reactive<SystemUserCreatePayload>({
  username: '',
  password: '',
  displayName: '',
  mobile: '',
  email: '',
  employeeNo: '',
  jobTitle: '',
  departmentId: null,
  userStatus: 'enabled',
  roleIds: [],
  remark: '',
});

const deptOptions = computed<DeptOption[]>(() =>
  flattenDepartments(deptTree.value).map((dept) => ({
    deptId: dept.deptId,
    label: `${'　'.repeat(resolveLevel(dept))}${dept.deptName}`,
  })),
);
const deptNameMap = computed(() => {
  const map = new Map<EntityId, string>();
  flattenDepartments(deptTree.value).forEach((dept) => map.set(dept.deptId, dept.deptName));
  return map;
});
const isDepartmentSelectorDisabled = computed(() => Boolean(deptTreeUnavailableMessage.value) && deptOptions.value.length === 0);
const userDialogTitle = computed(() => (userFormMode.value === 'create' ? '新增用户' : '编辑用户'));
const canCreateUser = computed(() => hasPermission('system:user:create'));
const canUpdateUser = computed(() => hasPermission('system:user:update'));
const canUpdateUserStatus = computed(() => hasPermission('system:user:status'));
const canLoadRoleOptions = computed(() => hasPermission('system:role:query'));
const canSaveUserRoles = computed(() => hasPermission('system:user:role-save'));
// 授权入口按查询权限展示，保存动作再单独校验写权限，避免只读账号无法查看授权回显。
const canViewUserRoles = computed(() => hasPermission('system:user:role-query'));
const canMaintainUserRoles = computed(() => canLoadRoleOptions.value && canSaveUserRoles.value);
const canOperateUser = computed(() => canUpdateUser.value || canUpdateUserStatus.value || canViewUserRoles.value);
const canSubmitUser = computed(() => (userFormMode.value === 'create' ? canCreateUser.value : canUpdateUser.value));

function resolveErrorMessage(error: unknown, fallback: string): string {
  return isApiRequestError(error) ? error.message : fallback;
}

function flattenDepartments(nodes: SystemDept[]): SystemDept[] {
  return nodes.flatMap((node) => [node, ...flattenDepartments(node.children ?? [])]);
}

function resolveLevel(dept: SystemDept): number {
  return dept.ancestors ? Math.max(dept.ancestors.split(',').length - 1, 0) : 0;
}

function statusText(status: string): string {
  return status === 'enabled' ? '启用' : '停用';
}

function roleStatusText(status: string): string {
  return status === 'enabled' ? '启用' : '停用';
}

function departmentText(row: SystemUser): string {
  if (row.departmentName) {
    return row.departmentName;
  }
  const departmentId = row.departmentId;
  if (!departmentId) {
    return '未分配';
  }
  return deptNameMap.value.get(departmentId) ?? `部门 ${departmentId}`;
}

function formatLastLoginTime(value: string | null): string {
  if (!value) {
    return '未登录';
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString('zh-CN', { hour12: false });
}

function resetUserForm(): void {
  Object.assign(userForm, {
    username: '',
    password: '',
    displayName: '',
    mobile: '',
    email: '',
    employeeNo: '',
    jobTitle: '',
    departmentId: null,
    userStatus: 'enabled',
    roleIds: [],
    remark: '',
  });
}

function normalizeOptionalId(value: EntityId | null): EntityId | null {
  return value === '' || value === null ? null : value;
}

function buildCreatePayload(): SystemUserCreatePayload {
  return {
    ...userForm,
    username: userForm.username.trim(),
    password: userForm.password,
    displayName: userForm.displayName.trim(),
    mobile: userForm.mobile.trim(),
    email: userForm.email.trim(),
    employeeNo: userForm.employeeNo.trim(),
    jobTitle: userForm.jobTitle.trim(),
    departmentId: normalizeOptionalId(userForm.departmentId),
    roleIds: userForm.roleIds.map(String),
    remark: userForm.remark.trim(),
  };
}

function buildUpdatePayload(): SystemUserUpdatePayload {
  return {
    displayName: userForm.displayName.trim(),
    mobile: userForm.mobile.trim(),
    email: userForm.email.trim(),
    employeeNo: userForm.employeeNo.trim(),
    jobTitle: userForm.jobTitle.trim(),
    departmentId: normalizeOptionalId(userForm.departmentId),
    userStatus: userForm.userStatus,
    remark: userForm.remark.trim(),
  };
}

function validateUserForm(): boolean {
  if (!userForm.displayName.trim()) {
    showErrorMessage('请输入姓名');
    return false;
  }
  if (userFormMode.value === 'create' && !userForm.username.trim()) {
    showErrorMessage('请输入用户名');
    return false;
  }
  if (userFormMode.value === 'create' && userForm.password.length < 8) {
    showErrorMessage('初始密码至少需要8个字符');
    return false;
  }
  return true;
}

async function loadRoles(): Promise<void> {
  roleOptions.value = await systemApi.listRoles();
}

async function loadDepartmentTreeForAuxiliary(): Promise<void> {
  deptTreeLoading.value = true;
  try {
    deptTree.value = await systemApi.listDepartmentTree();
    deptTreeUnavailableMessage.value = '';
  } catch (error) {
    /*
     * 用户列表接口已经返回部门名称，部门树只用于筛选和表单选择。
     * 缺少部门接口权限时不能阻断主列表渲染，否则只有用户列表权限的角色无法进入页面。
     */
    deptTree.value = [];
    filters.departmentId = '';
    deptTreeUnavailableMessage.value = resolveErrorMessage(error, '部门数据加载失败，部门筛选暂不可用');
  } finally {
    deptTreeLoading.value = false;
  }
}

async function loadPageData(): Promise<void> {
  loading.value = true;
  try {
    /*
     * 用户列表后端已叠加数据范围过滤，
     * 前端只提交分页和筛选条件，不自行判断部门可见范围。
     */
    const userPage = await systemApi.listUsers({
      ...filters,
      pageNo: userPageNo.value,
      pageSize: userPageSize.value,
    });
    if (userPage.list.length === 0 && userPage.total > 0 && userPageNo.value > 1) {
      // 删除或筛选导致当前页为空时回到最后一页，避免表格停留在无效页码。
      userPageNo.value = Math.max(1, Math.ceil(userPage.total / userPageSize.value));
      await loadPageData();
      return;
    }
    userPageNo.value = userPage.pageNo;
    userPageSize.value = userPage.pageSize;
    userTotal.value = userPage.total;
    users.value = userPage.list;
    // 部门树只是筛选和表单辅助数据，不能拖住用户分页主流程。
    void loadDepartmentTreeForAuxiliary();
  } catch (error) {
    showErrorMessage(resolveErrorMessage(error, '用户列表加载失败'));
  } finally {
    loading.value = false;
  }
}

async function searchUsers(): Promise<void> {
  userPageNo.value = 1;
  await loadPageData();
}

async function resetFilters(): Promise<void> {
  filters.username = '';
  filters.displayName = '';
  filters.departmentId = '';
  filters.userStatus = '';
  userPageNo.value = 1;
  await loadPageData();
}

async function openCreateUser(): Promise<void> {
  userFormMode.value = 'create';
  editingUserId.value = null;
  resetUserForm();
  userDialogVisible.value = true;
  if (canLoadRoleOptions.value) {
    try {
      await loadRoles();
    } catch (error) {
      showErrorMessage(resolveErrorMessage(error, '角色列表加载失败'));
    }
  } else {
    roleOptions.value = [];
  }
}

async function openEditUser(row: SystemUser): Promise<void> {
  userFormMode.value = 'edit';
  editingUserId.value = row.userId;
  resetUserForm();
  userDialogVisible.value = true;
  dialogLoading.value = true;
  try {
    const [detail] = await Promise.all([
      systemApi.getUser(row.userId),
      canLoadRoleOptions.value ? loadRoles() : Promise.resolve(),
    ]);
    userForm.username = detail.username;
    userForm.password = '';
    userForm.displayName = detail.displayName;
    userForm.mobile = detail.mobile ?? '';
    userForm.email = detail.email ?? '';
    userForm.employeeNo = detail.employeeNo ?? '';
    userForm.jobTitle = detail.jobTitle ?? '';
    userForm.departmentId = detail.departmentId;
    userForm.userStatus = detail.userStatus;
    userForm.roleIds = canLoadRoleOptions.value ? detail.roleIds.map(String) : [];
    userForm.remark = detail.remark ?? '';
  } catch (error) {
    showErrorMessage(resolveErrorMessage(error, '用户详情加载失败'));
  } finally {
    dialogLoading.value = false;
  }
}

async function submitUser(): Promise<void> {
  if (!validateUserForm()) {
    return;
  }
  saving.value = true;
  try {
    if (userFormMode.value === 'create') {
      await systemApi.createUser(buildCreatePayload());
      showSuccessMessage('用户已新增');
    } else if (editingUserId.value) {
      await systemApi.updateUser(editingUserId.value, buildUpdatePayload());
      if (canMaintainUserRoles.value) {
        /*
         * 有角色维护权限时才同步覆盖角色关系，
         * 避免只有用户编辑权限的账号触发角色授权接口 403。
         */
        await systemApi.saveUserRoles(editingUserId.value, { roleIds: userForm.roleIds.map(String) });
      }
      showSuccessMessage('用户已保存');
    }
    userDialogVisible.value = false;
    await loadPageData();
  } catch (error) {
    showErrorMessage(resolveErrorMessage(error, '用户保存失败'));
  } finally {
    saving.value = false;
  }
}

async function toggleUserStatus(row: SystemUser): Promise<void> {
  const nextStatus = row.userStatus === 'enabled' ? 'disabled' : 'enabled';
  const actionText = nextStatus === 'enabled' ? '启用' : '停用';
  const confirmed = await confirmAction({
    title: `${actionText}用户`,
    message: `确认${actionText}用户“${row.displayName}”吗？`,
    confirmButtonText: actionText,
  });
  if (!confirmed) {
    return;
  }
  try {
    await systemApi.updateUserStatus(row.userId, { userStatus: nextStatus });
    showSuccessMessage(`用户已${actionText}`);
    await loadPageData();
  } catch (error) {
    showErrorMessage(resolveErrorMessage(error, '用户状态更新失败'));
  }
}

async function openRoleAssign(row: SystemUser): Promise<void> {
  assigningUser.value = row;
  roleAssignIds.value = [];
  roleOptions.value = [];
  roleDialogVisible.value = true;
  dialogLoading.value = true;
  try {
    const authorization = await systemApi.getUserRoleAuthorization(row.userId);
    roleOptions.value = authorization.roles;
    roleAssignIds.value = authorization.assignedRoleIds.map(String);
  } catch (error) {
    showErrorMessage(resolveErrorMessage(error, '用户角色加载失败'));
  } finally {
    dialogLoading.value = false;
  }
}

async function saveRoleAssign(): Promise<void> {
  if (!assigningUser.value) {
    return;
  }
  saving.value = true;
  try {
    // 后端 Long ID 以字符串传输，授权保存不能转 number，避免精度丢失。
    await systemApi.saveUserRoles(assigningUser.value.userId, { roleIds: roleAssignIds.value.map(String) });
    showSuccessMessage('用户角色已保存');
    roleDialogVisible.value = false;
  } catch (error) {
    showErrorMessage(resolveErrorMessage(error, '用户角色保存失败'));
  } finally {
    saving.value = false;
  }
}

async function handleUserPageChange(pageNo: number): Promise<void> {
  userPageNo.value = pageNo;
  await loadPageData();
}

async function handleUserSizeChange(pageSize: number): Promise<void> {
  userPageSize.value = pageSize;
  userPageNo.value = 1;
  await loadPageData();
}

onMounted(loadPageData);
</script>

<template>
  <section class="workspace-card system-page">
    <div class="system-page__header">
      <div>
        <h2 class="section-heading__title">用户管理</h2>
        <p class="section-heading__desc">维护系统登录用户、所属部门、启停状态和角色归属。</p>
      </div>
      <div class="user-header-actions">
        <el-button @click="loadPageData">刷新</el-button>
        <el-button v-if="canCreateUser" type="primary" @click="openCreateUser">新增用户</el-button>
      </div>
    </div>

    <div class="user-toolbar">
      <el-input v-model="filters.username" clearable placeholder="搜索用户名" />
      <el-input v-model="filters.displayName" clearable placeholder="搜索姓名" />
      <el-select
        v-model="filters.departmentId"
        clearable
        filterable
        :disabled="isDepartmentSelectorDisabled"
        :loading="deptTreeLoading"
        :placeholder="isDepartmentSelectorDisabled ? '部门筛选不可用' : '全部部门'"
      >
        <el-option
          v-for="dept in deptOptions"
          :key="dept.deptId"
          :label="dept.label"
          :value="dept.deptId"
        />
      </el-select>
      <el-select v-model="filters.userStatus" clearable placeholder="全部状态">
        <el-option label="启用" value="enabled" />
        <el-option label="停用" value="disabled" />
      </el-select>
      <div class="user-toolbar__actions">
        <el-button type="primary" @click="searchUsers">查询</el-button>
        <el-button @click="resetFilters">重置</el-button>
      </div>
    </div>
    <el-alert
      v-if="deptTreeUnavailableMessage"
      class="user-permission-alert"
      type="warning"
      :closable="false"
      :title="deptTreeUnavailableMessage"
      description="用户列表已按当前接口权限加载，缺少部门查询权限时仅禁用部门筛选和所属部门选择。"
    />

    <el-table v-loading="loading" :data="users" border row-key="userId" class="system-page__table">
      <el-table-column prop="displayName" label="姓名" min-width="130" />
      <el-table-column prop="username" label="用户名" min-width="140" />
      <el-table-column prop="mobile" label="手机号" min-width="130">
        <template #default="{ row }">{{ row.mobile || '未填写' }}</template>
      </el-table-column>
      <el-table-column label="所属部门" min-width="150">
        <template #default="{ row }">{{ departmentText(row) }}</template>
      </el-table-column>
      <el-table-column prop="jobTitle" label="岗位" min-width="130">
        <template #default="{ row }">{{ row.jobTitle || '未填写' }}</template>
      </el-table-column>
      <el-table-column label="状态" width="90">
        <template #default="{ row }">
          <el-tag :type="row.userStatus === 'enabled' ? 'success' : 'danger'">
            {{ statusText(row.userStatus) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="超级管理员" width="120">
        <template #default="{ row }">
          <el-tag :type="row.superAdmin ? 'danger' : 'info'">{{ row.superAdmin ? '是' : '否' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="最后登录时间" min-width="180">
        <template #default="{ row }">{{ formatLastLoginTime(row.lastLoginTime) }}</template>
      </el-table-column>
      <el-table-column v-if="canOperateUser" label="操作" width="260" fixed="right">
        <template #default="{ row }">
          <el-button v-if="canUpdateUser" link type="primary" @click="openEditUser(row)">编辑</el-button>
          <el-button v-if="canViewUserRoles" link type="primary" @click="openRoleAssign(row)">角色</el-button>
          <el-button
            v-if="canUpdateUserStatus"
            link
            :type="row.userStatus === 'enabled' ? 'warning' : 'success'"
            :disabled="row.superAdmin"
            @click="toggleUserStatus(row)"
          >
            {{ row.userStatus === 'enabled' ? '停用' : '启用' }}
          </el-button>
        </template>
      </el-table-column>
    </el-table>
    <div class="user-pagination">
      <el-pagination
        v-model:current-page="userPageNo"
        v-model:page-size="userPageSize"
        background
        :page-sizes="[10, 20, 50, 100]"
        :total="userTotal"
        layout="total, sizes, prev, pager, next"
        @current-change="handleUserPageChange"
        @size-change="handleUserSizeChange"
      />
    </div>

    <el-dialog v-model="userDialogVisible" :title="userDialogTitle" width="760px" align-center>
      <el-form v-loading="dialogLoading" label-width="96px">
        <div class="user-form-grid">
          <el-form-item label="用户名" required>
            <el-input v-model="userForm.username" :disabled="userFormMode === 'edit'" maxlength="64" />
          </el-form-item>
          <el-form-item v-if="userFormMode === 'create'" label="初始密码" required>
            <el-input v-model="userForm.password" type="password" show-password maxlength="128" />
          </el-form-item>
          <el-form-item label="姓名" required>
            <el-input v-model="userForm.displayName" maxlength="128" />
          </el-form-item>
          <el-form-item label="手机号">
            <el-input v-model="userForm.mobile" maxlength="32" />
          </el-form-item>
          <el-form-item label="邮箱">
            <el-input v-model="userForm.email" maxlength="128" />
          </el-form-item>
          <el-form-item label="员工编号">
            <el-input v-model="userForm.employeeNo" maxlength="64" placeholder="为空时后端自动生成" />
          </el-form-item>
          <el-form-item label="岗位">
            <el-input v-model="userForm.jobTitle" maxlength="128" />
          </el-form-item>
          <el-form-item label="所属部门">
            <el-select
              v-model="userForm.departmentId"
              clearable
              filterable
              class="system-page__control"
              :disabled="isDepartmentSelectorDisabled"
              :loading="deptTreeLoading"
              :placeholder="isDepartmentSelectorDisabled ? '部门选择不可用' : '请选择部门'"
            >
              <el-option
                v-for="dept in deptOptions"
                :key="dept.deptId"
                :label="dept.label"
                :value="dept.deptId"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="状态" required>
            <el-radio-group v-model="userForm.userStatus">
              <el-radio-button label="enabled">启用</el-radio-button>
              <el-radio-button label="disabled">停用</el-radio-button>
            </el-radio-group>
          </el-form-item>
        </div>
        <el-form-item v-if="canLoadRoleOptions" label="角色">
          <el-checkbox-group v-model="userForm.roleIds" class="user-role-checks">
            <el-checkbox v-for="role in roleOptions" :key="role.roleId" :label="role.roleId">
              {{ role.roleName }}
              <el-tag size="small" :type="role.roleStatus === 'enabled' ? 'success' : 'danger'">
                {{ roleStatusText(role.roleStatus) }}
              </el-tag>
            </el-checkbox>
          </el-checkbox-group>
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="userForm.remark" type="textarea" maxlength="500" show-word-limit />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="userDialogVisible = false">取消</el-button>
        <el-button v-if="canSubmitUser" type="primary" :loading="saving" @click="submitUser">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="roleDialogVisible" title="用户角色" width="640px" align-center>
      <div v-loading="dialogLoading">
        <p class="system-page__hint">当前用户：{{ assigningUser?.displayName }}</p>
        <el-checkbox-group v-model="roleAssignIds" class="user-role-checks" :disabled="!canSaveUserRoles">
          <el-checkbox v-for="role in roleOptions" :key="role.roleId" :label="role.roleId">
            {{ role.roleName }}
            <span class="user-role-checks__code">{{ role.roleCode }}</span>
            <el-tag size="small" :type="role.roleStatus === 'enabled' ? 'success' : 'danger'">
              {{ roleStatusText(role.roleStatus) }}
            </el-tag>
          </el-checkbox>
        </el-checkbox-group>
      </div>
      <template #footer>
        <el-button @click="roleDialogVisible = false">取消</el-button>
        <el-button v-if="canSaveUserRoles" type="primary" :loading="saving" @click="saveRoleAssign">保存角色</el-button>
      </template>
    </el-dialog>
  </section>
</template>

<style scoped>
.user-header-actions {
  display: inline-flex;
  gap: 8px;
}

.user-toolbar {
  display: grid;
  grid-template-columns: repeat(4, minmax(150px, 1fr)) auto;
  gap: 12px;
  align-items: center;
}

.user-toolbar__actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.user-permission-alert {
  margin-bottom: 12px;
}

.user-pagination {
  display: flex;
  justify-content: flex-end;
  margin-top: 12px;
}

.user-form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  column-gap: 12px;
}

.user-role-checks {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px 14px;
  width: 100%;
}

.user-role-checks :deep(.el-checkbox) {
  height: auto;
  min-height: 32px;
  align-items: center;
  white-space: normal;
}

.user-role-checks__code {
  margin-left: 6px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

@media (max-width: 1040px) {
  .user-toolbar {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .user-toolbar__actions {
    justify-content: flex-start;
  }
}

@media (max-width: 760px) {
  .user-form-grid,
  .user-role-checks {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .user-toolbar {
    grid-template-columns: 1fr;
  }
}
</style>
