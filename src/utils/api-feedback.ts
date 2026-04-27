import { isApiRequestError } from '@/api';

export function getErrorMessage(error: unknown): string {
  if (isApiRequestError(error)) {
    return `${error.message}（code=${error.code}，stage=${error.stageCode}）`;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return '发生未知错误，请稍后重试';
}

// 统一按逗号、中文逗号、空格和换行切分，避免手工录入时带来脏值。
export function splitTextToIds(rawText: string): string[] {
  return rawText
    .split(/[\s,，\n\r]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function normalizeOptionalText(rawText: string): string | undefined {
  const value = rawText.trim();
  return value ? value : undefined;
}

export function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}
