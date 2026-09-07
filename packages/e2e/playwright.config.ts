import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: '.',
  timeout: 30_000,
  use: { baseURL: 'http://127.0.0.1:4317', headless: true, trace: 'retain-on-failure' },
  webServer: { command: 'npm run build:static --workspace=build && node server.ts', port: 4317, reuseExistingServer: !process.env.CI },
  workers: 1,
})
