<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { usePermission } from '@/auth/permissions';
import { systemApi } from '@/api/modules/system';
import { isApiRequestError } from '@/api/request';
import MenuIcon from '@/components/MenuIcon.vue';
import {
  MENU_ICON_CATEGORIES,
  MENU_ICON_OPTIONS,
  resolveMenuIconName,
  type MenuIconCategoryKey,
  type MenuIconOption,
} from '@/components/menuIconCatalog';
import type { EntityId, SystemMenuCreatePayload, SystemMenuManagementNode, SystemMenuUpdatePayload } from '@/types';
import { confirmAction, showErrorMessage, showSuccessMessage } from '@/utils/ui-feedback';

type MenuFormMode = 'create' | 'edit';

const menuTree = ref<SystemMenuManagementNode[]>([]);
const loading = ref(false);
const saving = ref(false);
const dialogVisible = ref(false);
const iconPickerVisible = ref(false);
const iconKeyword = ref('');
const iconCategoryKey = ref<MenuIconCategoryKey>('common');
const iconPageNo = ref(1);
const formMode = ref<MenuFormMode>('create');
const editingMenuId = ref<EntityId | null>(null);
const { hasPermission, hasAnyPermission } = usePermission();
const iconPageSize = 80;

const menuForm = reactive<SystemMenuCreatePayload>({
  menuCode: '',
  parentId: '0',
  menuType: 'menu',
  menuName: '',
  routeName: '',
  routePath: '',
  componentPath: '',
  icon: '',
  externalLinkUrl: '',
  visibleFlag: true,
  cacheFlag: false,
  alwaysShowFlag: false,
  sortOrder: 10,
  menuStatus: 'enabled',
  remark: '',
});

const dialogTitle = computed(() => (formMode.value === 'create' ? '新增菜单' : '编辑菜单'));
const menuTypeText = (type: string) => ({ directory: '目录', menu: '菜单', button: '按钮' }[type] ?? type);
const statusText = (status: string) => (status === 'enabled' ? '启用' : '停用');
const emptyText = (value: string | null | undefined) => value?.trim() || '未设置';
const settingTagType = (enabled: boolean) => (enabled ? 'success' : 'info');
const canCreateMenu = computed(() => hasPermission('system:menu:create'));
const canUpdateMenu = computed(() => hasPermission('system:menu:update'));
const canDeleteMenu = computed(() => hasPermission('system:menu:delete'));
const canOperateMenu = computed(() =>
  hasAnyPermission(['system:menu:create', 'system:menu:update', 'system:menu:delete']),
);
const canSubmitMenu = computed(() => (formMode.value === 'create' ? canCreateMenu.value : canUpdateMenu.value));
const menuIconOptions = MENU_ICON_OPTIONS;
const menuIconCategories = MENU_ICON_CATEGORIES;
const selectedIconOption = computed(() =>
  menuIconOptions.find((option) => option.value === resolveMenuIconName(menuForm.icon)) ?? null,
);
const categoryFilteredIconOptions = computed(() => {
  if (iconCategoryKey.value === 'all') {
    return menuIconOptions;
  }
  if (iconCategoryKey.value === 'common') {
    return menuIconOptions.filter((option) => option.common);
  }
  return menuIconOptions.filter((option) => option.categoryKey === iconCategoryKey.value);
});
const iconCategoryCounts = computed(() =>
  menuIconCategories.reduce<Record<MenuIconCategoryKey, number>>((counts, category) => {
    if (category.key === 'all') {
      counts[category.key] = menuIconOptions.length;
    } else if (category.key === 'common') {
      counts[category.key] = menuIconOptions.filter((option) => option.common).length;
    } else {
      counts[category.key] = menuIconOptions.filter((option) => option.categoryKey === category.key).length;
    }
    return counts;
  }, {} as Record<MenuIconCategoryKey, number>),
);
const filteredIconOptions = computed(() => {
  const keyword = iconKeyword.value.trim().toLowerCase();
  const baseOptions = categoryFilteredIconOptions.value;
  if (!keyword) {
    return baseOptions;
  }
  return baseOptions.filter((option) =>
    option.label.includes(keyword) || option.value.includes(keyword),
  );
});
const pagedIconOptions = computed(() => {
  const startIndex = (iconPageNo.value - 1) * iconPageSize;
  return filteredIconOptions.value.slice(startIndex, startIndex + iconPageSize);
});

const parentOptions = computed(() => {
  const options: Array<{ menuId: EntityId; label: string }> = [{ menuId: '0', label: '根目录' }];
  flattenMenus(menuTree.value).forEach((menu) => {
    if (menu.menuId !== editingMenuId.value) {
      // 全角空格只用于下拉层级展示，不参与提交值，避免污染菜单名称。
      options.push({ menuId: menu.menuId, label: `${'　'.repeat(resolveLevel(menu))}${menu.menuName}` });
    }
  });
  return options;
});

function resolveErrorMessage(error: unknown, fallback: string): string {
  return isApiRequestError(error) ? error.message : fallback;
}

function flattenMenus(nodes: SystemMenuManagementNode[]): SystemMenuManagementNode[] {
  return nodes.flatMap((node) => [node, ...flattenMenus(node.children ?? [])]);
}

function resolveLevel(menu: SystemMenuManagementNode): number {
  return menu.ancestors ? Math.max(menu.ancestors.split(',').length - 1, 0) : 0;
}

function openIconPicker(): void {
  // 图标库数量较多，弹窗内通过搜索和分页选择，避免下拉框一次性展开过长。
  iconKeyword.value = '';
  iconCategoryKey.value = selectedIconOption.value?.categoryKey ?? 'common';
  iconPageNo.value = 1;
  iconPickerVisible.value = true;
}

function selectIconCategory(categoryKey: MenuIconCategoryKey): void {
  iconCategoryKey.value = categoryKey;
  iconPageNo.value = 1;
}

function chooseMenuIcon(option: MenuIconOption): void {
  menuForm.icon = option.value;
  iconPickerVisible.value = false;
}

function clearMenuIcon(): void {
  menuForm.icon = '';
}

async function loadMenuTree(): Promise<void> {
  loading.value = true;
  try {
    menuTree.value = await systemApi.listMenuTree();
  } catch (error) {
    showErrorMessage(resolveErrorMessage(error, '菜单树加载失败'));
  } finally {
    loading.value = false;
  }
}

function resetMenuForm(parentId: EntityId = '0'): void {
  menuForm.menuCode = '';
  menuForm.parentId = parentId;
  menuForm.menuType = 'menu';
  menuForm.menuName = '';
  menuForm.routeName = '';
  menuForm.routePath = '';
  menuForm.componentPath = '';
  menuForm.icon = '';
  menuForm.externalLinkUrl = '';
  menuForm.visibleFlag = true;
  menuForm.cacheFlag = false;
  menuForm.alwaysShowFlag = false;
  menuForm.sortOrder = 10;
  menuForm.menuStatus = 'enabled';
  menuForm.remark = '';
}

function openCreateMenu(parentId: EntityId = '0'): void {
  formMode.value = 'create';
  editingMenuId.value = null;
  resetMenuForm(parentId);
  dialogVisible.value = true;
}

function openEditMenu(menu: SystemMenuManagementNode): void {
  formMode.value = 'edit';
  editingMenuId.value = menu.menuId;
  menuForm.menuCode = menu.menuCode;
  menuForm.parentId = menu.parentId;
  menuForm.menuType = menu.menuType;
  menuForm.menuName = menu.menuName;
  menuForm.routeName = menu.routeName;
  menuForm.routePath = menu.routePath;
  menuForm.componentPath = menu.componentPath;
  menuForm.icon = resolveMenuIconName(menu.icon);
  menuForm.externalLinkUrl = menu.externalLinkUrl;
  menuForm.visibleFlag = menu.visibleFlag;
  menuForm.cacheFlag = menu.cacheFlag;
  menuForm.alwaysShowFlag = menu.alwaysShowFlag;
  menuForm.sortOrder = menu.sortOrder;
  menuForm.menuStatus = menu.menuStatus;
  menuForm.remark = menu.remark ?? '';
  dialogVisible.value = true;
}

async function submitMenu(): Promise<void> {
  saving.value = true;
  try {
    // 图标保存 Iconify 标准名称；未选择或无效值保持空值，不再隐式生成。
    const resolvedIcon = resolveMenuIconName(menuForm.icon);
    if (formMode.value === 'create') {
      await systemApi.createMenu({ ...menuForm, icon: resolvedIcon });
      showSuccessMessage('菜单已新增');
    } else if (editingMenuId.value) {
      // 菜单编码创建后不可修改，编辑请求只提交可维护字段。
      const payload: SystemMenuUpdatePayload = {
        parentId: menuForm.parentId,
        menuType: menuForm.menuType,
        menuName: menuForm.menuName,
        routeName: menuForm.routeName,
        routePath: menuForm.routePath,
        componentPath: menuForm.componentPath,
        icon: resolvedIcon,
        externalLinkUrl: menuForm.externalLinkUrl,
        visibleFlag: menuForm.visibleFlag,
        cacheFlag: menuForm.cacheFlag,
        alwaysShowFlag: menuForm.alwaysShowFlag,
        sortOrder: menuForm.sortOrder,
        menuStatus: menuForm.menuStatus,
        remark: menuForm.remark,
      };
      await systemApi.updateMenu(editingMenuId.value, payload);
      showSuccessMessage('菜单已保存');
    }
    dialogVisible.value = false;
    await loadMenuTree();
  } catch (error) {
    showErrorMessage(resolveErrorMessage(error, '菜单保存失败'));
  } finally {
    saving.value = false;
  }
}

async function deleteMenu(menu: SystemMenuManagementNode): Promise<void> {
  const confirmed = await confirmAction({
    title: '删除菜单',
    message: `确认删除菜单“${menu.menuName}”吗？`,
    confirmButtonText: '删除',
  });
  if (!confirmed) {
    return;
  }
  try {
    await systemApi.deleteMenu(menu.menuId);
    showSuccessMessage('菜单已删除');
    await loadMenuTree();
  } catch (error) {
    showErrorMessage(resolveErrorMessage(error, '菜单删除失败'));
  }
}

onMounted(loadMenuTree);
</script>

<template>
  <section class="workspace-card system-page">
    <div class="system-page__header">
      <div>
        <h2 class="section-heading__title">菜单管理</h2>
        <p class="section-heading__desc">维护目录、菜单和按钮入口，菜单授权只影响角色可访问导航。</p>
      </div>
      <div class="system-page__actions">
        <el-button :loading="loading" @click="loadMenuTree">刷新</el-button>
        <el-button v-if="canCreateMenu" type="primary" @click="openCreateMenu()">新增根菜单</el-button>
      </div>
    </div>

    <el-table
      v-loading="loading"
      :data="menuTree"
      row-key="menuId"
      border
      default-expand-all
      class="system-page__table"
    >
      <el-table-column prop="menuName" label="菜单名称" min-width="180" />
      <el-table-column prop="menuCode" label="菜单编码" min-width="170" />
      <el-table-column label="类型" width="90">
        <template #default="{ row }">
          <el-tag>{{ menuTypeText(row.menuType) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="图标" width="130">
        <template #default="{ row }">
          <div class="menu-icon-cell">
            <MenuIcon :icon="row.icon" :fallback-label="row.menuName" />
            <span>{{ emptyText(row.icon) }}</span>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="路由路径" min-width="160">
        <template #default="{ row }">{{ emptyText(row.routePath) }}</template>
      </el-table-column>
      <el-table-column label="组件路径" min-width="180">
        <template #default="{ row }">{{ emptyText(row.componentPath) }}</template>
      </el-table-column>
      <el-table-column label="显示设置" min-width="210">
        <template #default="{ row }">
          <div class="menu-table-settings">
            <el-tag size="small" :type="settingTagType(row.visibleFlag)">
              {{ row.visibleFlag ? '菜单显示' : '菜单隐藏' }}
            </el-tag>
            <el-tag size="small" :type="settingTagType(row.cacheFlag)">
              {{ row.cacheFlag ? '页面缓存' : '不缓存' }}
            </el-tag>
            <el-tag size="small" :type="settingTagType(row.alwaysShowFlag)">
              {{ row.alwaysShowFlag ? '固定展开' : '手动展开' }}
            </el-tag>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="90">
        <template #default="{ row }">
          <el-tag :type="row.menuStatus === 'enabled' ? 'success' : 'danger'">
            {{ statusText(row.menuStatus) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="sortOrder" label="排序" width="80" />
      <el-table-column v-if="canOperateMenu" label="操作" width="220" fixed="right">
        <template #default="{ row }">
          <el-button v-if="canCreateMenu" link type="primary" @click="openCreateMenu(row.menuId)">新增子级</el-button>
          <el-button v-if="canUpdateMenu" link type="primary" @click="openEditMenu(row)">编辑</el-button>
          <el-button v-if="canDeleteMenu" link type="danger" @click="deleteMenu(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="dialogVisible" :title="dialogTitle" width="780px" align-center class="menu-edit-dialog">
      <el-form :model="menuForm" label-position="top" class="menu-form menu-edit-form">
        <section class="menu-form__section menu-edit-form__section">
          <h3 class="menu-form__section-title">基础信息</h3>
          <div class="menu-form__grid menu-edit-form__grid menu-edit-form__grid--basic">
            <el-form-item label="菜单编码" required>
              <el-input v-model="menuForm.menuCode" :disabled="formMode === 'edit'" maxlength="64" />
            </el-form-item>
            <el-form-item label="菜单名称" required>
              <el-input v-model="menuForm.menuName" maxlength="128" />
            </el-form-item>
            <el-form-item label="父级菜单" required>
              <el-select v-model="menuForm.parentId" filterable class="system-page__control">
                <el-option
                  v-for="option in parentOptions"
                  :key="option.menuId"
                  :label="option.label"
                  :value="option.menuId"
                />
              </el-select>
            </el-form-item>
            <el-form-item label="菜单类型" required>
              <el-radio-group v-model="menuForm.menuType" class="menu-form__radio">
                <el-radio-button label="directory">目录</el-radio-button>
                <el-radio-button label="menu">菜单</el-radio-button>
                <el-radio-button label="button">按钮</el-radio-button>
              </el-radio-group>
            </el-form-item>
            <el-form-item label="状态" required>
              <el-radio-group v-model="menuForm.menuStatus" class="menu-form__radio">
                <el-radio-button label="enabled">启用</el-radio-button>
                <el-radio-button label="disabled">停用</el-radio-button>
              </el-radio-group>
            </el-form-item>
            <el-form-item label="排序" required>
              <el-input-number
                v-model="menuForm.sortOrder"
                :min="0"
                :max="9999"
                controls-position="right"
                class="menu-form__number"
              />
            </el-form-item>
          </div>
        </section>

        <section class="menu-form__section menu-edit-form__section">
          <h3 class="menu-form__section-title">路由配置</h3>
          <div class="menu-form__grid menu-edit-form__grid menu-edit-form__grid--route">
            <el-form-item label="路由名称">
              <el-input v-model="menuForm.routeName" />
            </el-form-item>
            <el-form-item label="路由路径">
              <el-input v-model="menuForm.routePath" />
            </el-form-item>
            <el-form-item label="组件路径">
              <el-input v-model="menuForm.componentPath" />
            </el-form-item>
            <el-form-item label="图标" class="menu-edit-form__span-2">
              <div class="menu-icon-field">
                <button class="menu-icon-current" type="button" @click="openIconPicker">
                  <MenuIcon v-if="menuForm.icon" :icon="menuForm.icon" size="small" />
                  <span class="menu-icon-current__text">
                    <strong>{{ selectedIconOption?.label ?? '未选择图标' }}</strong>
                    <small>{{ selectedIconOption?.value ?? '保存时图标为空' }}</small>
                  </span>
                </button>
                <el-button @click="openIconPicker">选择图标</el-button>
                <el-button :disabled="!menuForm.icon" @click="clearMenuIcon">清空</el-button>
              </div>
            </el-form-item>
            <el-form-item label="外链地址">
              <el-input v-model="menuForm.externalLinkUrl" />
            </el-form-item>
          </div>
        </section>

        <section class="menu-form__section menu-edit-form__section">
          <h3 class="menu-form__section-title">显示设置</h3>
          <div class="menu-setting-grid">
            <label class="menu-setting-item">
              <span class="menu-setting-item__text">
                <strong>左侧菜单显示</strong>
                <small>关闭后不会进入用户导航菜单</small>
              </span>
              <el-switch v-model="menuForm.visibleFlag" inline-prompt active-text="显示" inactive-text="隐藏" />
            </label>
            <label class="menu-setting-item">
              <span class="menu-setting-item__text">
                <strong>页面状态缓存</strong>
                <small>开启后页签切换会保留页面状态</small>
              </span>
              <el-switch v-model="menuForm.cacheFlag" inline-prompt active-text="缓存" inactive-text="关闭" />
            </label>
            <label class="menu-setting-item">
              <span class="menu-setting-item__text">
                <strong>目录固定展开</strong>
                <small>开启后侧边栏该目录始终展开</small>
              </span>
              <el-switch v-model="menuForm.alwaysShowFlag" inline-prompt active-text="展开" inactive-text="手动" />
            </label>
          </div>
        </section>

        <section class="menu-form__section menu-edit-form__section">
          <el-form-item label="备注" class="menu-form__remark">
            <el-input v-model="menuForm.remark" type="textarea" maxlength="500" show-word-limit />
          </el-form-item>
        </section>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button v-if="canSubmitMenu" type="primary" :loading="saving" @click="submitMenu">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="iconPickerVisible" title="选择菜单图标" width="920px" align-center class="menu-icon-picker-dialog">
      <div class="menu-icon-picker__toolbar">
        <el-input
          v-model="iconKeyword"
          clearable
          placeholder="搜索图标名称，例如 user、home、settings"
          @input="iconPageNo = 1"
          @clear="iconPageNo = 1"
        />
        <span>共 {{ filteredIconOptions.length }} 个图标</span>
      </div>
      <div class="menu-icon-categories">
        <button
          v-for="category in menuIconCategories"
          :key="category.key"
          type="button"
          class="menu-icon-category"
          :class="{ 'menu-icon-category--active': category.key === iconCategoryKey }"
          @click="selectIconCategory(category.key)"
        >
          <span>{{ category.label }}</span>
          <small>{{ iconCategoryCounts[category.key] ?? 0 }}</small>
        </button>
      </div>
      <div v-if="pagedIconOptions.length > 0" class="menu-icon-grid">
        <button
          v-for="option in pagedIconOptions"
          :key="option.value"
          type="button"
          class="menu-icon-grid__item"
          :class="{ 'menu-icon-grid__item--selected': option.value === menuForm.icon }"
          @click="chooseMenuIcon(option)"
        >
          <MenuIcon :icon="option.value" />
          <span class="menu-icon-grid__text">
            <strong>{{ option.label }}</strong>
            <small>{{ option.categoryLabel }}</small>
          </span>
        </button>
      </div>
      <el-empty v-else description="未找到匹配图标" />
      <div v-if="filteredIconOptions.length > iconPageSize" class="menu-icon-picker__pager">
        <el-pagination
          v-model:current-page="iconPageNo"
          background
          layout="prev, pager, next"
          :page-size="iconPageSize"
          :total="filteredIconOptions.length"
        />
      </div>
    </el-dialog>
  </section>
</template>

<style scoped>
.menu-icon-cell {
  display: inline-flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
}

.menu-icon-cell span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.menu-edit-form {
  grid-template-columns: 1fr;
  gap: 12px;
}

.menu-edit-form__section {
  background: #f8fafc;
  padding: 14px;
}

.menu-edit-form__grid {
  align-items: start;
  gap: 10px 12px;
}

.menu-edit-form__grid--basic {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.menu-edit-form__grid--route {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.menu-edit-form__span-2 {
  grid-column: span 2;
}

.menu-icon-field {
  display: grid;
  grid-template-columns: minmax(160px, 1fr) auto auto;
  min-width: 0;
  align-items: center;
  gap: 6px;
}

.menu-icon-current {
  display: inline-flex;
  min-width: 0;
  min-height: 32px;
  align-items: center;
  gap: 8px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: #ffffff;
  color: var(--text);
  padding: 4px 10px;
  text-align: left;
}

.menu-icon-current:hover {
  border-color: var(--brand);
  background: var(--brand-soft);
}

.menu-icon-current__text {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
}

.menu-icon-current__text strong,
.menu-icon-current__text small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.menu-icon-current__text strong {
  font-size: 13px;
}

.menu-icon-current__text small {
  color: #64748b;
  font-size: 12px;
}

.menu-icon-picker__toolbar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  margin-bottom: 14px;
}

.menu-icon-picker__toolbar span {
  color: var(--text-muted);
  font-size: 13px;
  white-space: nowrap;
}

.menu-icon-categories {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 14px;
}

.menu-icon-category {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: #ffffff;
  color: #334155;
  padding: 7px 10px;
  font-size: 13px;
}

.menu-icon-category:hover,
.menu-icon-category--active {
  border-color: var(--brand);
  background: var(--brand-soft);
  color: var(--brand);
}

.menu-icon-category small {
  color: #64748b;
  font-size: 12px;
}

.menu-icon-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 10px;
  max-height: 480px;
  overflow: auto;
  padding: 2px 2px 4px;
}

.menu-icon-grid__item {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr);
  min-width: 0;
  align-items: center;
  gap: 8px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: #ffffff;
  color: #1f2937;
  padding: 8px;
  text-align: left;
}

.menu-icon-grid__item:hover,
.menu-icon-grid__item--selected {
  border-color: var(--brand);
  background: var(--brand-soft);
}

.menu-icon-grid__text {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.menu-icon-grid__text strong,
.menu-icon-grid__text small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.menu-icon-grid__text strong {
  font-size: 13px;
  font-weight: 700;
}

.menu-icon-grid__text small {
  color: var(--text-muted);
  font-size: 12px;
}

.menu-icon-picker__pager {
  display: flex;
  justify-content: flex-end;
  margin-top: 14px;
}

@media (max-width: 720px) {
  .menu-icon-field,
  .menu-icon-picker__toolbar,
  .menu-edit-form__grid--basic,
  .menu-edit-form__grid--route {
    grid-template-columns: 1fr;
  }

  .menu-edit-form__span-2 {
    grid-column: auto;
  }

  .menu-icon-field {
    align-items: stretch;
  }
}
</style>
