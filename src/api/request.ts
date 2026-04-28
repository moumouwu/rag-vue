import type { ApiErrorResponse, ApiSuccessResponse, StageCode } from '../types';

export interface ApiClientConfig {
  baseUrl?: string;
  getAccessToken?: () => string | null | undefined;
  defaultHeaders?: Record<string, string>;
  fetcher?: typeof fetch;
}

export interface ApiRequestOptions<TBody = unknown> {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  url: string;
  body?: TBody;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  skipAuth?: boolean;
}

const DEFAULT_STAGE_CODE: StageCode = 'failed';

// 这里保留运行时注入点，避免在 Vue 工程初始化前耦合具体登录态实现。
let clientConfig: ApiClientConfig = {
  baseUrl: '',
  defaultHeaders: {},
  fetcher: typeof fetch === 'function' ? fetch.bind(globalThis) : undefined,
};

export class ApiRequestError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  readonly requestId: string;
  readonly stageCode: StageCode;
  readonly timestamp: string;
  readonly status?: number;

  constructor(payload: ApiErrorResponse, status?: number) {
    super(payload.message);
    this.name = 'ApiRequestError';
    this.code = payload.code;
    this.retryable = payload.retryable;
    this.requestId = payload.requestId;
    this.stageCode = payload.stageCode;
    this.timestamp = payload.timestamp;
    this.status = status;
  }
}

export function configureApiClient(config: ApiClientConfig): void {
  clientConfig = {
    ...clientConfig,
    ...config,
    defaultHeaders: {
      ...(clientConfig.defaultHeaders ?? {}),
      ...(config.defaultHeaders ?? {}),
    },
  };
}

export function getApiClientConfig(): Readonly<ApiClientConfig> {
  return clientConfig;
}

export function isApiRequestError(error: unknown): error is ApiRequestError {
  return error instanceof ApiRequestError;
}

async function parseJsonSafely(response: Response): Promise<unknown | null> {
  const rawText = await response.text();
  if (!rawText) {
    return null;
  }

  try {
    return JSON.parse(rawText) as unknown;
  } catch {
    return null;
  }
}

function isApiErrorResponse(payload: unknown): payload is ApiErrorResponse {
  if (!payload || typeof payload !== 'object') {
    return false;
  }

  const candidate = payload as Partial<ApiErrorResponse>;
  return candidate.success === false && typeof candidate.code === 'string' && typeof candidate.message === 'string';
}

function isApiSuccessResponse<TData>(payload: unknown): payload is ApiSuccessResponse<TData> {
  if (!payload || typeof payload !== 'object') {
    return false;
  }

  const candidate = payload as Partial<ApiSuccessResponse<TData>>;
  return candidate.success === true;
}

// 统一兜底成后端约定的错误结构，避免页面层重复处理网络异常和非标响应。
function normalizeErrorPayload(payload: unknown, fallbackMessage: string, status?: number): ApiErrorResponse {
  if (isApiErrorResponse(payload)) {
    return {
      ...payload,
      stageCode: payload.stageCode ?? DEFAULT_STAGE_CODE,
    };
  }

  return {
    success: false,
    code: status ? `HTTP_${status}` : 'NETWORK_ERROR',
    message: fallbackMessage,
    retryable: status ? status >= 500 || status === 429 : true,
    requestId: '',
    stageCode: DEFAULT_STAGE_CODE,
    timestamp: new Date().toISOString(),
  };
}

function buildHeaders(body: unknown, headers?: Record<string, string>, skipAuth?: boolean): Headers {
  const mergedHeaders = new Headers(clientConfig.defaultHeaders ?? {});
  mergedHeaders.set('Accept', 'application/json');

  Object.entries(headers ?? {}).forEach(([key, value]) => {
    mergedHeaders.set(key, value);
  });

  const accessToken = skipAuth ? null : clientConfig.getAccessToken?.();
  if (accessToken) {
    mergedHeaders.set('Authorization', `Bearer ${accessToken}`);
  }

  if (body !== undefined && !mergedHeaders.has('Content-Type')) {
    mergedHeaders.set('Content-Type', 'application/json');
  }

  return mergedHeaders;
}

function joinUrl(baseUrl: string, url: string): string {
  if (/^https?:\/\//.test(url)) {
    return url;
  }

  if (!baseUrl) {
    return url;
  }

  const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  const normalizedPath = url.startsWith('/') ? url : `/${url}`;
  return `${normalizedBaseUrl}${normalizedPath}`;
}

export async function request<TData, TBody = unknown>(options: ApiRequestOptions<TBody>): Promise<TData> {
  const fetcher = clientConfig.fetcher;
  if (!fetcher) {
    throw new Error('当前环境不支持 fetch，请在初始化时注入 fetcher');
  }

  let response: Response;
  try {
    response = await fetcher(joinUrl(clientConfig.baseUrl ?? '', options.url), {
      method: options.method,
      headers: buildHeaders(options.body, options.headers, options.skipAuth),
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '网络请求失败';
    throw new ApiRequestError(normalizeErrorPayload(null, message));
  }

  const payload = await parseJsonSafely(response);
  if (!response.ok) {
    throw new ApiRequestError(
      normalizeErrorPayload(payload, `请求失败，HTTP 状态码 ${response.status}`, response.status),
      response.status,
    );
  }

  if (!isApiSuccessResponse<TData>(payload)) {
    throw new ApiRequestError(normalizeErrorPayload(payload, '接口响应结构不符合约定', response.status), response.status);
  }

  return payload.data;
}

export const apiRequest = {
  get<TData>(url: string, options?: Omit<ApiRequestOptions<never>, 'method' | 'url' | 'body'>): Promise<TData> {
    return request<TData>({
      ...(options ?? {}),
      method: 'GET',
      url,
    });
  },
  post<TData, TBody = unknown>(
    url: string,
    body?: TBody,
    options?: Omit<ApiRequestOptions<TBody>, 'method' | 'url' | 'body'>,
  ): Promise<TData> {
    return request<TData, TBody>({
      ...(options ?? {}),
      method: 'POST',
      url,
      body,
    });
  },
  put<TData, TBody = unknown>(
    url: string,
    body?: TBody,
    options?: Omit<ApiRequestOptions<TBody>, 'method' | 'url' | 'body'>,
  ): Promise<TData> {
    return request<TData, TBody>({
      ...(options ?? {}),
      method: 'PUT',
      url,
      body,
    });
  },
  delete<TData>(url: string, options?: Omit<ApiRequestOptions<never>, 'method' | 'url' | 'body'>): Promise<TData> {
    return request<TData>({
      ...(options ?? {}),
      method: 'DELETE',
      url,
    });
  },
};
