<script setup lang="ts">
import { computed } from 'vue';
import { Icon } from '@iconify/vue';
import { resolveMenuIconName } from '@/components/menuIconCatalog';

const props = withDefaults(
  defineProps<{
    icon?: string | null;
    fallbackLabel?: string;
    size?: 'small' | 'default';
  }>(),
  {
    icon: '',
    fallbackLabel: '',
    size: 'default',
  },
);

function normalizeIcon(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? '';
}

const normalizedIcon = computed(() => normalizeIcon(props.icon));
const resolvedIcon = computed(() => resolveMenuIconName(normalizedIcon.value));
const titleText = computed(() =>
  resolvedIcon.value ? `菜单图标：${resolvedIcon.value}` : `未选择菜单图标：${props.fallbackLabel || '未命名'}`,
);
</script>

<template>
  <span v-if="resolvedIcon" class="menu-icon" :class="{ 'menu-icon--small': size === 'small' }" :title="titleText">
    <Icon :icon="resolvedIcon" aria-hidden="true" />
  </span>
</template>

<style scoped>
.menu-icon {
  display: inline-flex;
  width: 24px;
  height: 24px;
  flex: 0 0 24px;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--menu-icon-border, transparent);
  border-radius: 7px;
  background: var(--menu-icon-bg, rgba(37, 99, 235, 0.12));
  color: var(--menu-icon-color, var(--el-color-primary));
}

.menu-icon :deep(svg) {
  width: 15px;
  height: 15px;
}

.menu-icon--small {
  width: 22px;
  height: 22px;
  flex-basis: 22px;
  border-radius: 6px;
}

.menu-icon--small :deep(svg) {
  width: 14px;
  height: 14px;
}
</style>
