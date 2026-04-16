import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/upload': 'http://localhost:31208',
      '/download': 'http://localhost:31208',
      '/delete-files': 'http://localhost:31208',
      '/socket.io': {
        target: 'ws://localhost:31208',
        ws: true,
      },
    },
  },
})
