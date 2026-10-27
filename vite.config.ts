import { defineConfig } from 'vite';

// 为射击游戏固定独立来源，避免与其他本地游戏的页面和离线缓存混用。
export default defineConfig({
  server: { host: '127.0.0.1', port: 5186, strictPort: true },
  preview: { host: '127.0.0.1', port: 5187, strictPort: true },
});
