import { createApp } from 'vue';
import ElementPlus from 'element-plus';
import zhCn from 'element-plus/es/locale/lang/zh-cn';
import App from './App.vue';
import { configureApiClient } from '@/api';
import { readAccessToken } from '@/auth/auth-storage';
import { router } from '@/router';
import 'element-plus/dist/index.css';
import './styles.css';

// 这里集中读取环境变量，避免页面层直接感知鉴权和部署差异。
configureApiClient({
  baseUrl: import.meta.env.VITE_API_BASE_URL?.trim() || '',
  getAccessToken: () => readAccessToken(),
});

// 统一使用中文组件文案，避免分页、弹窗等基础控件暴露英文默认值。
createApp(App).use(router).use(ElementPlus, { locale: zhCn }).mount('#app');
