<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { RouteLocationNormalizedLoaded } from 'vue-router';
import { RouterView, useRoute, useRouter } from 'vue-router';
import { useAuthSession } from '@/auth/auth-session';
import AdminMenuTree from '@/components/AdminMenuTree.vue';
import type { AuthorizedMenuNode } from '@/router/menu-permissions';
import { findAuthorizedMenuByPath, findFirstAuthorizedMenuPath, normalizeRoutePath } from '@/router/menu-permissions';
import { confirmAction, showErrorMessage, showSuccessMessage } from '@/utils/ui-feedback';

const route = useRoute();
const router = useRouter();
const { state, currentUser, logout } = useAuthSession();

const pageTitle = computed(() => String(route.meta.title ?? '工作台'));
const rootMenus = computed(() => state.menus as readonly AuthorizedMenuNode[]);
const hasVisibleMenus = computed(() => Boolean(findFirstAuthorizedMenuPath(rootMenus.value)));
const visitedTabs = ref<Array<{ path: string; title: string }>>([]);

function resolveDefaultPath(): string {
  return findFirstAuthorizedMenuPath(rootMenus.value) ?? '/no-permission';
}

function resolveTabTitle(currentRoute: RouteLocationNormalizedLoaded): string {
  const menu = findAuthorizedMenuByPath(currentRoute.path, rootMenus.value);
  return menu?.menuName || String(currentRoute.meta.title ?? currentRoute.path);
}

function shouldTrackTab(currentRoute: RouteLocationNormalizedLoaded): boolean {
  if (currentRoute.name === 'NoPermission' || currentRoute.name === 'NotFound') {
    return false;
  }
  return Boolean(findAuthorizedMenuByPath(currentRoute.path, rootMenus.value));
}

function shouldCacheRoute(currentRoute: RouteLocationNormalizedLoaded): boolean {
  const menu = findAuthorizedMenuByPath(currentRoute.path, rootMenus.value);
  return Boolean(menu?.cacheFlag);
}

function addVisitedTab(currentRoute: RouteLocationNormalizedLoaded): void {
  if (!shouldTrackTab(currentRoute)) {
    return;
  }
  const normalizedPath = normalizeRoutePath(currentRoute.path);
  const existingTab = visitedTabs.value.find((tab) => tab.path === normalizedPath);
  if (existingTab) {
    existingTab.title = resolveTabTitle(currentRoute);
    return;
  }
  visitedTabs.value = [...visitedTabs.value, { path: normalizedPath, title: resolveTabTitle(currentRoute) }];
}

async function closeVisitedTab(path: string): Promise<void> {
  const closingIndex = visitedTabs.value.findIndex((tab) => tab.path === path);
  if (closingIndex < 0) {
    return;
  }

  const nextTabs = visitedTabs.value.filter((tab) => tab.path !== path);
  visitedTabs.value = nextTabs;
  if (route.path !== path) {
    return;
  }

  const fallbackTab = nextTabs[closingIndex - 1] ?? nextTabs[closingIndex] ?? null;
  await router.push(fallbackTab?.path ?? resolveDefaultPath());
}

async function handleLogout(): Promise<void> {
  const confirmed = await confirmAction({
    title: '退出登录',
    message: '确认退出当前账号吗？',
    confirmButtonText: '退出',
    cancelButtonText: '取消',
  });
  if (!confirmed) {
    return;
  }

  try {
    // 确认后不做额外停留，直接清理后端会话和本地令牌。
    await logout();
    showSuccessMessage('已退出登录');
  } catch {
    showErrorMessage('退出请求未完成，本地登录态已清理');
  } finally {
    await router.replace('/login');
  }
}

watch(
  [() => route.fullPath, rootMenus],
  () => {
    addVisitedTab(route);
  },
  { immediate: true },
);
</script>

<template>
  <div class="admin-shell">
    <aside class="admin-sidebar">
      <div class="admin-brand">
        <span class="admin-brand__mark">知</span>
        <div>
          <p class="admin-brand__name">知识库系统</p>
          <p class="admin-brand__desc">知识库后台</p>
        </div>
      </div>

      <nav class="admin-nav" aria-label="后台菜单">
        <AdminMenuTree v-if="hasVisibleMenus" :menus="rootMenus" />
        <p v-else class="admin-nav__empty">当前账号暂无可访问菜单</p>
      </nav>
    </aside>

    <div class="admin-main">
      <header class="admin-topbar">
        <div>
          <p class="admin-topbar__eyebrow">当前页面</p>
          <h1 class="admin-topbar__title">{{ pageTitle }}</h1>
        </div>
        <div class="admin-user">
          <div class="admin-user__text">
            <strong>{{ currentUser?.displayName }}</strong>
            <span>{{ currentUser?.username }}<template v-if="currentUser?.superAdmin"> · 超级管理员</template></span>
          </div>
          <button class="button button--secondary" type="button" @click="handleLogout">退出</button>
        </div>
      </header>

      <div v-if="visitedTabs.length > 0" class="admin-tabs" aria-label="已打开页面">
        <div
          v-for="tab in visitedTabs"
          :key="tab.path"
          class="admin-tabs__item"
          :class="{ 'admin-tabs__item--active': route.path === tab.path }"
        >
          <RouterLink class="admin-tabs__link" :to="tab.path">
            <span class="admin-tabs__title">{{ tab.title }}</span>
          </RouterLink>
          <button class="admin-tabs__close" type="button" aria-label="关闭页签" @click="closeVisitedTab(tab.path)">
            x
          </button>
        </div>
      </div>

      <main class="admin-content">
        <RouterView v-slot="{ Component, route: viewRoute }">
          <KeepAlive>
            <component
              :is="Component"
              v-if="shouldCacheRoute(viewRoute)"
              :key="String(viewRoute.name ?? viewRoute.path)"
            />
          </KeepAlive>
          <component :is="Component" v-if="!shouldCacheRoute(viewRoute)" :key="viewRoute.fullPath" />
        </RouterView>
      </main>
    </div>
  </div>
</template>
