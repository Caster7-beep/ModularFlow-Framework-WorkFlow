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
    port: 3002,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:6502',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:6502',
        ws: true,
      },
    },
  },
})