import { ElMessage, ElMessageBox } from 'element-plus';
import 'element-plus/es/components/message/style/css';
import 'element-plus/es/components/message-box/style/css';

type FeedbackType = 'success' | 'warning' | 'info' | 'error';

interface ConfirmOptions {
  title?: string;
  message: string;
  type?: FeedbackType;
  confirmButtonText?: string;
  cancelButtonText?: string;
}

export async function confirmAction(options: ConfirmOptions): Promise<boolean> {
  try {
    await ElMessageBox.confirm(options.message, options.title ?? '操作确认', {
      confirmButtonText: options.confirmButtonText ?? '确认',
      cancelButtonText: options.cancelButtonText ?? '取消',
      type: options.type ?? 'warning',
      closeOnClickModal: false,
      distinguishCancelAndClose: true,
    });
    return true;
  } catch {
    // 用户取消或关闭弹窗都按未确认处理，避免误执行危险操作。
    return false;
  }
}

export function showSuccessMessage(message: string): void {
  ElMessage.success(message);
}

export function showErrorMessage(message: string): void {
  ElMessage.error(message);
}
