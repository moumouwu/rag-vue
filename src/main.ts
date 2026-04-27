import { createApp } from 'vue';
import App from './App.vue';
import { configureApiClient } from '@/api';
import { readAccessToken } from '@/auth/auth-storage';
import { router } from '@/router';
import './styles.css';

// 这里集中读取环境变量，避免页面层直接感知鉴权和部署差异。
configureApiClient({
  baseUrl: import.meta.env.VITE_API_BASE_URL?.trim() || '',
  getAccessToken: () => readAccessToken(),
});

createApp(App).use(router).mount('#app');
