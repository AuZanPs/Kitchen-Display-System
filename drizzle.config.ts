import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'sqlite',
  driver: 'durable-sqlite',
  schema: './src/worker/db/schema.ts',
  out: './src/worker/db/migrations',
})
