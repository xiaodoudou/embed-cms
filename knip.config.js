export default {
  entry: [
    // Resource files are dynamically loaded
    'resources/**/*.js',
    'docs/resourceExamples/**/*.js',
    // Plugins that are conditionally loaded based on options
    'lib/plugins/rest/index.js',
    'lib/plugins/admin/index.js',
    'lib/plugins/anonymousRead/index.js',
    'lib/plugins/authentication/index.js',
    'lib/plugins/replicator/index.js',
    'lib/plugins/rest/index.js',
    'lib/plugins/sync/index.js',
    'lib/plugins/xlsx/index.js',
    'lib/plugins/import/index.js',
    'lib/plugins/importFromRemote/index.js',
    // Test files may be run individually
    'test/**/*.js'
  ],
  project: [
    'src/**/*.{js,ts,vue}',
    'lib/**/*.js',
    'lib-import/**/*.js',
    'lib-importFromRemote/**/*.js',
    'resources/**/*.js',
    'docs/resourceExamples/**/*.js',
    'test/**/*.js',
    '*.js'
  ],
  ignore: [
    // Files we know are unused but want to keep
    'src/.plugins/js/main.js',
    // Type definitions kept as documentation (referenced from index.js)
    'lib/jsdoc-types.js',
    // Consumed as `FileType.fromBuffer(...)`, which knip cannot follow
    'lib/util/fileType.js',
    // exports the Logger class next to the shared instance; only the tests use the class
    'lib/logger.js',
    // used by the table view rework that is still in progress (see docs/UI_REDESIGN.md)
    'src/utils/tableModel.js',
    // statusFor is exported for its unit tests
    'lib/plugins/rest/sendError.js'
  ],
  // Path mapping to resolve Vite aliases
  paths: {
    '@c/*': ['src/components/*'],
    '@v/*': ['src/views/*'],
    '@s/*': ['src/services/*'],
    '@u/*': ['src/utils/*'],
    '@f/*': ['src/filters/*'],
    '@l/*': ['src/lib/*'],
    '@r/*': ['src/router/*'],
    '@m/*': ['src/mixins/*'],
    '@a/*': ['src/assets/*'],
    '@static/*': ['src/static/*'],
    '@p/*': ['src/plugins/*']
  },
  ignoreDependencies: [
    // Vue component aliases not properly resolved by Knip (temporary workaround)
    '@c/SystemInfo',
    '@c/BrandLogo',
    '@c/PreviewAttachment',
    '@c/Omnibar',
    '@c/ThemeSwitch',
    '@c/PreviewMultiple',
    '@c/FileInputErrors',
  ],
  // Ignore binaries that are referenced in package.json but not installed
  // exports only used inside their own file (and by tests) are fine
  ignoreExportsUsedInFile: true,
  ignoreBinaries: ['ulimit', 'mongod']
}
