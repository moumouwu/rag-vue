import { computed, reactive, readonly } from 'vue';
import { authApi, systemApi } from '@/api';
import type { CurrentUserInfo, LoginCommand, LoginResult, SsoCallbackCommand, SystemMenuNode } from '@/types';
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

  // 初始化只信任本地令牌作为入口，用户信息和菜单仍以后端实时返回为准。
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
    await applyLoginResult(result);
    return result;
  } catch (error) {
    resetSession();
    throw error;
  } finally {
    state.submitting = false;
  }
}

async function loginBySsoCallback(command: SsoCallbackCommand): Promise<LoginResult> {
  state.submitting = true;
  try {
    const result = await authApi.ssoCallback(command);
    await applyLoginResult(result);
    return result;
  } catch (error) {
    resetSession();
    throw error;
  } finally {
    state.submitting = false;
  }
}

async function applyLoginResult(result: LoginResult): Promise<void> {
  writeAccessToken(result.accessToken);
  state.accessToken = result.accessToken;
  state.currentUser = result.userInfo;
  // 登录后立即加载菜单，路由守卫、左侧导航和按钮权限都依赖这份动态授权数据。
  state.menus = await systemApi.getCurrentUserMenus();
  state.initialized = true;
}

async function refreshCurrentUserMenus(): Promise<void> {
  if (!state.accessToken || !state.currentUser) {
    return;
  }
  // 角色授权变更后同时刷新用户权限码和菜单，避免按钮与导航继续显示旧授权结果。
  const [userInfo, menus] = await Promise.all([
    authApi.getCurrentUser(),
    systemApi.getCurrentUserMenus(),
  ]);
  state.currentUser = userInfo;
  state.menus = menus;
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
    loginBySsoCallback,
    logout,
    resetSession,
    isAuthenticated: computed(() => Boolean(state.accessToken && state.currentUser)),
    currentUser: computed<CurrentUserInfo | null>(() => state.currentUser),
  };
}
