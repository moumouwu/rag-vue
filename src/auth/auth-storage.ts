const DEFAULT_ACCESS_TOKEN_STORAGE_KEY = 'rag-demo-token';
const SSO_REDIRECT_STORAGE_KEY = 'rag-demo-sso-redirect';

export const ACCESS_TOKEN_STORAGE_KEY =
  import.meta.env.VITE_ACCESS_TOKEN_STORAGE_KEY?.trim() || DEFAULT_ACCESS_TOKEN_STORAGE_KEY;

export function readAccessToken(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }
  return window.localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY);
}

export function writeAccessToken(accessToken: string): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, accessToken);
}

export function clearAccessToken(): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
}

export function writeSsoRedirectPath(path: string): void {
  if (typeof window === 'undefined') {
    return;
  }
  // SSO 回调跨页面返回，只临时存在 sessionStorage，避免长期污染用户下次登录跳转。
  window.sessionStorage.setItem(SSO_REDIRECT_STORAGE_KEY, path);
}

export function takeSsoRedirectPath(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }
  const redirect = window.sessionStorage.getItem(SSO_REDIRECT_STORAGE_KEY);
  window.sessionStorage.removeItem(SSO_REDIRECT_STORAGE_KEY);
  return redirect;
}
