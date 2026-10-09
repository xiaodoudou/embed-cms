export default {
  entry: [
    // Resource files are dynamically loaded
    'resources/**/*.js',
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
    'bin/*.js',
    'resources/**/*.js',
    'test/**/*.js',
    '*.js'
  ],
  ignore: [
    // Type definitions kept as documentation (referenced from index.js)
    'lib/jsdocTypes.js',
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
  // Ignore binaries that are referenced in package.json but not installed
  // exports only used inside their own file (and by tests) are fine
  ignoreExportsUsedInFile: true,
  ignoreBinaries: ['ulimit', 'mongod'],
  // Screenshot scripts load it on demand and print an install hint when missing
  ignoreDependencies: ['playwright-core']
}
