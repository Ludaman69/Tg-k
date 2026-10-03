import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { readFileSync } from 'fs';

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [react(), tailwindcss()],
  build: {
    // Target modern browsers for smaller/faster bundles
    target: 'es2020',
    // Better code splitting
    rollupOptions: {
      output: {
        manualChunks: {
          // Split heavy vendor libs into their own cacheable chunks
          'vendor-react': ['react', 'react-dom'],
          'vendor-framer': ['framer-motion'],
          'vendor-emoji': ['@emoji-mart/data', '@emoji-mart/react', 'emoji-mart'],
          'vendor-query': ['@tanstack/react-query'],
          'vendor-socket': ['socket.io-client'],
          'vendor-zustand': ['zustand'],
          'vendor-ui': ['clsx', 'lucide-react'],
          // Виртуализация списка сообщений — отдельный чанк, чтобы правки
          // ChatPage не инвалидировали кеш библиотеки у клиентов.
          'vendor-virtual': ['@tanstack/react-virtual'],
        },
      },
    },
    // Enable CSS code splitting
    cssCodeSplit: true,
    // Increase chunk size warning threshold (emoji-mart is large)
    chunkSizeWarningLimit: 600,
  },
  // PowerSync использует Web Workers — формат ES вместо IIFE
  worker: {
    format: 'es',
  },
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/uploads': {
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
});
