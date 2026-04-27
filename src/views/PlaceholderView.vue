<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';

const route = useRoute();
const title = computed(() => String(route.meta.title ?? '业务页面'));
const menuCode = computed(() => String(route.meta.menuCode ?? '-'));
</script>

<template>
  <section class="workspace-card">
    <div class="section-heading">
      <h2 class="section-heading__title">{{ title }}</h2>
      <p class="section-heading__desc">该菜单已接入后台框架，业务页面将在对应 story 中补齐。</p>
    </div>
    <dl class="definition-list">
      <div>
        <dt>菜单编码</dt>
        <dd>{{ menuCode }}</dd>
      </div>
      <div>
        <dt>路由路径</dt>
        <dd>{{ route.path }}</dd>
      </div>
    </dl>
  </section>
</template>
