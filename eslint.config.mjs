import js from '@eslint/js';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import reactHooks from 'eslint-plugin-react-hooks';

const browserGlobals = {
  chrome: 'readonly',
  console: 'readonly',
  document: 'readonly',
  globalThis: 'readonly',
  indexedDB: 'readonly',
  navigator: 'readonly',
  setTimeout: 'readonly',
  URL: 'readonly',
  window: 'readonly'
};

const testGlobals = {
  afterEach: 'readonly',
  beforeEach: 'readonly',
  describe: 'readonly',
  expect: 'readonly',
  it: 'readonly',
  vi: 'readonly'
};

export default [
  {
    ignores: ['dist/**', 'node_modules/**']
  },
  js.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module'
      },
      globals: {
        ...browserGlobals,
        ...testGlobals
      }
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      'react-hooks': reactHooks
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      'no-undef': 'off',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn'
    }
  }
];
