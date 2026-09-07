import { defineConfig } from 'eslint/config'
import * as config from '@lvce-editor/eslint-config'

export default defineConfig([
  ...config.default,
  {
    ignores: ['**/playwright-report/**', '**/test-results/**'],
  },
])
