import vue from 'eslint-plugin-vue'
import vueTs from '@vue/eslint-config-typescript'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: ['dist/**', 'public/injected/**', 'node_modules/**', 'build-scripts/**', 'eslint.config.js']
  },
  ...tseslint.configs.recommended,
  ...vue.configs['flat/essential'],
  ...vueTs(),
  {
    files: ['src/**/*.{ts,vue}'],
    languageOptions: {
      globals: {
        chrome: 'readonly'
      }
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/ban-ts-comment': ['warn', { 'ts-nocheck': false, 'ts-ignore': true, 'ts-expect-error': false }],
      'vue/multi-word-component-names': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-useless-escape': 'off'
    }
  }
)
