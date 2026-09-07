import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './e2e',
  workers: 1,
  timeout: 30_000,
  use: { baseURL: 'http://127.0.0.1:4317', headless: true, trace: 'retain-on-failure' },
  webServer: { command: 'node e2e/server.js', port: 4317, reuseExistingServer: !process.env.CI },
})
