import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { agentApi } from './server/plugin.ts'

export default defineConfig({
  plugins: [react(), tailwindcss(), agentApi()],
  resolve: {
    alias: {
      '@': new URL('./src', import.meta.url).pathname,
    },
  },
})
