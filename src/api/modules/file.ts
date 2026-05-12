import type { FileUploadPayload, PageData, SystemFile, SystemFileQuery, EntityId } from '@/types';
import { buildQueryUrl } from '../query';
import { apiRequest } from '../request';

export const fileApi = {
  // 文件列表只查询 sys_file 元数据，文件内容、下载和权限边界由后续操作接口处理。
  listFiles(query: SystemFileQuery = {}): Promise<PageData<SystemFile>> {
    return apiRequest.get<PageData<SystemFile>>(buildQueryUrl('/api/v1/files', {
      pageNo: query.pageNo,
      pageSize: query.pageSize,
      keyword: query.keyword,
      sourceModule: query.sourceModule,
      sourceBizType: query.sourceBizType,
      sourceBizId: query.sourceBizId,
      fileExt: query.fileExt,
      fileStatus: query.fileStatus,
      storageProvider: query.storageProvider,
      createdBy: query.createdBy,
      minFileSize: query.minFileSize,
      maxFileSize: query.maxFileSize,
      startTime: query.startTime,
      endTime: query.endTime,
    }));
  },

  // 文件详情用于来源追溯和存储定位回显，不在前端自行拼接下载地址。
  getFile(fileId: EntityId): Promise<SystemFile> {
    return apiRequest.get<SystemFile>(`/api/v1/files/${fileId}`);
  },

  // 文件预览返回 Blob，页面负责创建临时 URL，不把 Token 放入地址栏。
  previewFile(fileId: EntityId): Promise<Blob> {
    return apiRequest.download(`/api/v1/files/${fileId}/preview`, { suppressForbiddenRedirect: true });
  },

  // 文件下载返回 Blob，页面用当前行文件名触发浏览器下载。
  downloadFile(fileId: EntityId): Promise<Blob> {
    return apiRequest.download(`/api/v1/files/${fileId}/download`, { suppressForbiddenRedirect: true });
  },

  // 删除文件由后端校验来源业务引用，前端只表达删除意图。
  deleteFile(fileId: EntityId): Promise<void> {
    return apiRequest.delete<void>(`/api/v1/files/${fileId}`);
  },

  // 文件上传必须走 multipart，后端负责存储写入、元数据登记和访问路径生成。
  uploadFile(payload: FileUploadPayload): Promise<SystemFile> {
    const formData = new FormData();
    formData.append('file', payload.file);
    formData.append('sourceModule', payload.sourceModule);
    formData.append('sourceBizType', payload.sourceBizType);
    if (payload.sourceBizId) {
      formData.append('sourceBizId', payload.sourceBizId);
    }
    formData.append('sourceBizName', payload.sourceBizName);
    formData.append('remark', payload.remark);
    return apiRequest.upload<SystemFile>('/api/v1/files', formData);
  },
};
