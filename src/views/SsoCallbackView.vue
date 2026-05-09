<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthSession } from '@/auth/auth-session';
import { takeSsoRedirectPath } from '@/auth/auth-storage';
import { findFirstAuthorizedMenuPath, isAuthorizedMenuRoute } from '@/router/menu-permissions';
import { getErrorMessage } from '@/utils/api-feedback';
import type { SsoCallbackCommand } from '@/types';

const route = useRoute();
const router = useRouter();
const authSession = useAuthSession();
const errorMessage = ref('');

function queryText(name: string): string {
  const value = route.query[name];
  return typeof value === 'string' ? value : '';
}

function buildCallbackCommand(): SsoCallbackCommand {
  const code = queryText('code');
  return {
    providerCode: queryText('providerCode') || (code ? 'github' : ''),
    externalUserId: queryText('externalUserId'),
    code,
    error: queryText('error'),
    username: queryText('username'),
    displayName: queryText('displayName'),
    email: queryText('email'),
    mobile: queryText('mobile'),
    timestamp: queryText('timestamp'),
    nonce: queryText('nonce'),
    state: queryText('state'),
    signature: queryText('signature'),
  };
}

function resolveRedirectPath(): string {
  const redirect = takeSsoRedirectPath();
  if (
    redirect &&
    redirect.startsWith('/') &&
    !redirect.startsWith('/login') &&
    isAuthorizedMenuRoute(redirect, undefined, authSession.state.menus)
  ) {
    // SSO 回调后仍按本系统菜单权限校验回跳地址，避免外部 state 带来越权跳转。
    return redirect;
  }
  return findFirstAuthorizedMenuPath(authSession.state.menus) ?? '/no-permission';
}

onMounted(async () => {
  try {
    await authSession.loginBySsoCallback(buildCallbackCommand());
    await router.replace(resolveRedirectPath());
  } catch (error) {
    errorMessage.value = getErrorMessage(error);
  }
});
</script>

<template>
  <div class="auth-shell">
    <section class="login-card sso-callback">
      <h1 class="login-card__title">单点登录处理中</h1>
      <p v-if="!errorMessage" class="login-card__desc">正在校验统一身份回调，请稍候。</p>
      <p v-else class="status-banner status-banner--error">{{ errorMessage }}</p>
      <router-link v-if="errorMessage" class="button button--primary login-card__submit" to="/login">
        返回登录页
      </router-link>
    </section>
  </div>
</template>

<style scoped>
.sso-callback {
  margin: auto;
}
</style>
