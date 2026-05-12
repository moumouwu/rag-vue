import type { PageRequest } from './common';
import type { EntityId } from './system';

export interface FileUploadPayload {
  file: File;
  sourceModule: string;
  sourceBizType: string;
  sourceBizId: EntityId | null;
  sourceBizName: string;
  remark: string;
}

export interface SystemFileQuery extends Partial<PageRequest> {
  keyword?: string;
  sourceModule?: string;
  sourceBizType?: string;
  sourceBizId?: number | null;
  fileExt?: string;
  fileStatus?: SystemFile['fileStatus'] | '';
  storageProvider?: string;
  createdBy?: number | null;
  minFileSize?: number | null;
  maxFileSize?: number | null;
  startTime?: string;
  endTime?: string;
}

export interface SystemFile {
  fileId: EntityId;
  sourceModule: string;
  sourceBizType: string;
  sourceBizId: EntityId | null;
  sourceBizName: string;
  storageProvider: string;
  bucket: string;
  storageKey: string;
  originFileName: string;
  fileExt: string;
  contentType: string;
  fileSize: number;
  etag: string;
  fileStatus: 'available' | 'pending_scan' | 'blocked' | 'deleted';
  accessPath: string;
  previewPath: string;
  remark: string;
  createdBy: EntityId | null;
  createdByName: string | null;
  createdTime: string | null;
  updatedBy: EntityId | null;
  updatedByName: string | null;
  updatedTime: string | null;
}
