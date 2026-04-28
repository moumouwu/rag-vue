import { computed, reactive, readonly } from 'vue';
import { authApi, systemApi } from '@/api';
import type { CurrentUserInfo, LoginCommand, LoginResult, SystemMenuNode } from '@/types';
import { clearAccessToken, readAccessToken, writeAccessToken } from './auth-storage';

interface AuthState {
  initialized: boolean;
  loading: boolean;
  submitting: boolean;
  accessToken: string | null;
  currentUser: CurrentUserInfo | null;
  menus: SystemMenuNode[];
}

const state = reactive<AuthState>({
  initialized: false,
  loading: false,
  submitting: false,
  accessToken: readAccessToken(),
  currentUser: null,
  menus: [],
});

async function initializeSession(): Promise<void> {
  if (state.initialized || state.loading) {
    return;
  }

  const accessToken = readAccessToken();
  state.accessToken = accessToken;
  if (!accessToken) {
    state.initialized = true;
    return;
  }

  state.loading = true;
  try {
    state.currentUser = await authApi.getCurrentUser();
    state.menus = await systemApi.getCurrentUserMenus();
  } catch {
    // 本地令牌失效时必须主动清理，避免后续请求反复携带脏登录态。
    resetSession();
  } finally {
    state.loading = false;
    state.initialized = true;
  }
}

async function login(command: LoginCommand): Promise<LoginResult> {
  state.submitting = true;
  try {
    const result = await authApi.login(command);
    writeAccessToken(result.accessToken);
    state.accessToken = result.accessToken;
    state.currentUser = result.userInfo;
    state.menus = await systemApi.getCurrentUserMenus();
    state.initialized = true;
    return result;
  } catch (error) {
    resetSession();
    throw error;
  } finally {
    state.submitting = false;
  }
}

async function refreshCurrentUserMenus(): Promise<void> {
  if (!state.accessToken || !state.currentUser) {
    return;
  }
  // 角色授权变更后刷新当前菜单，避免页面继续显示旧授权结果。
  state.menus = await systemApi.getCurrentUserMenus();
}

async function logout(): Promise<void> {
  try {
    if (state.accessToken) {
      await authApi.logout();
    }
  } finally {
    resetSession();
    state.initialized = true;
  }
}

function resetSession(): void {
  clearAccessToken();
  state.accessToken = null;
  state.currentUser = null;
  state.menus = [];
}

export function useAuthSession() {
  return {
    state: readonly(state),
    initializeSession,
    refreshCurrentUserMenus,
    login,
    logout,
    resetSession,
    isAuthenticated: computed(() => Boolean(state.accessToken && state.currentUser)),
    currentUser: computed<CurrentUserInfo | null>(() => state.currentUser),
  };
}
