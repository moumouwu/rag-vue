import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import { useAuthSession } from '@/auth/auth-session';
import AdminLayout from '@/views/AdminLayout.vue';
import ChatWorkbenchView from '@/views/ChatWorkbenchView.vue';
import LoginView from '@/views/LoginView.vue';
import DeptListView from '@/views/system/DeptListView.vue';
import MenuListView from '@/views/system/MenuListView.vue';
import NoPermissionView from '@/views/NoPermissionView.vue';
import NotFoundView from '@/views/NotFoundView.vue';
import PlaceholderView from '@/views/PlaceholderView.vue';
import PermissionListView from '@/views/system/PermissionListView.vue';
import RoleListView from '@/views/system/RoleListView.vue';
import TaskCenterWorkbenchView from '@/views/TaskCenterWorkbenchView.vue';
import { findFirstAuthorizedMenuPath, isAuthorizedMenuRoute } from './menu-permissions';

declare module 'vue-router' {
  interface RouteMeta {
    public?: boolean;
    title?: string;
    menuCode?: string;
  }
}

const placeholderRoutes: RouteRecordRaw[] = [
  { path: 'system', name: 'System', component: PlaceholderView, meta: { title: '系统管理', menuCode: 'system' } },
  {
    path: 'system/users',
    name: 'SystemUser',
    component: PlaceholderView,
    meta: { title: '用户管理', menuCode: 'system.user' },
  },
  {
    path: 'system/roles',
    name: 'SystemRole',
    component: RoleListView,
    meta: { title: '角色管理', menuCode: 'system.role' },
  },
  {
    path: 'system/depts',
    name: 'SystemDept',
    component: DeptListView,
    meta: { title: '部门管理', menuCode: 'system.dept' },
  },
  {
    path: 'system/menus',
    name: 'SystemMenu',
    component: MenuListView,
    meta: { title: '菜单管理', menuCode: 'system.menu' },
  },
  {
    path: 'system/permissions',
    name: 'SystemPermission',
    component: PermissionListView,
    meta: { title: '权限管理', menuCode: 'system.permission' },
  },
  {
    path: 'system/dicts',
    name: 'SystemDict',
    component: PlaceholderView,
    meta: { title: '数据字典', menuCode: 'system.dict' },
  },
  { path: 'ai', name: 'Ai', component: PlaceholderView, meta: { title: 'AI配置', menuCode: 'ai' } },
  {
    path: 'ai/models',
    name: 'AiModel',
    component: PlaceholderView,
    meta: { title: '模型配置', menuCode: 'ai.model' },
  },
  { path: 'files', name: 'File', component: PlaceholderView, meta: { title: '文件管理', menuCode: 'file' } },
  {
    path: 'files/manager',
    name: 'FileManager',
    component: PlaceholderView,
    meta: { title: '文件管理', menuCode: 'file.manager' },
  },
  {
    path: 'knowledge',
    name: 'Knowledge',
    component: PlaceholderView,
    meta: { title: '知识库', menuCode: 'knowledge' },
  },
  {
    path: 'knowledge/libraries',
    name: 'KnowledgeLibrary',
    component: PlaceholderView,
    meta: { title: '知识库管理', menuCode: 'knowledge.library' },
  },
];

const routes: RouteRecordRaw[] = [
  { path: '/login', name: 'Login', component: LoginView, meta: { public: true, title: '登录' } },
  {
    path: '/',
    component: AdminLayout,
    children: [
      { path: 'no-permission', name: 'NoPermission', component: NoPermissionView, meta: { title: '暂无权限' } },
      {
        path: 'chat',
        name: 'ChatWorkbench',
        component: ChatWorkbenchView,
        meta: { title: '聊天联调', menuCode: 'chat.workbench' },
      },
      {
        path: 'tasks',
        name: 'TaskCenter',
        component: TaskCenterWorkbenchView,
        meta: { title: '任务中心', menuCode: 'task.center' },
      },
      ...placeholderRoutes,
      { path: ':pathMatch(.*)*', name: 'NotFound', component: NotFoundView, meta: { title: '页面不存在' } },
    ],
  },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
});

function resolveDefaultAuthorizedPath(menus: Parameters<typeof findFirstAuthorizedMenuPath>[0]): string {
  return findFirstAuthorizedMenuPath(menus) ?? '/no-permission';
}

router.beforeEach(async (to) => {
  const authSession = useAuthSession();

  if (to.meta.public) {
    if (!authSession.state.initialized) {
      await authSession.initializeSession();
    }
    return authSession.state.currentUser
      ? { path: resolveDefaultAuthorizedPath(authSession.state.menus), replace: true }
      : true;
  }

  await authSession.initializeSession();
  if (!authSession.state.accessToken || !authSession.state.currentUser) {
    return {
      path: '/login',
      query: { redirect: to.fullPath },
      replace: true,
    };
  }

  const defaultAuthorizedPath = resolveDefaultAuthorizedPath(authSession.state.menus);
  if (to.path === '/') {
    return { path: defaultAuthorizedPath, replace: true };
  }

  if (to.name === 'NoPermission' || to.name === 'NotFound') {
    return true;
  }

  const menuCode = typeof to.meta.menuCode === 'string' ? to.meta.menuCode : undefined;
  if (menuCode && !isAuthorizedMenuRoute(to.path, menuCode, authSession.state.menus)) {
    return { path: defaultAuthorizedPath, replace: true };
  }

  return true;
});
