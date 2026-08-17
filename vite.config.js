import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    proxy: {
      '/ml-api': {
        target: 'http://13.48.129.228:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/ml-api/, ''),
      },
    },
  },
})