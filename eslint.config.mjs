import js from '@eslint/js'
import globals from 'globals'
import prettier from 'eslint-config-prettier'

/**
 * Flat ESLint config.
 *
 * The codebase spans three environments and they need different globals:
 * the main process is CommonJS on Node, the renderer is ESM in a browser,
 * and the tests are a mix of both. Getting this wrong shows up as a flood
 * of bogus no-undef errors, so each tree is described explicitly.
 *
 * `prettier` comes last: it switches off every stylistic rule, leaving
 * formatting to Prettier and correctness to ESLint.
 */
export default [
  {
    ignores: ['node_modules/**', 'build/**', 'dist/**', 'docs/**'],
  },

  js.configs.recommended,

  // Main process, packaging and dev scripts: CommonJS on Node.
  {
    files: ['src/main/**/*.js', 'src/shared/**/*.js', 'scripts/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
  },

  // Renderer: ESM running in Electron's browser context.
  {
    files: ['src/renderer/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        // Exposed by the preload bridge, not by the DOM.
        notepad: 'readonly',
      },
    },
  },

  // Build config and ESM tests: modules on Node.
  {
    files: ['*.mjs', 'test/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node },
    },
  },

  // CommonJS tests.
  {
    files: ['test/**/*.test.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
  },

  // Project-wide rules, applied after the environment blocks above.
  {
    rules: {
      // An unused argument is often deliberate (an ignored event, a
      // positional placeholder); an unused local is usually a mistake.
      'no-unused-vars': [
        'error',
        {
          args: 'after-used',
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrors: 'none',
        },
      ],
      'no-console': 'off',
      eqeqeq: ['error', 'smart'],
      'no-var': 'error',
      'prefer-const': ['error', { destructuring: 'all' }],
      'no-implicit-coercion': ['error', { allow: ['!!'] }],
      'object-shorthand': ['error', 'properties'],
    },
  },

  prettier,
]
