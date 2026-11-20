/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended', 'prettier'],
  env: { node: true, es2022: true },
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  ignorePatterns: ['dist', '.next', 'node_modules', 'coverage', '*.config.js', '*.config.mjs'],
  rules: {
    '@typescript-eslint/no-unused-vars': [
      'error',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
    ],
    '@typescript-eslint/consistent-type-imports': 'error',
  },
  overrides: [
    {
      // Nest resolves constructor dependencies from runtime class references;
      // a type-only import would erase them.
      files: ['apps/api/**/*.ts'],
      rules: { '@typescript-eslint/consistent-type-imports': 'off' },
    },
  ],
};
