import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': '/src',
    },
  },
  server: {
    port: 3005,
    strictPort: false,
    proxy: {
      '/api': {
        target: 'http://localhost:6500',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:6500',
        ws: true,
      },
    },
  },
})