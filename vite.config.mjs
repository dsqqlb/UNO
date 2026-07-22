import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// 前端源码位于 client/，构建产物输出到 dist/（由 server.js 托管）
export default defineConfig({
  plugins: [vue()],
  root: 'client',
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true,
  },
});
