import { cloudflare } from '@cloudflare/vite-plugin'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    cloudflare({
      // End-to-end runs keep their devices and orders out of the dev data.
      persistState: process.env.KDS_STATE_DIR
        ? { path: process.env.KDS_STATE_DIR }
        : true,
    }),
  ],
})
