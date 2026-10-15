import { defineConfig, devices } from '@playwright/test'

const PORT = 5199
const STATE_DIR = '.wrangler/e2e-state'

export default defineConfig({
  testDir: './e2e',
  // Every spec drives the same venue room, so they run one after another.
  workers: 1,
  timeout: 60_000,
  use: { baseURL: `http://localhost:${PORT}`, trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // Every run starts from an empty room.
    command: `node -e "require('fs').rmSync('${STATE_DIR}',{recursive:true,force:true})" && pnpm dev --port ${PORT} --strictPort`,
    env: { KDS_STATE_DIR: STATE_DIR },
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
