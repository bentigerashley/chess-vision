import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [react(), VitePWA({ registerType: 'autoUpdate', workbox: { maximumFileSizeToCacheInBytes: 10 * 1024 * 1024 }, manifest: { name: 'Chess Vision', short_name: 'Chess Vision', display: 'standalone', theme_color: '#262421', background_color: '#262421', icons: [] } })],
})
