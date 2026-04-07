import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';
import path from 'path';

const isTauriMode = !!process.env.VITE_TAURI;

export default defineConfig({
  plugins: isTauriMode ? [react()] : [react(), basicSsl()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  // Relative paths so Tauri can load bundled assets from the filesystem
  base: isTauriMode ? './' : '/',
  server: {
    port: isTauriMode ? 5173 : 3000,
    host: '0.0.0.0',
    https: isTauriMode ? false : undefined,
    proxy: isTauriMode
      ? {}
      : {
          '/api': {
            target: 'http://localhost:3001',
            changeOrigin: true,
          },
          '/socket.io': {
            target: 'http://localhost:3001',
            ws: true,
            changeOrigin: true,
          },
        },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    // Tauri supports modern browsers only; tighten target to reduce bundle size
    target: isTauriMode ? ['es2021', 'chrome105', 'safari13'] : undefined,
  },
});
