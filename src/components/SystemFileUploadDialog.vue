<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import type { UploadInstance, UploadProps, UploadRawFile } from 'element-plus';
import { Icon } from '@iconify/vue';
import { fileApi } from '@/api/modules/file';
import { isApiRequestError } from '@/api/request';
import type { SystemFile } from '@/types';
import { showErrorMessage, showSuccessMessage } from '@/utils/ui-feedback';

interface SourceModuleOption {
  label: string;
  value: string;
}

interface UploadForm {
  sourceModule: string;
  sourceBizType: string;
  sourceBizId: string;
  sourceBizName: string;
  remark: string;
}

const DEFAULT_SOURCE_MODULE_OPTIONS: SourceModuleOption[] = [
  { label: '系统文件', value: 'system_file' },
  { label: '知识库文档', value: 'knowledge_document' },
  { label: '聊天会话', value: 'chat_session' },
  { label: '任务中心', value: 'task_center' },
];

const props = withDefaults(defineProps<{
  modelValue: boolean;
  defaultSourceModule?: string;
  defaultSourceBizType?: string;
  defaultSourceBizId?: string | null;
  defaultSourceBizName?: string;
  showSourceAdvanced?: boolean;
  sourceModuleOptions?: SourceModuleOption[];
}>(), {
  defaultSourceModule: 'system_file',
  defaultSourceBizType: '',
  defaultSourceBizId: null,
  defaultSourceBizName: '',
  showSourceAdvanced: false,
});

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  uploaded: [file: SystemFile];
}>();

const uploadRef = ref<UploadInstance>();
const selectedFile = ref<File | null>(null);
const uploading = ref(false);

const uploadForm = reactive<UploadForm>({
  sourceModule: props.defaultSourceModule,
  sourceBizType: props.defaultSourceBizType,
  sourceBizId: props.defaultSourceBizId ?? '',
  sourceBizName: props.defaultSourceBizName,
  remark: '',
});

const dialogVisible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
});

const effectiveSourceModuleOptions = computed(() => (
  props.sourceModuleOptions?.length ? props.sourceModuleOptions : DEFAULT_SOURCE_MODULE_OPTIONS
));

function resolveErrorMessage(error: unknown, fallback: string): string {
  return isApiRequestError(error) ? error.message : fallback;
}

function resetForm(): void {
  uploadRef.value?.clearFiles();
  selectedFile.value = null;
  uploadForm.sourceModule = props.defaultSourceModule;
  uploadForm.sourceBizType = props.defaultSourceBizType;
  uploadForm.sourceBizId = props.defaultSourceBizId ?? '';
  uploadForm.sourceBizName = props.defaultSourceBizName;
  uploadForm.remark = '';
}

function beforeUpload(file: UploadRawFile): boolean {
  // 前端只负责选择文件，大小、扩展名和来源合法性必须以后端校验为准。
  selectedFile.value = file;
  return false;
}

const handleChange: UploadProps['onChange'] = (uploadFile) => {
  // 手动上传模式下不会自动提交，需要保留原始 File 给统一上传接口。
  selectedFile.value = uploadFile.raw ?? null;
};

const handleRemove: UploadProps['onRemove'] = () => {
  selectedFile.value = null;
};

function buildSourceBizId(): string | null {
  const value = uploadForm.sourceBizId.trim();
  return value ? value : null;
}

async function submitUpload(): Promise<void> {
  if (!selectedFile.value) {
    showErrorMessage('请选择要上传的文件');
    return;
  }
  if (!uploadForm.sourceModule) {
    showErrorMessage('请选择来源模块');
    return;
  }
  uploading.value = true;
  try {
    const uploadedFile = await fileApi.uploadFile({
      file: selectedFile.value,
      sourceModule: uploadForm.sourceModule,
      sourceBizType: uploadForm.sourceBizType.trim(),
      sourceBizId: buildSourceBizId(),
      sourceBizName: uploadForm.sourceBizName.trim(),
      remark: uploadForm.remark.trim(),
    });
    showSuccessMessage('文件已上传');
    emit('uploaded', uploadedFile);
    dialogVisible.value = false;
    resetForm();
  } catch (error) {
    showErrorMessage(resolveErrorMessage(error, '文件上传失败'));
  } finally {
    uploading.value = false;
  }
}

watch(() => props.modelValue, (visible) => {
  if (visible) {
    // 每次打开弹框都回到默认来源，避免上一次业务来源污染新的上传场景。
    resetForm();
  }
});
</script>

<template>
  <el-dialog v-model="dialogVisible" title="上传文件" width="760px" align-center>
    <el-form label-position="top" class="file-upload-form">
      <el-form-item label="选择文件" required>
        <el-upload
          ref="uploadRef"
          drag
          :limit="1"
          :auto-upload="false"
          :before-upload="beforeUpload"
          :on-change="handleChange"
          :on-remove="handleRemove"
          class="file-upload-form__dropzone"
        >
          <Icon icon="lucide:upload-cloud" class="file-upload-form__icon" aria-hidden="true" />
          <div class="el-upload__text">拖入文件或点击选择</div>
        </el-upload>
      </el-form-item>

      <div class="file-upload-form__grid">
        <el-form-item label="来源模块" required>
          <el-select v-model="uploadForm.sourceModule" class="file-upload-form__control">
            <el-option
              v-for="option in effectiveSourceModuleOptions"
              :key="option.value"
              :label="option.label"
              :value="option.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="来源说明">
          <el-input v-model="uploadForm.sourceBizName" maxlength="256" placeholder="用于文件中心回显" />
        </el-form-item>
        <el-form-item v-if="showSourceAdvanced" label="来源业务类型">
          <el-input v-model="uploadForm.sourceBizType" maxlength="64" placeholder="例如 manual_upload" />
        </el-form-item>
        <el-form-item v-if="showSourceAdvanced" label="来源业务ID">
          <el-input v-model="uploadForm.sourceBizId" maxlength="20" placeholder="可为空" />
        </el-form-item>
      </div>

      <el-form-item label="备注">
        <el-input v-model="uploadForm.remark" type="textarea" maxlength="500" show-word-limit />
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="dialogVisible = false">取消</el-button>
      <el-button type="primary" :loading="uploading" @click="submitUpload">上传</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.file-upload-form__dropzone {
  width: 100%;
}

.file-upload-form__icon {
  width: 32px;
  height: 32px;
  margin-bottom: 8px;
  color: var(--el-color-primary);
}

.file-upload-form__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px 18px;
}

.file-upload-form__control {
  width: 100%;
}

@media (max-width: 860px) {
  .file-upload-form__grid {
    grid-template-columns: 1fr;
  }
}
</style>
