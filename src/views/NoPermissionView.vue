<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';

const route = useRoute();

const isForbidden = computed(() => route.query.reason === 'forbidden');
const pageTitle = computed(() => (isForbidden.value ? '无权限访问' : '暂无可访问菜单'));
const pageDescription = computed(() =>
  isForbidden.value
    ? '当前账号没有访问该功能或接口的权限，请联系管理员分配对应角色和接口权限。'
    : '当前账号没有返回可访问的后端菜单，请联系管理员分配角色或菜单权限。',
);
</script>

<template>
  <section class="workspace-card no-permission-page">
    <div class="section-heading">
      <h2 class="section-heading__title">{{ pageTitle }}</h2>
      <p class="section-heading__desc">{{ pageDescription }}</p>
    </div>
    <RouterLink class="button button--primary" to="/">返回首页</RouterLink>
  </section>
</template>

<style scoped>
.no-permission-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
  align-items: flex-start;
}
</style>
