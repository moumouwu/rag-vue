import type {
  EntityId,
  KnowledgeBase,
  KnowledgeBaseConfig,
  KnowledgeBaseConfigPayload,
  KnowledgeBaseChunkStrategy,
  KnowledgeBaseCreatePayload,
  KnowledgeBaseQuery,
  KnowledgeBaseStatusUpdatePayload,
  KnowledgeBaseUpdatePayload,
  KnowledgeChunkStrategyOption,
  KnowledgeDocument,
  KnowledgeDocumentBusinessStatusUpdatePayload,
  KnowledgeDocumentChunk,
  KnowledgeDocumentChunkQuery,
  KnowledgeDocumentCreatePayload,
  KnowledgeDocumentPermissionAssignPayload,
  KnowledgeDocumentPermissionAuthorization,
  KnowledgeDocumentProcessingVersion,
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

  // 策略选项由后端返回可保存和可执行状态，前端不能自行推断哪些策略已接入处理链路。
  listKnowledgeChunkStrategies(includeInherit = false): Promise<KnowledgeChunkStrategyOption[]> {
    return apiRequest.get<KnowledgeChunkStrategyOption[]>(buildQueryUrl('/api/v1/knowledge/chunk-strategies', {
      includeInherit,
    }));
  },

  // 查询知识库默认分块策略时同时回显系统默认和最终生效配置，避免继承口径只在前端猜测。
  getKnowledgeBaseChunkStrategy(baseId: EntityId): Promise<KnowledgeBaseChunkStrategy> {
    return apiRequest.get<KnowledgeBaseChunkStrategy>(`/api/v1/knowledge/bases/${baseId}/chunk-strategy`);
  },

  // 配置页聚合查询处理策略、检索配置和模型下拉，避免一个页面拆多个后端接口导致保存口径漂移。
  getKnowledgeBaseConfig(baseId: EntityId): Promise<KnowledgeBaseConfig> {
    return apiRequest.get<KnowledgeBaseConfig>(`/api/v1/knowledge/bases/${baseId}/config`);
  },

  // 配置页一次保存处理策略和检索配置，后端在同一事务内保证两个配置项一致提交。
  saveKnowledgeBaseConfig(baseId: EntityId, payload: KnowledgeBaseConfigPayload): Promise<KnowledgeBaseConfig> {
    return apiRequest.put<KnowledgeBaseConfig, KnowledgeBaseConfigPayload>(
      `/api/v1/knowledge/bases/${baseId}/config`,
      payload,
    );
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

  // 重新处理会重新解析来源并入后台任务，前端不能直接修改处理状态或分块结果。
  reprocessKnowledgeDocument(documentId: EntityId): Promise<KnowledgeDocument> {
    return apiRequest.post<KnowledgeDocument, undefined>(
      `/api/v1/knowledge/documents/${documentId}/reprocess`,
      undefined,
    );
  },

  // 删除文档走逻辑删除，后端公共 Mapper 会写入更新审计字段。
  deleteKnowledgeDocument(documentId: EntityId): Promise<void> {
    return apiRequest.delete<void>(`/api/v1/knowledge/documents/${documentId}`);
  },

  // 处理版本列表继承文档访问权限，只做历史快照查看，不允许前端切换生效版本。
  listKnowledgeDocumentProcessingVersions(documentId: EntityId): Promise<KnowledgeDocumentProcessingVersion[]> {
    return apiRequest.get<KnowledgeDocumentProcessingVersion[]>(
      `/api/v1/knowledge/documents/${documentId}/processing-versions`,
    );
  },

  // 处理版本详情用于排查策略、模型和失败原因，并作为历史版本分块查询的入口。
  getKnowledgeDocumentProcessingVersion(
    documentId: EntityId,
    processingVersion: number,
  ): Promise<KnowledgeDocumentProcessingVersion> {
    return apiRequest.get<KnowledgeDocumentProcessingVersion>(
      `/api/v1/knowledge/documents/${documentId}/processing-versions/${processingVersion}`,
    );
  },

  // 分块列表继承文档访问权限，未传处理版本时后端使用当前生效版本；前端只做查看，不触发处理。
  listKnowledgeDocumentChunks(
    documentId: EntityId,
    query: KnowledgeDocumentChunkQuery = {},
  ): Promise<PageData<KnowledgeDocumentChunk>> {
    return apiRequest.get<PageData<KnowledgeDocumentChunk>>(buildQueryUrl(
      `/api/v1/knowledge/documents/${documentId}/chunks`,
      {
        pageNo: query.pageNo,
        pageSize: query.pageSize,
        processingVersion: query.processingVersion,
      },
    ));
  },

  // 分块详情必须携带文档ID，后端按文档权限校验，避免只凭 chunkId 枚举跨文档内容。
  getKnowledgeDocumentChunk(documentId: EntityId, chunkId: EntityId): Promise<KnowledgeDocumentChunk> {
    return apiRequest.get<KnowledgeDocumentChunk>(
      `/api/v1/knowledge/documents/${documentId}/chunks/${chunkId}`,
    );
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
