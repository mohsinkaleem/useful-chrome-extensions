import js from '@eslint/js';
import globals from 'globals';
import svelte from 'eslint-plugin-svelte';

export default [
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'extension/**',
      'public/**',
      'background.js',
      '*.config.js'
    ]
  },
  js.configs.recommended,
  ...svelte.configs['flat/recommended'],
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.serviceworker,
        chrome: 'readonly'
      }
    },
    rules: {
      'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none' }],
      'no-console': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }],
      eqeqeq: ['error', 'smart']
    }
  },
  {
    files: ['test/**/*.js'],
    languageOptions: {
      globals: { ...globals.node }
    }
  }
];
