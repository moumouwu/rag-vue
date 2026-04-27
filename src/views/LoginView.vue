<script setup lang="ts">
import { reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthSession } from '@/auth/auth-session';
import { findFirstAuthorizedMenuPath, isAuthorizedMenuRoute } from '@/router/menu-permissions';
import { getErrorMessage } from '@/utils/api-feedback';

const { login, state } = useAuthSession();
const router = useRouter();
const route = useRoute();

const form = reactive({
  username: 'admin',
  password: 'Admin@123456',
});

const submitError = ref('');

function resolveRedirectPath(): string {
  const redirect = route.query.redirect;
  if (
    typeof redirect === 'string' &&
    redirect.startsWith('/') &&
    !redirect.startsWith('/login') &&
    isAuthorizedMenuRoute(redirect, undefined, state.menus)
  ) {
    // 只允许站内且已授权的菜单路径回跳，避免登录后被 query 参数带到无权限页面。
    return redirect;
  }
  return findFirstAuthorizedMenuPath(state.menus) ?? '/no-permission';
}

async function handleSubmit(): Promise<void> {
  submitError.value = '';
  try {
    await login({
      username: form.username.trim(),
      password: form.password,
    });
    await router.replace(resolveRedirectPath());
  } catch (error) {
    submitError.value = getErrorMessage(error);
  }
}
</script>

<template>
  <div class="auth-shell">
    <section class="login-card">
      <div class="login-card__header">
        <p class="hero-card__eyebrow">知识库工作台</p>
        <h1 class="login-card__title">登录知识库系统</h1>
        <p class="login-card__desc">
          登录后可直接进入“提问 -> 回答 -> 引用”的联调工作台，验证鉴权、知识检索与任务处理主链路。
        </p>
      </div>

      <form class="login-form" @submit.prevent="handleSubmit">
        <label class="field">
          <span class="field__label">用户名</span>
          <input v-model="form.username" class="input" type="text" autocomplete="username" placeholder="请输入用户名" />
        </label>

        <label class="field">
          <span class="field__label">密码</span>
          <input
            v-model="form.password"
            class="input"
            type="password"
            autocomplete="current-password"
            placeholder="请输入密码"
          />
        </label>

        <p v-if="submitError" class="status-banner status-banner--error">{{ submitError }}</p>

        <button class="button button--primary login-card__submit" type="submit" :disabled="state.submitting">
          {{ state.submitting ? '登录中...' : '进入系统' }}
        </button>
      </form>

      <p class="login-card__hint">
        当前默认对接后端 `/api/v1/auth/*` 接口；若已配置启动管理员，可直接使用初始化账号登录验证。
      </p>
    </section>

    <aside class="login-side">
      <div class="login-side__card">
        <h2 class="login-side__title">本轮已接通的链路</h2>
        <ul class="login-side__list">
          <li>用户名密码登录，返回不透明令牌</li>
          <li>会话持久化与当前用户恢复</li>
          <li>登录失效后自动清理本地令牌</li>
        </ul>
      </div>

      <div class="login-side__card">
        <h2 class="login-side__title">联调关注点</h2>
        <ul class="login-side__list">
          <li>回答是否带引用与出处</li>
          <li>任务重试与批量重跑状态是否清晰</li>
          <li>登录、登出、过期提示是否稳定一致</li>
        </ul>
      </div>
    </aside>
  </div>
</template>
