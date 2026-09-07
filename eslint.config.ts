import * as config from '@lvce-editor/eslint-config'
import { defineConfig } from 'eslint/config'

export default defineConfig([
  ...config.default,
  {
    files: ['packages/**/*.ts'],
    rules: {
      // DOM objects, recorder state and Playwright fixtures are intentionally mutable.
      '@typescript-eslint/prefer-readonly-parameter-types': 'off',
      // Promise chains preserve the recorder's shared flush promise and worker queue.
      'unicorn/prefer-await': 'off',
    },
  },
  {
    files: ['packages/e2e/**/*.ts'],
    rules: {
      'e2e/no-direct-click': 'off',
      // These are standalone Playwright tests, not LVCE command-runner tests.
      'e2e/no-imports': 'off',
      'sonarjs/assertions-in-tests': 'off',
      'unicorn/isolated-functions': 'off',
      'unicorn/no-global-object-property-assignment': 'off',
      'unicorn/prefer-global-this': 'off',
    },
  },
  {
    files: ['packages/session-replay-worker/src/worker.ts'],
    rules: {
      'unicorn/no-global-object-property-assignment': 'off',
      // This module owns the worker's state and message handler.
      'unicorn/no-top-level-assignment-in-function': 'off',
    },
  },
  {
    files: ['packages/session-replay-worker/src/api/{capture,player}.ts'],
    rules: {
      // The existing HTML/SVG allowlist has many literal alternatives.
      'sonarjs/regex-complexity': ['error', { threshold: 35 }],
      // Capture also visits XML elements, which have no dataset property.
      'unicorn/dom-node-dataset': ['error', { preferAttributes: true }],
    },
  },
  {
    ignores: ['**/playwright-report/**', '**/test-results/**'],
  },
])
