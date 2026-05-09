import type { CurrentUserInfo, LoginCommand, LoginResult, SsoCallbackCommand, SsoLoginInit } from '@/types';
import { apiRequest } from '../request';

export const authApi = {
  // 登录接口返回令牌和当前用户摘要，是前端会话初始化的入口。
  login(command: LoginCommand): Promise<LoginResult> {
    return apiRequest.post<LoginResult, LoginCommand>('/api/v1/auth/login', command, {
      // 登录接口不应携带历史令牌，避免过期 token 干扰重新登录。
      skipAuth: true,
    });
  },

  // 获取 SSO 入口地址；该接口公开访问，不能依赖前端已有登录态。
  getSsoLoginUrl(): Promise<SsoLoginInit> {
    return apiRequest.get<SsoLoginInit>('/api/v1/auth/sso/login-url', {
      skipAuth: true,
    });
  },

  // SSO 回调换取本系统令牌，返回结构必须和账号密码登录保持一致。
  ssoCallback(command: SsoCallbackCommand): Promise<LoginResult> {
    return apiRequest.post<LoginResult, SsoCallbackCommand>('/api/v1/auth/sso/callback', command, {
      skipAuth: true,
    });
  },

  // 登出接口用于清理后端会话，前端仍会在 finally 中清理本地状态。
  logout(): Promise<void> {
    return apiRequest.post<void>('/api/v1/auth/logout');
  },

  // 刷新页面后用令牌恢复当前用户，避免只信任本地缓存的用户信息。
  getCurrentUser(): Promise<CurrentUserInfo> {
    return apiRequest.get<CurrentUserInfo>('/api/v1/auth/me');
  },
};
