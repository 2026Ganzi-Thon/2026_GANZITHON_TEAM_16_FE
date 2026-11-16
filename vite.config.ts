import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Where the dev server forwards /api: a local backend by default, or the deployed
  // server with API_PROXY_TARGET=https://api.mowoo.kro.kr in .env.local.
  const target = loadEnv(mode, '.', '').API_PROXY_TARGET || 'http://localhost:8080';
  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api': {
          target,
          changeOrigin: true,
          // The browser only sees localhost:3000, so keep the refresh_token cookie on it.
          cookieDomainRewrite: '',
        },
      },
    },
  };
});
