import type {
  EntityId,
  KnowledgeBase,
  KnowledgeBaseCreatePayload,
  KnowledgeBaseQuery,
  KnowledgeBaseStatusUpdatePayload,
  KnowledgeBaseUpdatePayload,
  PageData,
} from '@/types';
import { buildQueryUrl } from '../query';
import { apiRequest } from '../request';

export const knowledgeApi = {
  // 知识库列表按当前用户后端数据范围过滤，前端只传筛选条件和分页参数。
  listKnowledgeBases(query: KnowledgeBaseQuery = {}): Promise<PageData<KnowledgeBase>> {
    return apiRequest.get<PageData<KnowledgeBase>>(buildQueryUrl('/api/v1/knowledge/bases', {
      pageNo: query.pageNo,
      pageSize: query.pageSize,
      keyword: query.keyword,
      ownerDeptId: query.ownerDeptId,
      baseStatus: query.baseStatus,
    }));
  },

  // 详情用于查看和编辑回显，不能替代列表查询权限或写入权限。
  getKnowledgeBase(baseId: EntityId): Promise<KnowledgeBase> {
    return apiRequest.get<KnowledgeBase>(`/api/v1/knowledge/bases/${baseId}`);
  },

  // 创建知识库时提交归属部门、负责人和模型引用，后端负责校验字典与引用状态。
  createKnowledgeBase(payload: KnowledgeBaseCreatePayload): Promise<KnowledgeBase> {
    return apiRequest.post<KnowledgeBase, KnowledgeBaseCreatePayload>('/api/v1/knowledge/bases', payload);
  },

  // 编辑知识库不允许修改 baseCode，避免历史文档引用和外部导入标识漂移。
  updateKnowledgeBase(baseId: EntityId, payload: KnowledgeBaseUpdatePayload): Promise<KnowledgeBase> {
    return apiRequest.put<KnowledgeBase, KnowledgeBaseUpdatePayload>(`/api/v1/knowledge/bases/${baseId}`, payload);
  },

  // 启停状态走独立接口，避免局部动作误提交描述、模型或归属部门。
  updateKnowledgeBaseStatus(baseId: EntityId, payload: KnowledgeBaseStatusUpdatePayload): Promise<KnowledgeBase> {
    return apiRequest.put<KnowledgeBase, KnowledgeBaseStatusUpdatePayload>(
      `/api/v1/knowledge/bases/${baseId}/status`,
      payload,
    );
  },

  // 删除知识库走后端依赖校验；有关联未删除文档时后端会明确拒绝。
  deleteKnowledgeBase(baseId: EntityId): Promise<void> {
    return apiRequest.delete<void>(`/api/v1/knowledge/bases/${baseId}`);
  },
};
