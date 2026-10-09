import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['dist/**', 'artifacts/**', 'test-results/**', 'node_modules/**'] },
  js.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node, __APP_VERSION__: 'readonly' },
    },
    // Legacy gameplay retains named callback arguments and local helpers.
    rules: { 'no-unused-vars': 'off', 'no-empty': ['error', { allowEmptyCatch: true }] },
  },
  {
    files: ['tests/**/*.mjs'],
    languageOptions: {
      globals: {
        __GAME__: 'readonly',
        __UI__: 'readonly',
        __INSPECTION__: 'readonly',
        robotSamples: 'readonly',
        testGraphicsExtension: 'readonly',
        casts: 'readonly',
        robotLoss: 'readonly',
        samplePose: 'writable',
        poseSamples: 'readonly',
      },
    },
  },
];
