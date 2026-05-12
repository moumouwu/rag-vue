export function buildQueryUrl(path: string, params: Record<string, string | number | null | undefined>): string {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    // 统一过滤空筛选值，避免各业务模块把空字符串误传成有效查询条件。
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      searchParams.set(key, String(value).trim());
    }
  });
  const queryString = searchParams.toString();
  return queryString ? `${path}?${queryString}` : path;
}
