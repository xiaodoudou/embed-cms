const path = require('path')
const fs = require('fs')
const _ = require('lodash')
const crypto = require('crypto')


class ViteUtils {
  constructor () {
    this.isInNodeModules = __dirname.includes('/node_modules/embed-cms') || __dirname.includes('\\node_modules\\embed-cms')
    this.rootPath = path.join(__dirname, this.isInNodeModules ? '../../' : './')
    const pkgPath = path.join(this.rootPath, 'package.json')
    const pkg = require(pkgPath)
    this.serverPort = _.get(pkg, 'config.port', 9990)
    this.devPort = 10000 + this.serverPort
    this.baseUrl = 'http://localhost'
    this.websocketBaseUrl = 'ws://localhost'
    this.embedCmsMountPath = _.get(pkg, 'config.mountPath', '/')
    console.log(`Embed-cms mount path is: ${this.embedCmsMountPath}`)
    this.embedCmsSrcPath = path.resolve(__dirname, 'src')
    this.plugins = {
      toBuild: path.resolve(this.embedCmsSrcPath, 'plugins'),
      source: path.resolve(this.rootPath, 'embed-cms', 'plugins'),
      fallback: path.resolve(this.embedCmsSrcPath, '.plugins')
    }

    this.createPluginsSymlink()

    this.serverConfig = {
      origin: `${this.baseUrl}:${this.devPort}`,
      port: this.devPort,
      proxy: this.getProxy(),
      compress: false,
      fs: {
        allow: ['..'] // Allow serving files from one level up to the project root
      }
    }
  }

  /**
   * The Vite plugin that writes dist/kit.css: the design tokens (light and dark), the classes the admin shares with plugins and the UI kit in one stylesheet, served as
   * /admin/kit.css. A page that a plugin serves itself, or a plugin that styles its own shadow root, links it to get the look of the admin.
   * @returns {import('vite').Plugin}
   */
  kitStylesheetPlugin = () => {
    const styles = path.join(this.embedCmsSrcPath, 'styles')
    return {
      name: 'embed-cms-kit-stylesheet',
      apply: 'build',
      generateBundle () {
        const sass = require('sass')
        const compile = (name) => sass.compile(path.join(styles, name)).css
        const tokens = compile('tokens.scss')
        const primitives = compile('primitives.scss')
        const kit = compile('kit.scss')
        this.emitFile({
          type: 'asset',
          fileName: 'kit.css',
          source: `/* The design tokens and the UI kit of the embed-cms admin (docs/extending/PLUGIN_UI_KIT.md) */
${tokens}
${primitives}
${kit}`
        })
      }
    }
  }

  getAliasPath = (folderPath) => {
    return path.resolve(this.embedCmsSrcPath, folderPath)
  }

  /**
   * @param  {Object} aliasesMapping Configuration object for all vite aliases to resolve. All aliases starting with '@' will be prefixed with the embed-cms src path
   * @returns {Object} All aliases with resolved paths
   */
  resolveAliases = (aliasesMapping) => {
    return _.mapValues(aliasesMapping, (val, key) => _.startsWith(key, '@') ? this.getAliasPath(val) : val)
  }

  createPluginsSymlink = () => {
    // Skip symlink creation during static analysis tools like knip
    if (process.argv.some(arg => arg.includes('knip') || arg.includes('eslint'))) {
      console.log('Skipping symlink creation during static analysis')
      return
    }

    console.log(`Embed-cms is loaded ${this.isInNodeModules ? 'as a dependency' : 'directly'}`)
    if (fs.existsSync(this.plugins.fallback) === false) {
      throw new Error(`No .plugins folder found @ ${this.plugins.fallback}`)
    }
    // an earlier symlink is replaced, also when its target has gone (existsSync follows the link and says false then)
    if (_.attempt(() => fs.lstatSync(this.plugins.toBuild).isSymbolicLink()) === true) {
      console.log(`Found plugins folder symlink @ ${this.plugins.toBuild}`)
      fs.unlinkSync(this.plugins.toBuild)
    }
    if (!(this.isInNodeModules && fs.existsSync(this.plugins.source))) {
      console.log(`Will use fallback path ${this.plugins.fallback}`)
      this.plugins.source = this.plugins.fallback
    }
    fs.symlinkSync(this.plugins.source, this.plugins.toBuild)
    console.log(`Symlink created @ ${this.plugins.toBuild} -> ${this.plugins.source}`)
  }

  handleProxyCall = (proxyRoute, proxy) => {
    proxy.on('error', (err) => {
      console.error(`${proxyRoute} - Proxy error`, err)
    })
    // proxy.on('proxyReq', (proxyReq, req, _res) => {
    //   console.log(`${proxyRoute} - Sending Request to the Target:`, req.method, req.url)
    // })
    // proxy.on('proxyRes', (proxyRes, req, _res) => {
    //   console.log(`${proxyRoute} - Received Response from the Target:`, proxyRes.statusCode, req.url)
    // })
  }

  getProxy = () => {
    this.proxy = {}
    const regex = new RegExp(`^${this.embedCmsMountPath}admin`, 'g')
    const target = `${this.baseUrl}:${this.serverPort}${this.embedCmsMountPath}admin`
    _.set(this.proxy, `^${this.embedCmsMountPath}(cms|i18n|config|login|logout|resources)`, {
      target
    })
    _.set(this.proxy, `^${this.embedCmsMountPath}admin/(fonts)`, {
      target,
      configure: (proxy) => this.handleProxyCall(`^${this.embedCmsMountPath}admin/(fonts)`, proxy)
    })
    _.set(this.proxy, `^${this.embedCmsMountPath}(admin)`, {
      target,
      rewrite: (path) => path.replace(regex, ''),
      configure: (proxy) => this.handleProxyCall(`^${this.embedCmsMountPath}(admin)`, proxy)
    })
    _.set(this.proxy, `^${this.embedCmsMountPath}(api|import|importFromRemote|sync|replicator)`, {
      target: `${this.baseUrl}:${this.serverPort}`
    })
    _.set(this.proxy, '^/(socket)', {
      target: `${this.baseUrl}:${this.serverPort}`,
      configure: (proxy) => this.handleProxyCall(`${this.baseUrl}:${this.serverPort}`, proxy)
    })
    _.set(this.proxy, '^/(_updates)', {
      target: `${this.websocketBaseUrl}:${this.serverPort}`,
      configure: (proxy) => this.handleProxyCall(`${this.baseUrl}:${this.serverPort}`, proxy)
    })
    if (this.isInNodeModules && this.embedCmsMountPath !== '/') {
      _.set(this.proxy, '^/(api)', {
        target: `${this.baseUrl}:${this.serverPort}`
      })
    }
    _.each(this.proxy, (route) => {
      route.ws = true
      route.changeOrigin = true
    })
    // console.info('Proxy is', this.proxy)
    return this.proxy
  }
}

module.exports = {
  self: null,
  id: null,
  getInstance (baseUrl, pkg) {
    if (this.self === null) {
      this.id = crypto.randomUUID()
      this.self = new ViteUtils(baseUrl, pkg)
    }
    return this.self
  }
}
