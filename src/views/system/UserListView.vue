<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { systemApi } from '@/api/modules/system';
import { isApiRequestError } from '@/api/request';
import type { EntityId, SystemDept, SystemUser, SystemUserQuery } from '@/types';
import { showErrorMessage } from '@/utils/ui-feedback';

interface DeptOption {
  deptId: EntityId;
  label: string;
}

const users = ref<SystemUser[]>([]);
const deptTree = ref<SystemDept[]>([]);
const loading = ref(false);
const userPageNo = ref(1);
const userPageSize = ref(10);
const userTotal = ref(0);

const filters = reactive<SystemUserQuery>({
  pageNo: 1,
  pageSize: 10,
  username: '',
  displayName: '',
  departmentId: '',
  userStatus: '',
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

function departmentText(departmentId: EntityId | null): string {
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

async function loadPageData(): Promise<void> {
  loading.value = true;
  try {
    const [userPage, departmentTree] = await Promise.all([
      /*
       * 用户列表后端已叠加数据范围过滤，
       * 前端只提交分页和筛选条件，不自行判断部门可见范围。
       */
      systemApi.listUsers({
        ...filters,
        pageNo: userPageNo.value,
        pageSize: userPageSize.value,
      }),
      systemApi.listDepartmentTree(),
    ]);
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
    deptTree.value = departmentTree;
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
        <p class="section-heading__desc">查询系统用户归属，当前列表已按登录用户的数据范围过滤。</p>
      </div>
      <el-button @click="loadPageData">刷新</el-button>
    </div>

    <div class="user-toolbar">
      <el-input v-model="filters.username" clearable placeholder="搜索用户名" />
      <el-input v-model="filters.displayName" clearable placeholder="搜索姓名" />
      <el-select v-model="filters.departmentId" clearable filterable placeholder="全部部门">
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

    <p class="system-page__hint">此页先完成列表和数据范围验证；新增、编辑、停用和角色分配将在用户管理后续 Story 中补齐。</p>

    <el-table v-loading="loading" :data="users" border row-key="userId" class="system-page__table">
      <el-table-column prop="displayName" label="姓名" min-width="140" />
      <el-table-column prop="username" label="用户名" min-width="140" />
      <el-table-column prop="userCode" label="用户编码" min-width="150" />
      <el-table-column label="所属部门" min-width="150">
        <template #default="{ row }">{{ departmentText(row.departmentId) }}</template>
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
  </section>
</template>

<style scoped>
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

.user-pagination {
  display: flex;
  justify-content: flex-end;
  margin-top: 12px;
}

@media (max-width: 1040px) {
  .user-toolbar {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .user-toolbar__actions {
    justify-content: flex-start;
  }
}

@media (max-width: 640px) {
  .user-toolbar {
    grid-template-columns: 1fr;
  }
}
</style>
