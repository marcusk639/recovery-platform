// ESLint flat config for regroup/functions (#113). It replaces tslint.json, whose
// rules crashed on TypeScript 5 ("rule threw an error"), so a clean tslint run
// proved little. Each tslint rule maps to its ESLint or typescript-eslint
// equivalent, with the same severity (errors fail `npm run lint`; tslint's
// warnings stay warnings). Not carried over: no-duplicate-super (no ESLint rule;
// TypeScript reports a missing super() but not a second one) and trailing-comma
// (configured with no options in tslint.json, so it checked nothing).
import tseslint from 'typescript-eslint';
import importPlugin from 'eslint-plugin-import';

export default tseslint.config(
  { ignores: ['lib/**', 'bin/**', 'coverage/**', 'test-shims/**', 'src/util/create-demo.ts'] },
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { project: './tsconfig.json', tsconfigRootDir: import.meta.dirname },
    },
    plugins: { '@typescript-eslint': tseslint.plugin, import: importPlugin },
    settings: { 'import/resolver': { node: { extensions: ['.ts', '.js', '.json'] } } },
    rules: {
      // tslint's errors
      '@typescript-eslint/adjacent-overload-signatures': 'error', // adjacent-overload-signatures
      'no-sequences': 'error', // ban-comma-operator
      '@typescript-eslint/no-namespace': 'error', // no-namespace
      'no-param-reassign': 'error', // no-parameter-reassignment
      '@typescript-eslint/triple-slash-reference': ['error', { path: 'never' }], // no-reference
      '@typescript-eslint/no-unnecessary-type-assertion': 'error', // no-unnecessary-type-assertion
      'no-labels': ['error', { allowLoop: true, allowSwitch: true }], // label-position
      'no-cond-assign': 'error', // no-conditional-assignment
      'no-new-wrappers': 'error', // no-construct
      'no-duplicate-case': 'error', // no-duplicate-switch-case
      '@typescript-eslint/no-redeclare': 'error', // no-duplicate-variable (check-parameters)
      '@typescript-eslint/no-shadow': 'error', // no-shadowed-variable
      'no-empty': ['error', { allowEmptyCatch: true }], // no-empty (allow-empty-catch)
      '@typescript-eslint/no-floating-promises': 'error', // no-floating-promises
      'import/no-extraneous-dependencies': 'error', // no-implicit-dependencies
      'no-invalid-this': 'error', // no-invalid-this
      '@typescript-eslint/only-throw-error': 'error', // no-string-throw
      'no-unsafe-finally': 'error', // no-unsafe-finally
      // no-void-expression (ignore-arrow-function-shorthand)
      '@typescript-eslint/no-confusing-void-expression': ['error', { ignoreArrowShorthand: true }],
      'no-duplicate-imports': 'error', // no-duplicate-imports
      // tslint's warnings
      '@typescript-eslint/no-empty-object-type': 'warn', // no-empty-interface
      'import/no-unassigned-import': 'warn', // no-import-side-effect
      'no-var': 'warn', // no-var-keyword
      eqeqeq: 'warn', // triple-equals
      '@typescript-eslint/no-deprecated': 'warn', // deprecation
      '@typescript-eslint/unified-signatures': 'warn', // unified-signatures
    },
  },
  {
    // Tests import devDependencies (jest, typescript) by design.
    files: ['src/**/__tests__/**/*.ts', 'src/**/*.test.ts'],
    rules: { 'import/no-extraneous-dependencies': ['error', { devDependencies: true }] },
  },
);
