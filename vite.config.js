import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true, // Listen on all local IP addresses (0.0.0.0) so other devices on Wi-Fi can connect
  },
})

