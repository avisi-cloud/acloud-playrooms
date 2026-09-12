// @ts-check
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import angular from 'angular-eslint';

/**
 * Lint rules for the Playrooms frontend.
 *
 * The house style is described in `gui/doc/FRONTEND.md`; this file is the part
 * a machine can check. Prettier owns formatting — nothing here reformats code,
 * so the two never fight over the same line.
 */
export default tseslint.config(
  {
    // Generated and built output. `bindings/` in particular is produced by
    // `wails3 generate bindings` and must never be hand-edited, let alone
    // linted into a shape the generator would undo.
    ignores: ['dist/**', 'node_modules/**', '.angular/**', 'bindings/**'],
  },
  {
    files: ['**/*.ts'],
    extends: [
      eslint.configs.recommended,
      ...tseslint.configs.recommended,
      ...tseslint.configs.stylistic,
      ...angular.configs.tsRecommended,
    ],
    processor: angular.processInlineTemplates,
    rules: {
      '@angular-eslint/directive-selector': [
        'error',
        { type: 'attribute', prefix: 'app', style: 'camelCase' },
      ],
      '@angular-eslint/component-selector': [
        'error',
        { type: 'element', prefix: 'app', style: 'kebab-case' },
      ],

      // The naming rule this codebase is held to: a function name is a short
      // sentence about what the caller gets, so single words like `load` or
      // `set` do not survive review. Enforced where a machine can see it —
      // the rest is the convention in doc/FRONTEND.md.
      '@typescript-eslint/naming-convention': [
        'error',
        { selector: 'default', format: ['camelCase'], leadingUnderscore: 'allow' },
        { selector: 'typeLike', format: ['PascalCase'] },
        { selector: 'enumMember', format: ['PascalCase'] },
        // Backend DTOs come from Go structs with exported (PascalCase) fields,
        // and object literals carry PrimeNG and Wails keys we do not own.
        { selector: 'objectLiteralProperty', format: null },
        { selector: 'typeProperty', format: null },
        { selector: 'variable', format: ['camelCase', 'UPPER_CASE', 'PascalCase'] },
        // A default import keeps the name its own package chose (Aura).
        { selector: 'import', format: ['camelCase', 'PascalCase'] },
      ],

      // Unused code is dead code, but an intentionally ignored argument is not.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // Tests describe behaviour in sentences and reach for casts the app code
    // should not need.
    files: ['**/*.spec.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/naming-convention': 'off',
      // Test doubles are mostly empty members standing in for browser APIs.
      '@typescript-eslint/no-empty-function': 'off',
    },
  },
  {
    files: ['**/*.html'],
    extends: [...angular.configs.templateRecommended, ...angular.configs.templateAccessibility],
    rules: {
      // Known gap, deliberately not blocking. Every field label in the app is
      // a plain <label> beside its PrimeNG control rather than bound to it,
      // which a screen reader cannot associate. Fixing it means threading
      // `inputId` through roughly sixty controls across ten templates — real
      // work with real UI risk, and its own task rather than a side effect of
      // turning the linter on. Left as a warning so the count stays visible
      // and cannot quietly grow.
      '@angular-eslint/template/label-has-associated-control': 'warn',
      // Same call: a handful of clickable non-button elements (the toast body,
      // a console line, a room card) need a keyboard path and a focus stop.
      '@angular-eslint/template/click-events-have-key-events': 'warn',
      '@angular-eslint/template/interactive-supports-focus': 'warn',
    },
  },
);
