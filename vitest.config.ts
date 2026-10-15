import { cloudflareTest } from '@cloudflare/vitest-plugin'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.jsonc' },
      miniflare: {
        bindings: {
          ENVIRONMENT: 'development',
          ADMIN_PASSWORD: 'test-admin-password',
          SESSION_SECRET: 'test-session-secret-that-is-at-least-32-chars',
        },
      },
    }),
  ],
  test: {
    include: ['tests/**/*.test.ts'],
    // Integration tests boot workerd; a busy machine can pass 5 s.
    testTimeout: 15_000,
  },
})
