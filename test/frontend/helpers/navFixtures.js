// A small menu, as the app builds it: groups with their resources, a group of one (a page) and resources without a group (Others).
const resource = (title, group, extra = {}) => ({ title, name: title, displayname: { enUS: title.charAt(0).toUpperCase() + title.slice(1) }, group, ...extra })

export const orders = resource('orders', { enUS: 'Shop' })
export const products = resource('products', { enUS: 'Shop' })
export const returns = resource('returns', { enUS: 'Shop' })
export const pages = resource('pages', { enUS: 'Content' })
export const posts = resource('posts', { enUS: 'Content' })
export const settings = resource('settings', { enUS: 'Settings' })
export const notes = resource('notes', undefined)
export const syslog = { title: 'Syslog', name: 'Syslog', displayname: 'Syslog', type: 'plugin', pluginComponent: 'Syslog', group: undefined }

export const groupedList = () => [
  { name: 'TL_OTHERS', list: [notes] },
  { name: { enUS: 'Shop' }, list: [products, orders, returns] },
  { name: { enUS: 'Content' }, list: [posts, pages] },
  { name: { enUS: 'Settings' }, list: [settings] }
]
