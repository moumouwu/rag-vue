<script setup lang="ts">
import { computed, ref } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import type { AuthorizedMenuNode } from '@/router/menu-permissions';
import { normalizeRoutePath } from '@/router/menu-permissions';

const props = withDefaults(
  defineProps<{
    menus: readonly AuthorizedMenuNode[];
    level?: number;
  }>(),
  {
    level: 1,
  },
);

const route = useRoute();
const expandedMenuKeys = ref<Set<string>>(new Set());

function menuKey(menu: AuthorizedMenuNode): string {
  return `${menu.menuCode}:${menu.menuId}`;
}

function childMenus(menu: AuthorizedMenuNode): readonly AuthorizedMenuNode[] {
  return menu.children ?? [];
}

function isNavigableMenu(menu: AuthorizedMenuNode): boolean {
  return menu.menuType === 'menu' && Boolean(normalizeRoutePath(menu.routePath));
}

function hasVisibleChildren(menu: AuthorizedMenuNode): boolean {
  return childMenus(menu).some(isVisibleMenu);
}

function isVisibleMenu(menu: AuthorizedMenuNode): boolean {
  return isNavigableMenu(menu) || hasVisibleChildren(menu);
}

function isActiveMenu(menu: AuthorizedMenuNode): boolean {
  const routePath = normalizeRoutePath(menu.routePath);
  return (Boolean(routePath) && route.path === routePath) || childMenus(menu).some(isActiveMenu);
}

function isExpanded(menu: AuthorizedMenuNode): boolean {
  return menu.alwaysShowFlag || expandedMenuKeys.value.has(menuKey(menu));
}

function toggleMenu(menu: AuthorizedMenuNode): void {
  if (menu.alwaysShowFlag || !hasVisibleChildren(menu)) {
    return;
  }
  const nextKeys = new Set(expandedMenuKeys.value);
  const key = menuKey(menu);
  if (nextKeys.has(key)) {
    nextKeys.delete(key);
  } else {
    nextKeys.add(key);
  }
  expandedMenuKeys.value = nextKeys;
}

const visibleMenus = computed(() => props.menus.filter(isVisibleMenu));
</script>

<template>
  <ul class="admin-menu-tree" :class="{ 'admin-menu-tree--nested': level > 1 }">
    <li v-for="menu in visibleMenus" :key="menu.menuId" class="admin-menu-tree__item">
      <div
        class="admin-menu-tree__row"
        :class="{
          'admin-menu-tree__row--active': isActiveMenu(menu),
          'admin-menu-tree__row--parent': hasVisibleChildren(menu),
          'admin-menu-tree__row--pinned': menu.alwaysShowFlag,
        }"
      >
        <button
          v-if="hasVisibleChildren(menu)"
          class="admin-menu-tree__toggle"
          type="button"
          :aria-expanded="isExpanded(menu)"
          :aria-label="menu.alwaysShowFlag ? `${menu.menuName}已固定展开` : `${isExpanded(menu) ? '收起' : '展开'}${menu.menuName}`"
          :disabled="menu.alwaysShowFlag"
          @click="toggleMenu(menu)"
        >
          <span class="admin-menu-tree__chevron" :class="{ 'admin-menu-tree__chevron--open': isExpanded(menu) }">
            ›
          </span>
        </button>
        <span v-else class="admin-menu-tree__toggle-placeholder" aria-hidden="true" />

        <RouterLink
          v-if="isNavigableMenu(menu)"
          class="admin-menu-tree__link"
          active-class="admin-menu-tree__link--active"
          :to="normalizeRoutePath(menu.routePath)"
        >
          {{ menu.menuName }}
        </RouterLink>
        <button v-else class="admin-menu-tree__label" type="button" @click="toggleMenu(menu)">
          {{ menu.menuName }}
        </button>
      </div>

      <AdminMenuTree
        v-if="hasVisibleChildren(menu) && isExpanded(menu)"
        :menus="childMenus(menu)"
        :level="level + 1"
      />
    </li>
  </ul>
</template>
