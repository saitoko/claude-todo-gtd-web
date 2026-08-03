import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// __dirname 相当（ESMでは import.meta.url 経由）
const here = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  root: here,
  cacheDir: `${here}/node_modules/.vite`,
  plugins: [react()],
  server: {
    port: 5176,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:5175',
        changeOrigin: true,
      },
    },
  },
});
