import type {
  EntityId,
  KnowledgeBase,
  KnowledgeBaseCreatePayload,
  KnowledgeBaseQuery,
  KnowledgeBaseStatusUpdatePayload,
  KnowledgeBaseUpdatePayload,
  KnowledgeDocument,
  KnowledgeDocumentBusinessStatusUpdatePayload,
  KnowledgeDocumentCreatePayload,
  KnowledgeDocumentPermissionAssignPayload,
  KnowledgeDocumentPermissionAuthorization,
  KnowledgeDocumentQuery,
  KnowledgeDocumentUpdatePayload,
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
      ownerUserId: query.ownerUserId,
      baseStatus: query.baseStatus,
      displayEnabled: query.displayEnabled,
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

  // 文档列表按后端文档权限策略过滤，列表响应不包含正文快照，避免大字段拖慢页面。
  listKnowledgeDocuments(query: KnowledgeDocumentQuery = {}): Promise<PageData<KnowledgeDocument>> {
    return apiRequest.get<PageData<KnowledgeDocument>>(buildQueryUrl('/api/v1/knowledge/documents', {
      pageNo: query.pageNo,
      pageSize: query.pageSize,
      knowledgeBaseId: query.knowledgeBaseId,
      keyword: query.keyword,
      sourceType: query.sourceType,
      businessStatus: query.businessStatus,
      processingStatus: query.processingStatus,
      ownerDeptId: query.ownerDeptId,
    }));
  },

  // 文档详情包含正文快照，编辑弹窗打开时再按需读取。
  getKnowledgeDocument(documentId: EntityId): Promise<KnowledgeDocument> {
    return apiRequest.get<KnowledgeDocument>(`/api/v1/knowledge/documents/${documentId}`);
  },

  // 创建文档时提交来源和元数据，后端负责校验文件状态、URL和状态字典。
  createKnowledgeDocument(payload: KnowledgeDocumentCreatePayload): Promise<KnowledgeDocument> {
    return apiRequest.post<KnowledgeDocument, KnowledgeDocumentCreatePayload>('/api/v1/knowledge/documents', payload);
  },

  // 编辑文档不允许修改 documentCode 和所属知识库，避免历史引用标识漂移。
  updateKnowledgeDocument(documentId: EntityId, payload: KnowledgeDocumentUpdatePayload): Promise<KnowledgeDocument> {
    return apiRequest.put<KnowledgeDocument, KnowledgeDocumentUpdatePayload>(
      `/api/v1/knowledge/documents/${documentId}`,
      payload,
    );
  },

  // 发布、下线、归档统一走业务状态接口，不能误改处理链路状态。
  updateKnowledgeDocumentBusinessStatus(
    documentId: EntityId,
    payload: KnowledgeDocumentBusinessStatusUpdatePayload,
  ): Promise<KnowledgeDocument> {
    return apiRequest.put<KnowledgeDocument, KnowledgeDocumentBusinessStatusUpdatePayload>(
      `/api/v1/knowledge/documents/${documentId}/business-status`,
      payload,
    );
  },

  // 删除文档走逻辑删除，后端公共 Mapper 会写入更新审计字段。
  deleteKnowledgeDocument(documentId: EntityId): Promise<void> {
    return apiRequest.delete<void>(`/api/v1/knowledge/documents/${documentId}`);
  },

  // 文档授权查询聚合返回部门、角色、用户可选项，前端不再依赖普通列表接口权限。
  getDocumentPermissionAuthorization(documentId: EntityId): Promise<KnowledgeDocumentPermissionAuthorization> {
    return apiRequest.get<KnowledgeDocumentPermissionAuthorization>(
      `/api/v1/knowledge/documents/${documentId}/permission-authorization`,
    );
  },

  // 文档权限保存是覆盖语义；失败时页面应保留当前选择，避免误以为已清空。
  saveDocumentPermissionScopes(documentId: EntityId, payload: KnowledgeDocumentPermissionAssignPayload): Promise<void> {
    return apiRequest.put<void, KnowledgeDocumentPermissionAssignPayload>(
      `/api/v1/knowledge/documents/${documentId}/permission-scopes`,
      payload,
    );
  },
};
