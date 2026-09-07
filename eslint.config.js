import { defineConfig } from 'eslint/config'
import * as config from '@lvce-editor/eslint-config'

export default defineConfig([
  ...config.default,
  {
    files: ['**/*.test.ts'],
    rules: {
      // Recorder tests use mutable storage fixtures and fetch options.
      '@typescript-eslint/prefer-readonly-parameter-types': 'off',
    },
  },
  {
    ignores: ['**/playwright-report/**', '**/test-results/**'],
  },
  {
    files: ['packages/e2e/**/*.ts'],
    // These tests use Playwright directly, with mutable browser and server fixtures.
    rules: {
      '@typescript-eslint/prefer-readonly-parameter-types': 'off',
      'e2e/no-direct-click': 'off',
      'e2e/no-imports': 'off',
    },
  },
  {
    files: ['packages/e2e/**/*.spec.ts'],
    languageOptions: { globals: { document: 'readonly', window: 'readonly' } },
    rules: {
      // Playwright's expect.poll assertions are not recognized by this rule.
      'sonarjs/assertions-in-tests': 'off',
      'unicorn/no-global-object-property-assignment': 'off',
      'unicorn/prefer-global-this': 'off',
    },
  },
  {
    files: ['packages/e2e/server.ts'],
    rules: {
      // The request handler catches failures and sends an HTTP error response.
      '@typescript-eslint/no-misused-promises': 'off',
      'sonarjs/no-nested-conditional': 'off',
    },
  },
])
