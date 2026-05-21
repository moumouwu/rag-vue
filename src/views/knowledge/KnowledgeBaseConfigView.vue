<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import KnowledgeBaseConfigPanel from '@/components/KnowledgeBaseConfigPanel.vue';

const route = useRoute();
const router = useRouter();
// 路由页只负责承接地址栏知识库 ID，实际配置逻辑统一收敛到聚合面板。
const baseId = computed(() => String(route.params.baseId ?? '').trim());

// 返回知识库列表，配置页不直接处理列表筛选状态。
function goBack(): void {
  router.push({ name: 'KnowledgeLibrary' });
}
</script>

<template>
  <section class="workspace-card system-page">
    <div class="system-page__header">
      <div>
        <h2 class="section-heading__title">知识库配置</h2>
        <p class="section-heading__desc">配置知识库处理策略、召回候选数、最终引用数、向量模型和重排模型。</p>
      </div>
      <el-button @click="goBack">返回</el-button>
    </div>

    <KnowledgeBaseConfigPanel :base-id="baseId" />
  </section>
</template>
