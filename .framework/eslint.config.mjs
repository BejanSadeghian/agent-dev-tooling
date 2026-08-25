// Optional. `npm run lint` works without eslint installed — this config only
// matters if you choose to add it (`npm i -D eslint`), and it deliberately stays
// close to the house rules rather than importing a shared preset: this repo has no
// dependencies, and a lint config nobody can run on a fresh clone is decoration.
export default [
  {
    ignores: ['node_modules/**', '**/__pycache__/**', 'outputs/**', 'tmp/**'],
  },
  {
    files: ['**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        URL: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        structuredClone: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
      'no-undef': 'error',
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-constant-condition': ['error', { checkLoops: false }],
      'prefer-const': 'error',
      'no-var': 'error',
      eqeqeq: ['error', 'smart'],
    },
  },
];
