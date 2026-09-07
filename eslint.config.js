import { defineConfig } from 'eslint/config'
import * as config from '@lvce-editor/eslint-config'

export default defineConfig([
  ...config.default,
  {
    files: ['**/*.test.ts', 'packages/e2e/*.ts'],
    rules: {
      // Test fixtures and browser handles are intentionally mutable.
      '@typescript-eslint/prefer-readonly-parameter-types': 'off',
    },
  },
  {
    files: ['packages/e2e/*.ts'],
    languageOptions: {
      globals: { document: 'readonly', window: 'readonly' },
    },
    rules: {
      // These tests use Playwright directly and share state in the fixture page.
      'e2e/no-imports': 'off',
      'e2e/no-direct-click': 'off',
      'unicorn/no-global-object-property-assignment': 'off',
      'unicorn/prefer-global-this': 'off',
      'sonarjs/assertions-in-tests': 'off',
    },
  },
  {
    ignores: ['**/playwright-report/**', '**/test-results/**'],
  },
])
