import type { EntityId } from './system';

export interface CurrentUserInfo {
  userId: EntityId;
  username: string;
  displayName: string;
  departmentId: EntityId | null;
  roleCodes: string[];
  permissionCodes: string[];
  superAdmin: boolean;
}

export interface LoginCommand {
  username: string;
  password: string;
}

export interface LoginResult {
  accessToken: string;
  tokenType: 'Bearer';
  expireTime: string;
  userInfo: CurrentUserInfo;
}

export interface SsoLoginInit {
  loginUrl: string;
  state: string;
  providerCode: string;
}

export interface SsoCallbackCommand {
  providerCode: string;
  externalUserId?: string;
  code?: string;
  error?: string;
  username?: string;
  displayName?: string;
  email?: string;
  mobile?: string;
  timestamp?: string;
  nonce?: string;
  state?: string;
  signature?: string;
}
