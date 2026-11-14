/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  env: {
    node: true,
    jest: true,
    es2022: true,
  },
  ignorePatterns: ['dist/**', 'node_modules/**', 'coverage/**'],
  rules: {
    'no-constant-condition': 'error',
    'no-dupe-keys': 'error',
    'no-unreachable': 'error',
  },
};
