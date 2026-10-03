import js from '@eslint/js'
import pluginVue from 'eslint-plugin-vue'
import globals from 'globals'

export default [
  // Base JavaScript configuration
  js.configs.recommended,
  // Vue configuration
  ...pluginVue.configs['flat/recommended'],
  {
    files: ['resources/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
        module: 'readonly',
        exports: 'readonly',
        require: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        global: 'readonly'
      }
    }
  },
  {
    files: ['lib/**/*.js', 'bin/**/*.js', 'test/**/*.js', 'scripts/**/*.js', '*.js', '*.cjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        module: 'readonly',
        require: 'readonly',
        exports: 'readonly',
        global: 'readonly',

        // Test globals (Mocha)
        describe: 'readonly',
        it: 'readonly',
        before: 'readonly',
        after: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly'
      }
    },
    rules: {
      'no-case-declarations': 'off',
      'no-return-await': 'off',
      'no-return-assign': 'off',
      'prefer-const': 'error',
      'eqeqeq': 'error',
      'no-empty': ['error', { 'allowEmptyCatch': true }],
      'no-unused-vars': ['error', {
        'argsIgnorePattern': '^_',
        'varsIgnorePattern': '^_'
      }],
      'no-console': 'off',
      'no-global-assign': ['error', { exceptions: ['exports'] }],
      'indent': [
        'error',
        2,
        { 'SwitchCase': 1 }
      ],
      'linebreak-style': [
        'error',
        'unix'
      ],
      'quotes': [
        'error',
        'single'
      ],
      'semi': [
        'error',
        'never'
      ],
      'comma-dangle': [
        'error',
        'never'
      ]
    }
  },
  {
    files: ['src/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        global: 'readonly',

        // Browser globals
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        localStorage: 'readonly',
        sessionStorage: 'readonly',
        Vue: 'readonly',
        screen: 'readonly'
      }
    },
    rules: {
      'no-case-declarations': 'off',
      'no-return-await': 'off',
      'no-return-assign': 'off',
      'prefer-const': 'error',
      'eqeqeq': 'error',
      'no-empty': ['error', { 'allowEmptyCatch': true }],
      'no-unused-vars': ['error', {
        'argsIgnorePattern': '^_',
        'varsIgnorePattern': '^_'
      }],
      'no-console': 'off',
      'indent': [
        'error',
        2,
        { 'SwitchCase': 1 }
      ],
      'linebreak-style': [
        'error',
        'unix'
      ],
      'quotes': [
        'error',
        'single'
      ],
      'semi': [
        'error',
        'never'
      ],
      'comma-dangle': [
        'error',
        'never'
      ]
    }
  },
  {
    files: ['src/**/*.vue'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        localStorage: 'readonly',
        sessionStorage: 'readonly',
        Vue: 'readonly',
        screen: 'readonly'
      }
    },
    rules: {
      'vue/no-use-v-if-with-v-for': ['error', {
        'allowUsingIterationVar': false
      }],
      'vue/multi-word-component-names': 'off',
      'vue/require-v-for-key': 'off',
      'vue/no-v-html': 'off',
      'vue/require-prop-types': 'off',
      'vue/no-v-model-argument': 'off',
      'vue/require-default-prop': 'off',
      'vue/require-explicit-emits': 'error',
      'prefer-const': 'error',
      'eqeqeq': 'error',
      'vue/max-attributes-per-line': [
        'error',
        {
          'singleline': {
            'max': 10
          },
          'multiline': {
            'max': 10
          }
        }
      ],
      'vue/singleline-html-element-content-newline': 'off',
      'semi': ['error', 'never']
      ,
      // Enforce and autofix indentation in <script> blocks
      'vue/script-indent': ['error', 2, {
        'baseIndent': 1,
        'switchCase': 1,
        'ignores': []
      }]
    }
  },
  {
    files: ['test/frontend/**/*.js', 'vitest.config.mjs', 'vite.config.js', 'knip.config.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node, __dirname: 'readonly' }
    },
    rules: {
      'no-unused-vars': ['error', { 'argsIgnorePattern': '^_', 'varsIgnorePattern': '^_' }]
    }
  },
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'build/**',
      'logs/**',
      '.vite/**',
      'src/plugins/**',
      'resources/**/*.min.js',
      'coverage/**'
    ]
  }
]
